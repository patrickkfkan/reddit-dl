import type Bottleneck from 'bottleneck';
import {
  type Post,
  type PostComment,
  type PostMedia,
  PostType
} from '../entities/Post';
import { type Subreddit } from '../entities/Subreddit';
import { type User } from '../entities/User';
import { Abortable, AbortError } from '../utils/Abortable';
import { SITE_URL } from '../utils/Constants';
import ObjectHelper from '../utils/ObjectHelper';
import { getPostIdFromURL, validateURL } from '../utils/URL';
import { type UserAPIConstructor } from './User';
import { FetcherError } from '../utils/Fetcher';
import { load as cheerioLoad } from 'cheerio';
import path from 'path';
import { type DownloadableImage } from '../entities/Common';
import { RedgifsFetcher } from '../utils/RedgifsFetcher';

const MAX_LIMIT = 100;
const REDDIT_IMAGE_DOMAIN = 'i.redd.it';
const REDDIT_VIDEO_DOMAIN = 'v.redd.it';
const KNOWN_BOGUS_THUMBNAIL_SOURCES = ['nsfw', 'spoiler', 'default'];

export interface FetchSavedItemsParams {
  user: User;
  after?: string;
  limit?: number;
}

export interface FetchPostsByUserParams {
  user: User;
  sortBy?: 'hot' | 'new' | 'top' | 'controversial';
  after?: string;
  limit?: number;
}

export interface FetchPostsBySubredditParams {
  subreddit: Subreddit;
  sortBy?: 'hot' | 'new' | 'top' | 'rising' | 'controversial';
  after?: string;
  limit?: number;
}

export interface FetchPostsResult {
  posts: Post<PostType>[];
  after: string | null;
  errorCount: number;
}

export interface FetchSavedItemsResult {
  items: (
    | { type: 'post'; post: Post<PostType> }
    | { type: 'postComment'; comment: PostComment; postId: string | null }
  )[];
  after: string | null;
  errorCount: number;
}

interface FetchCommentsStats {
  count: number;
  errorCount: number;
}

type MediaMetadata = Record<
  string,
  { image: DownloadableImage; thumbnail: DownloadableImage | null }
>;

export interface FetchPostCommentsResult {
  count: number;
  comments: PostComment[];
  errorCount: number;
}

