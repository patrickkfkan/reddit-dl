import { load as cheerioLoad } from 'cheerio';
import { type Subreddit } from '../../entities/Subreddit';
import { type User } from '../../entities/User';
import {
  type Post,
  type PostComment,
  type PostMedia,
  PostType
} from '../../entities/Post';
import { Abortable, AbortError } from '../../utils/Abortable';
import { SITE_URL } from '../../utils/Constants';
import ObjectHelper from '../../utils/ObjectHelper';
import { getPostIdFromURL, validateURL } from '../../utils/URL';
import { type FetchCommentsStats, type FetchPostCommentsResult } from '../Post';
import { type DownloadableImage } from '../../entities/Common';
import path from 'path';
import { type APIDataParserConstructor } from './APIDataParser';

const REDDIT_IMAGE_DOMAIN = 'i.redd.it';
const REDDIT_VIDEO_DOMAIN = 'v.redd.it';
const KNOWN_BOGUS_THUMBNAIL_SOURCES = ['nsfw', 'spoiler', 'default'];

type MediaMetadata = Record<
  string,
  { image: DownloadableImage; thumbnail: DownloadableImage | null }
>;

export function PostParserMixin<TBase extends APIDataParserConstructor>(
  Base: TBase
) {
  return class PostParser extends Base {
    async parsePost(
      data: any,
      user: User | null,
      subreddit: Subreddit | null,
      fetchUserIfNull: false,
      fetchCommentsFn: (postId: string) => Promise<FetchPostCommentsResult>,
      fetchUserFn?: undefined
    ): Promise<{ post: Post<PostType> | null; errorCount: number }>;
    async parsePost(
      data: any,
      user: User | null,
      subreddit: Subreddit | null,
      fetchUserIfNull: true,
      fetchCommentsFn: (postId: string) => Promise<FetchPostCommentsResult>,
      fetcherUserFn: (username: string) => Promise<User>
    ): Promise<{ post: Post<PostType> | null; errorCount: number }>;
    async parsePost(
      data: any,
      user: User | null,
      subreddit: Subreddit | null,
      fetchUserIfNull: boolean,
      fetchCommentsFn: (postId: string) => Promise<FetchPostCommentsResult>,
      fetchUserFn?: (username: string) => Promise<User>
    ): Promise<{ post: Post<PostType> | null; errorCount: number }> {
      let errorCount = 0;
      try {
        if (!user) {
          const username = ObjectHelper.getProperty(data, 'data.author');
          if (!username) {
            throw Error('No username found');
          }
          if (fetchUserIfNull && fetchUserFn) {
            try {
              user = await Abortable.wrap(() => fetchUserFn(username));
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
          fetchCommentsFn(postId)
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
                fetchUserIfNull ?
                  this.parsePost(
                    { data: crossPostData },
                    null,
                    null,
                    fetchUserIfNull,
                    fetchCommentsFn,
                    fetchUserFn as (username: string) => Promise<User>
                  )
                : this.parsePost(
                    { data: crossPostData },
                    null,
                    null,
                    fetchUserIfNull,
                    fetchCommentsFn
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

    async parsePostComment(
      postId: string | null,
      children: any[],
      stats: FetchCommentsStats,
      fetchMoreCommentsFn: (
        postId: string,
        more: any[],
        stats: FetchCommentsStats
      ) => Promise<PostComment[]>,
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
                fetchMoreCommentsFn(postId, more, stats)
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
              await this.parsePostComment(
                postId,
                repliesData,
                stats,
                fetchMoreCommentsFn
              )
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
  };
}