export function PostAPIMixin<TBase extends UserAPIConstructor>(Base: TBase) {
  return class PostAPI extends Base {
    #fetchMoreCommentsLimiter: Bottleneck;
    #redgifsFetcher: RedgifsFetcher;

    constructor(...args: any[]) {
      super(...args);
      this.#fetchMoreCommentsLimiter = this.limiter.create(
        'postAPI.fetchMoreComments',
        {
          maxConcurrent: 1,
          minTime: 300
        }
      );
      this.#redgifsFetcher = new RedgifsFetcher(this.fetcher, this.logger);
    }

    async fetchPostById(id: string, fetchUser = true) {
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/comments/${id}.json`,
              params: {
                raw_json: '1',
                sr_detail: '1'
              },
              signal
            })
          )
        );
        if (!Array.isArray(data)) {
          throw new TypeError('data is not an array');
        }
        const children = ObjectHelper.getProperty(data[0], 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        if (!children[0]) {
          throw Error('No post data found');
        }
        return await Abortable.wrap(() =>
          this.#mapPostData(children[0], null, null, fetchUser)
        );
      } catch (error) {
        if (!(error instanceof AbortError)) {
          this.log('error', `Failed to fetch post by Id "${id}":`, error);
        }
        throw error;
      }
    }

    async fetchPostsByUser(
      params: FetchPostsByUserParams
    ): Promise<FetchPostsResult> {
      const { user, sortBy = 'new', after, limit = MAX_LIMIT } = params;
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/user/${user.username}/submitted.json`,
              params: {
                raw_json: '1',
                sr_detail: '1',
                sort: sortBy,
                limit: String(limit),
                after: after || null
              },
              signal
            })
          )
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const mappedPostResults = await Promise.all(
          children.map((child) =>
            Abortable.wrap(() => this.#mapPostData(child, user, null, false))
          )
        );
        const errorCount = mappedPostResults.reduce<number>(
          (result, { errorCount }) => result + errorCount,
          0
        );
        const posts = mappedPostResults
          .map(({ post }) => post)
          .filter((post) => post !== null);
        return {
          posts,
          errorCount,
          after: ObjectHelper.getProperty(data, 'data.after') || null
        };
      } catch (error) {
        if (!(error instanceof AbortError)) {
          this.log(
            'error',
            `Failed to fetch posts for user ${user.username}:`,
            error
          );
        }
        throw error;
      }
    }

    async fetchPostsBySubreddit(
      params: FetchPostsBySubredditParams
    ): Promise<FetchPostsResult> {
      const { subreddit, sortBy = 'new', after, limit = MAX_LIMIT } = params;
      const url = new URL(`https://www.reddit.com`);
      if (after) {
        url.searchParams.append('after', after);
      }
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/r/${subreddit.name}/${sortBy}.json`,
              params: {
                raw_json: '1',
                sr_detail: '1',
                limit: String(limit),
                after: after || null
              },
              signal
            })
          )
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw TypeError('data.children is not an array');
        }
        const mappedPostResults = await Promise.all(
          children.map((child) =>
            Abortable.wrap(() =>
              this.#mapPostData(
                child,
                null,
                subreddit,
                this.config.fetchPostAuthors
              )
            )
          )
        );
        const errorCount = mappedPostResults.reduce<number>(
          (result, { errorCount }) => result + errorCount,
          0
        );
        const posts = mappedPostResults
          .map(({ post }) => post)
          .filter((post) => post !== null);
        return {
          posts,
          errorCount,
          after: ObjectHelper.getProperty(data, 'data.after') || null
        };
      } catch (error) {
        if (!(error instanceof AbortError)) {
          this.log(
            'error',
            `Failed to fetch posts from subreddit ${subreddit.name}:`,
            error
          );
        }
        throw error;
      }
    }

    async fetchSavedItems(
      params: FetchSavedItemsParams
    ): Promise<FetchSavedItemsResult> {
      const { user, after, limit = MAX_LIMIT } = params;
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/user/${user.username}/saved.json`,
              params: {
                raw_json: '1',
                sr_detail: '1',
                limit: String(limit),
                after: after || null
              },
              signal
            })
          )
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const mappedPostResults = await Promise.all(
          children.map((child) =>
            Abortable.wrap(async () => {
              const kind = ObjectHelper.getProperty(child, 'kind');
              if (kind === 't1') {
                // t1: comment
                const linkId = ObjectHelper.getProperty(child, 'data.link_id');
                const postId =
                  typeof linkId === 'string' ?
                    linkId.startsWith('t3_') ?
                      linkId.substring(3)
                    : linkId
                  : null;
                const stats = { count: 0, errorCount: 0 };
                const comment = (
                  await this.#mapPostCommentData(postId, [child], stats, false)
                )[0];
                return {
                  item: {
                    type: 'postComment' as const,
                    comment: comment,
                    postId
                  },
                  errorCount: stats.errorCount
                };
              }
              // Post
              const { post, errorCount } = await this.#mapPostData(
                child,
                null,
                null,
                this.config.fetchPostAuthors
              );
              return {
                item: {
                  type: 'post' as const,
                  post
                },
                errorCount
              };
            })
          )
        );
        const errorCount = mappedPostResults.reduce<number>(
          (result, { errorCount }) => result + errorCount,
          0
        );
        const items = mappedPostResults.reduce<FetchSavedItemsResult['items']>(
          (result, { item }) => {
            switch (item.type) {
              case 'post': {
                if (item.post) {
                  result.push({
                    type: 'post',
                    post: item.post
                  });
                }
                break;
              }
              case 'postComment': {
                if (item.comment) {
                  result.push({
                    type: 'postComment',
                    comment: item.comment,
                    postId: item.postId
                  });
                }
              }
            }
            return result;
          },
          []
        );
        const dataAfter = ObjectHelper.getProperty(data, 'data.after') || null;

        return {
          items: items satisfies FetchSavedItemsResult['items'],
          errorCount,
          after: dataAfter
        };
      } catch (error) {
        if (!(error instanceof AbortError)) {
          this.log(
            'error',
            `Failed to fetch saved items for user ${user.username}:`,
            error
          );
        }
        throw error;
      }
    }

    async #mapPostData(
      data: any,
      user: User | null,
      subreddit: Subreddit | null,
      fetchUserIfNull: boolean
    ): Promise<{ post: Post<PostType> | null; errorCount: number }> {
      let errorCount = 0;
      try {
        if (!user) {
          const username = ObjectHelper.getProperty(data, 'data.author');
          if (!username) {
            throw Error('No username found');
          }
          if (fetchUserIfNull) {
            try {
              user = await Abortable.wrap(() => this.fetchUser(username));
            } catch (error) {
              if (error instanceof AbortError) {
                throw error;
              }
              const id = ObjectHelper.getProperty(data, 'data.id');
              this.log(
                'error',
                `${id ? `(${id}) ` : ''}Failed to fetch post author:`,
                error
              );
              errorCount++;
            }
          }
          if (!user) {
            user = {
              username,
              wasFetchedFromAPI: false,
              isSuspended: false,
              url: new URL(`/user/${username}/`, SITE_URL).toString(),
              title: username,
              description: '',
              avatar: null,
              banner: null,
              icon: null,
              karma: 0
            };
          }
        }
        const postId = ObjectHelper.getProperty(data, 'data.id', true);
        const postURLStr = ObjectHelper.getProperty(data, 'data.permalink');
        const postURL = postURLStr ? validateURL(postURLStr, SITE_URL) : false;
        if (!postURL) {
          this.log(
            'warn',
            `(${postId}) Post has invalid URL value "${postURLStr}"`
          );
        }
        const postHint = ObjectHelper.getProperty(data, 'data.post_hint');
        const crossPostParentList = ObjectHelper.getProperty(
          data,
          'data.crosspost_parent_list'
        );
        const mediaMetadata = this.#parseMediaMetadata(data);
        let postType: PostType =
          postHint === 'image' ? PostType.IMAGE
          : ObjectHelper.getProperty(data, 'data.is_gallery') === true ?
            PostType.GALLERY
          : postHint === 'rich:video' ? PostType.RICH_VIDEO
          : postHint === 'hosted:video' ? PostType.HOSTED_VIDEO
          : (
            postHint === 'self' ||
            ObjectHelper.getProperty(data, 'data.is_self') === true
          ) ?
            PostType.SELF
          : postHint === 'link' ? PostType.LINK
          : Array.isArray(crossPostParentList) && crossPostParentList[0] ?
            PostType.CROSS_POST
          : PostType.UNKNOWN;
        let media: Post<typeof postType>['media'] | null;
        if (postType === PostType.UNKNOWN) {
          // Sometimes post is removed by moderator but still has embed info that can
          // be treated as PostType.RICH_VIDEO
          if (
            ObjectHelper.getProperty(data, 'data.media.oembed.provider_name') &&
            ObjectHelper.getProperty(data, 'data.url')
          ) {
            postType = PostType.RICH_VIDEO;
          }
          // Likewise for PostType.IMAGE
          else if (
            ObjectHelper.getProperty(data, 'data.domain') ===
            REDDIT_IMAGE_DOMAIN
          ) {
            const url = ObjectHelper.getProperty(data, 'data.url');
            if (
              typeof url === 'string' &&
              url.startsWith(`https://${REDDIT_IMAGE_DOMAIN}`)
            ) {
              postType = PostType.IMAGE;
            }
          }
          // PostType.HOSTED_VIDEO
          else if (
            ObjectHelper.getProperty(data, 'data.domain') ===
            REDDIT_VIDEO_DOMAIN
          ) {
            const url = ObjectHelper.getProperty(data, 'data.url');
            if (
              typeof url === 'string' &&
              url.startsWith(`https://${REDDIT_VIDEO_DOMAIN}`)
            ) {
              postType = PostType.HOSTED_VIDEO;
            }
          }
          // PostType.LINK
          else if (ObjectHelper.getProperty(data, 'data.domain')) {
            const domain = ObjectHelper.getProperty(data, 'data.domain');
            const url = ObjectHelper.getProperty(data, 'data.url');
            const urlHostname =
              domain && validateURL(url, SITE_URL) ?
                new URL(url).hostname
              : null;
            if (
              urlHostname &&
              (urlHostname === domain || urlHostname.endsWith(`.${domain}`))
            ) {
              postType = PostType.LINK;
            }
          }
          // PostType.LINK -> Reddit post
          else if (ObjectHelper.getProperty(data, 'data.url')) {
            const url = ObjectHelper.getProperty(data, 'data.url');
            const postIdFromURL =
              typeof url === 'string' ? getPostIdFromURL(url) : null;
            if (postIdFromURL && postIdFromURL !== postId) {
              postType = PostType.LINK;
            }
          }
        }

        switch (postType) {
          case PostType.IMAGE: {
            const src = ObjectHelper.getProperty(data, 'data.url');
            const thumbnailSrc = ObjectHelper.getProperty(
              data,
              'data.thumbnail'
            );
            media =
              src ?
                ({
                  image: {
                    src
                  },
                  thumbnail:
                    (
                      thumbnailSrc &&
                      !KNOWN_BOGUS_THUMBNAIL_SOURCES.includes(thumbnailSrc)
                    ) ?
                      {
                        src: thumbnailSrc
                      }
                    : null
                } satisfies PostMedia<PostType.IMAGE>)
              : null;
            break;
          }
          case PostType.GALLERY: {
            const galleryData = ObjectHelper.getProperty(
              data,
              'data.gallery_data.items'
            );
            media =
              galleryData && mediaMetadata ?
                ((galleryData as Array<any>).reduce<
                  PostMedia<PostType.GALLERY>
                >((result, item: any) => {
                  const id = ObjectHelper.getProperty(item, 'media_id');
                  const mediaItem = id ? mediaMetadata[id] : null;
                  result.push(mediaItem);
                  return result;
                }, []) satisfies PostMedia<PostType.GALLERY>)
              : null;
            break;
          }
          case PostType.RICH_VIDEO: {
            const provider = ObjectHelper.getProperty(
              data,
              'data.media.oembed.provider_name'
            );
            const contentURL = ObjectHelper.getProperty(data, 'data.url');
            let thumbnailSrc: string | null = null;
            const extractedSrc: string | null = null;
            thumbnailSrc = ObjectHelper.getProperty(
              data,
              'data.media.oembed.thumbnail_url'
            );
            const embedHTML = ObjectHelper.getProperty(
              data,
              'data.media.oembed.html'
            );

            media =
              provider && contentURL ?
                ({
                  provider,
                  thumbnail:
                    thumbnailSrc ?
                      {
                        src: thumbnailSrc
                      }
                    : null,
                  content: {
                    url: contentURL,
                    extractedSrc: extractedSrc || undefined,
                    embedHTML
                  }
                } satisfies PostMedia<PostType.RICH_VIDEO>)
              : null;
            break;
          }
          case PostType.HOSTED_VIDEO: {
            const hls =
              ObjectHelper.getProperty(
                data,
                'data.media.reddit_video.hls_url'
              ) || null;
            const dash =
              ObjectHelper.getProperty(
                data,
                'data.media.reddit_video.dash_url'
              ) || null;
            const fallback =
              ObjectHelper.getProperty(
                data,
                'data.media.reddit_video.fallback_url'
              ) || null;
            const previewImages = ObjectHelper.getProperty(
              data,
              'data.preview.images'
            );
            const thumbnailSrc =
              Array.isArray(previewImages) ?
                ObjectHelper.getProperty(previewImages[0], 'source.url')
              : null;
            media =
              hls || dash || fallback ?
                ({
                  src: {
                    hls,
                    dash,
                    fallback
                  },
                  thumbnail:
                    thumbnailSrc ?
                      {
                        src: thumbnailSrc
                      }
                    : null
                } satisfies PostMedia<PostType.HOSTED_VIDEO>)
              : null;
            break;
          }
          default:
            media = null;
        }

        const rawSubredditId = ObjectHelper.getProperty(
          data,
          'data.subreddit_id',
          true
        );
        const subredditId =
          (
            typeof rawSubredditId === 'string' &&
            rawSubredditId.startsWith('t5_')
          ) ?
            rawSubredditId.substring(3)
          : rawSubredditId;
        const subredditURLStr = ObjectHelper.getProperty(
          data,
          'data.sr_detail.url'
        );
        const subredditURL =
          subredditURLStr ? validateURL(subredditURLStr, SITE_URL) : false;
        if (!subredditURL) {
          this.log(
            'warn',
            `(${subredditId}) Subreddit has invalid URL value "${subredditURLStr}"`
          );
        }

        const { count: commentCountAll, comments } = await Abortable.wrap(() =>
          this.fetchPostComments(postId)
        );

        const selfTextHTML =
          ObjectHelper.getProperty(data, 'data.selftext_html') || '';

        const post: Post<typeof postType> = {
          id: postId,
          type: postType,
          rawType: ObjectHelper.getProperty(data, 'data.post_hint') || '',
          url: postURL || '',
          title: ObjectHelper.getProperty(data, 'data.title') || '',
          content: {
            text: ObjectHelper.getProperty(data, 'data.selftext') || '',
            html: selfTextHTML,
            embeddedMedia:
              mediaMetadata ?
                this.#parseEmbeddedContentMedia(
                  postId,
                  selfTextHTML,
                  mediaMetadata
                )
              : null
          },
          createdUTC: ObjectHelper.getProperty(data, 'data.created_utc') || -1,
          removedBy:
            ObjectHelper.getProperty(data, 'data.removed_by_category') ||
            ObjectHelper.getProperty(data, 'data.removed_by') ||
            null,
          author: user,
          subreddit: subreddit || {
            id: subredditId,
            url: subredditURL || '',
            name:
              ObjectHelper.getProperty(data, 'data.sr_detail.display_name') ||
              '',
            title: ObjectHelper.getProperty(data, 'data.sr_detail.title') || '',
            shortDescription:
              ObjectHelper.getProperty(
                data,
                'data.sr_detail.public_description'
              ) || '',
            description:
              ObjectHelper.getProperty(data, 'data.sr_detail.description') ||
              '',
            header: this.mapDownloadableImage(
              data,
              'data.sr_detail.header_img'
            ),
            icon:
              this.mapDownloadableImage(
                data,
                'data.sr_detail.community_icon'
              ) || this.mapDownloadableImage(data, 'data.sr_detail.icon_img'),
            banner: this.mapDownloadableImage(data, 'data.sr_detail.banner_img')
          },
          media,
          upvotes: ObjectHelper.getProperty(data, 'data.ups') || 0,
          downvotes: ObjectHelper.getProperty(data, 'data.downs') || 0,
          commentCount: {
            all: commentCountAll,
            topLevel: comments.length
          },
          comments
        };
        if (postType === PostType.LINK) {
          const externalURL = ObjectHelper.getProperty(data, 'data.url');
          (post as Post<PostType.LINK>).content.externalURL =
            typeof externalURL === 'string' ?
              validateURL(externalURL, SITE_URL) || ''
            : '';
        }
        if (postType === PostType.CROSS_POST) {
          (post as Post<PostType.CROSS_POST>).crossPost = null;
          const crossPostData = crossPostParentList[0];
          if (crossPostData) {
            const { post: crossPost, errorCount: cpErrorCount } =
              await Abortable.wrap(() =>
                this.#mapPostData(
                  { data: crossPostData },
                  null,
                  null,
                  fetchUserIfNull
                )
              );
            if (!crossPost) {
              const id = ObjectHelper.getProperty(crossPostData, 'id');
              this.log(
                'warn',
                `${id ? `(${id}) ` : ''}Error processing cross post data`
              );
            } else {
              (post as Post<PostType.CROSS_POST>).crossPost = crossPost;
            }
            errorCount += cpErrorCount;
          }
        }
        return {
          post,
          errorCount
        };
      } catch (error) {
        if (error instanceof AbortError) {
          throw error;
        }
        const id = ObjectHelper.getProperty(data, 'data.id');
        this.log(
          'error',
          `${id ? `(${id}) ` : ''}Error mapping post data.`,
          error
        );
        return {
          post: null,
          errorCount: errorCount + 1
        };
      }
    }

    /**
     * Reddit API returns HLS playlists that have max resolution of 720p, even if
     * the original video has higher resolution (which you can see on the Reddit
     * website). To get higher-resolution videos, we fetch hybrid HTML and extract
     * the video URL from there.
     * @param postURL
     * @returns
     */
    async fetchHostedVideoURLFromHybridHTML(postId: string, postURL: string) {
      this.log(
        'debug',
        `(${postId}) Fetching hybrid HTML for post "${postURL}"...`
      );
      const { html } = await Abortable.wrap((signal) =>
        this.fetcher.fetchHTML({
          url: postURL,
          signal,
          hybrid: true
        })
      );
      const $ = cheerioLoad(html);
      const videoSrc = $(`shreddit-player-2[post-id="t3_${postId}"]`).attr(
        'src'
      );
      const videoSrcURL = videoSrc ? validateURL(videoSrc, SITE_URL) : null;
      if (!videoSrcURL) {
        throw Error(
          `No video src found in hybrid HTML (raw value: ${videoSrc})`
        );
      }
      const isHLSPlaylist = new URL(videoSrcURL).pathname.endsWith('.m3u8');
      if (isHLSPlaylist) {
        this.log('debug', `Found HLS video src in hybrid HTML: ${videoSrcURL}`);
        return videoSrcURL;
      }
      throw Error(
        `Found video src in hybrid HTML, but it is not HLS: ${videoSrcURL}`
      );
    }

    fetchRedgifsData(postId: string, contentURL: string, signal: AbortSignal) {
      return this.#redgifsFetcher.fetch(postId, contentURL, signal);
    }

    #parseMediaMetadata(data: any): MediaMetadata | null {
      const mediaMetadata = ObjectHelper.getProperty(
        data,
        'data.media_metadata'
      );
      if (!mediaMetadata || typeof mediaMetadata !== 'object') {
        return null;
      }
      const result: MediaMetadata = {};
      for (const [id, mediaItem] of Object.entries(mediaMetadata)) {
        const src =
          mediaItem ?
            ObjectHelper.getProperty(mediaItem, 's.u') ||
            ObjectHelper.getProperty(mediaItem, 's.gif')
          : null;
        const previewImages =
          mediaItem ? ObjectHelper.getProperty(mediaItem, 'p') : null;
        const thumbnailSrc =
          Array.isArray(previewImages) ?
            ObjectHelper.getProperty(previewImages.at(-1), 'u') || null
          : null;
        if (src) {
          result[id] = {
            image: { src },
            thumbnail: thumbnailSrc ? { src: thumbnailSrc } : null
          };
        }
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    #parseEmbeddedContentMedia(
      postId: string,
      html: string,
      metadata: MediaMetadata
    ) {
      try {
        const $ = cheerioLoad(html);
        const mediaIds = Object.keys(metadata);
        const foundIds = $('a')
          .map((_i, _el) => {
            const el = $(_el);
            const href = el.attr('href');
            if (href) {
              const url = validateURL(href, SITE_URL);
              if (url) {
                const id = path.parse(url).name;
                if (mediaIds.includes(id)) {
                  return id;
                }
              }
            }
            return null;
          })
          .toArray()
          .filter((id) => id !== null);
        if (foundIds.length > 0) {
          const result = foundIds.map((id) => ({ id, ...metadata[id] }));
          this.log(
            'debug',
            `(${postId}) Post content has ${foundIds.length} embedded media`
          );
          return result;
        }
        this.log(
          'debug',
          `(${postId}) No embedded media found in post content`
        );
        return null;
      } catch (error) {
        this.log(
          'debug',
          `(${postId}) Failed to parse embedded content media:`,
          error
        );
        return null;
      }
    }

    async fetchPostComments(postId: string): Promise<FetchPostCommentsResult> {
      if (!this.config.fetchComments) {
        return {
          count: 0,
          comments: [],
          errorCount: 0
        };
      }
      this.log('debug', `Fetching comments for post "${postId}"...`);
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          Abortable.wrap((signal) =>
            this.fetcher.fetchAPI({
              endpoint: `/comments/${postId}.json`,
              params: {
                raw_json: '1'
              },
              signal
            })
          )
        );
        if (!Array.isArray(data)) {
          throw new TypeError('data is not an array');
        }
        const children = ObjectHelper.getProperty(data[1], 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const stats = { count: 0, errorCount: 0 };
        const comments = await this.#mapPostCommentData(
          postId,
          children,
          stats
        );
        this.log(
          'debug',
          `Fetched ${stats.count} comments for post "${postId}"`
        );
        return {
          count: stats.count,
          comments,
          errorCount: stats.errorCount
        };
      } catch (error) {
        if (!(error instanceof AbortError)) {
          this.log(
            'error',
            `Failed to fetch comments for post "${postId}":`,
            error
          );
        }
        return {
          count: 0,
          comments: [],
          errorCount: 1
        };
      }
    }

    async #mapPostCommentData(
      postId: string | null,
      children: any[],
      stats: FetchCommentsStats,
      mapReplies = true
    ) {
      return children.reduce<Promise<PostComment[]>>(async (_result, child) => {
        const result = await _result;
        const isMore = ObjectHelper.getProperty(child, 'kind') === 'more';
        if (isMore) {
          const more = ObjectHelper.getProperty(child, 'data.children');
          if (!Array.isArray(more)) {
            this.log(
              'warn',
              `More comments expected, but data.children is not an array`
            );
          } else if (more.length > 0 && postId) {
            result.push(
              ...(await Abortable.wrap(() =>
                this.#fetchMorePostComments(postId, more, stats)
              ))
            );
          }
        } else {
          const permalink = ObjectHelper.getProperty(child, 'data.permalink');
          const url = permalink ? validateURL(permalink, SITE_URL) : false;
          const repliesData =
            mapReplies ?
              ObjectHelper.getProperty(child, 'data.replies.data.children')
            : null;
          const replies =
            Array.isArray(repliesData) ?
              await this.#mapPostCommentData(postId, repliesData, stats)
            : [];
          result.push({
            id: ObjectHelper.getProperty(child, 'data.id') || '',
            url: url || '',
            author: ObjectHelper.getProperty(child, 'data.author') || '',
            createdUTC: ObjectHelper.getProperty(child, 'data.created_utc'),
            content: {
              text: ObjectHelper.getProperty(child, 'data.body') || '',
              html: ObjectHelper.getProperty(child, 'data.body_html') || ''
            },
            upvotes: ObjectHelper.getProperty(child, 'data.ups') || 0,
            downvotes: ObjectHelper.getProperty(child, 'data.downs') || 0,
            replies,
            replyCount: replies.length
          });
          stats.count++;
        }
        return result;
      }, Promise.resolve([]));
    }

    async #fetchMorePostComments(
      postId: string,
      children: string[],
      stats: FetchCommentsStats
    ): Promise<PostComment[]> {
      // Per API documentation, only 100 items may be requested per call.
      const chunkSize = 100;
      if (children.length > chunkSize) {
        const chunks: Array<string[]> = [];
        for (let i = 0; i < children.length; i += chunkSize) {
          chunks.push(children.slice(i, i + chunkSize));
        }
        const fetchedBatches = await Promise.all(
          chunks.map((chunk) =>
            this.#fetchMorePostComments(postId, chunk, stats)
          )
        );
        return fetchedBatches.reduce(
          (result, batch) => result.concat(batch),
          []
        );
      }
      this.log('debug', `Fetching more comments for post "${postId}"...`);
      try {
        const { json: data } = await this.#fetchMoreCommentsLimiter.schedule(
          () =>
            Abortable.wrap((signal) =>
              this.fetcher.fetchAPI({
                endpoint: `/api/morechildren`,
                params: {
                  raw_json: '1',
                  api_type: 'json',
                  link_id: `t3_${postId}`,
                  children: children.join(',')
                },
                signal,
                requiresAuth: true
              })
            )
        );
        const things = ObjectHelper.getProperty(data, 'json.data.things');
        if (!Array.isArray(things)) {
          throw new TypeError('json.data.things is not an array');
        }
        return await this.#mapPostCommentData(postId, things, stats);
      } catch (error) {
        if (!(error instanceof AbortError)) {
          if (
            error instanceof FetcherError &&
            error.statusCode === FetcherError.NO_AUTH
          ) {
            return [];
          } else {
            this.log(
              'error',
              `Failed to fetch more comments for post "${postId}":`,
              error
            );
            stats.errorCount++;
          }
        }
        return [];
      }
    }
  };
}
