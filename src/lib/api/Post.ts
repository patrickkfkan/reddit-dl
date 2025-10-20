import type Bottleneck from 'bottleneck';
import { type Post, type PostComment, type PostType } from '../entities/Post';
import { type Subreddit } from '../entities/Subreddit';
import { type User } from '../entities/User';
import { Abortable, isAbortError } from '../utils/Abortable';
import { SITE_URL } from '../utils/Constants';
import ObjectHelper from '../utils/ObjectHelper';
import { validateURL } from '../utils/URL';
import { type UserAPIConstructor } from './User';
import { FetcherError } from '../utils/Fetcher';
import { load as cheerioLoad } from 'cheerio';
import { RedgifsFetcher } from '../utils/RedgifsFetcher';

const MAX_LIMIT = 100;

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

export interface FetchCommentsStats {
  count: number;
  errorCount: number;
}

export interface FetchPostCommentsResult {
  count: number;
  comments: PostComment[];
  errorCount: number;
}

export type PostAPIConstructor = new (
  ...args: any[]
) => InstanceType<ReturnType<typeof PostAPIMixin<UserAPIConstructor>>>;

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
          this.fetcher.fetchAPI({
            endpoint: `/comments/${id}.json`,
            params: {
              raw_json: '1',
              sr_detail: '1'
            }
          })
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
          fetchUser ?
            this.parser.parsePost(
              children[0],
              null,
              null,
              fetchUser,
              (postId) => this.fetchPostComments(postId),
              (username) => this.fetchUser(username)
            )
          : this.parser.parsePost(
              children[0],
              null,
              null,
              fetchUser,
              (postId) => this.fetchPostComments(postId)
            )
        );
      } catch (error) {
        if (!isAbortError(error)) {
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
          this.fetcher.fetchAPI({
            endpoint: `/user/${user.username}/submitted.json`,
            params: {
              raw_json: '1',
              sr_detail: '1',
              sort: sortBy,
              limit: String(limit),
              after: after || null
            }
          })
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const mappedPostResults = await Promise.all(
          children.map((child) =>
            Abortable.wrap(() =>
              this.parser.parsePost(child, user, null, false, (postId) =>
                this.fetchPostComments(postId)
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
        if (!isAbortError(error)) {
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
          this.fetcher.fetchAPI({
            endpoint: `/r/${subreddit.name}/${sortBy}.json`,
            params: {
              raw_json: '1',
              sr_detail: '1',
              limit: String(limit),
              after: after || null
            }
          })
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw TypeError('data.children is not an array');
        }
        const mappedPostResults = await Promise.all(
          children.map((child) =>
            Abortable.wrap(() =>
              this.config.fetchPostAuthors ?
                this.parser.parsePost(
                  child,
                  null,
                  subreddit,
                  true,
                  (postId) => this.fetchPostComments(postId),
                  (username) => this.fetchUser(username)
                )
              : this.parser.parsePost(child, null, subreddit, false, (postId) =>
                  this.fetchPostComments(postId)
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
        if (!isAbortError(error)) {
          this.log(
            'error',
            `Failed to fetch posts from subreddit ${subreddit.name}:`,
            error
          );
        }
        throw error;
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
      const { html } = await this.fetcher.fetchHTML({
        url: postURL,
        hybrid: true
      });
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

    fetchRedgifsData(postId: string, contentURL: string) {
      return this.#redgifsFetcher.fetch(postId, contentURL);
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
          this.fetcher.fetchAPI({
            endpoint: `/comments/${postId}.json`,
            params: {
              raw_json: '1'
            }
          })
        );
        if (!Array.isArray(data)) {
          throw new TypeError('data is not an array');
        }
        const children = ObjectHelper.getProperty(data[1], 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const stats = { count: 0, errorCount: 0 };
        const comments = await this.parser.parsePostComment(
          postId,
          children,
          stats,
          (postId, more, stats) =>
            this.fetchMorePostComments(postId, more, stats)
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
        if (!isAbortError(error)) {
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

    async fetchMorePostComments(
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
            this.fetchMorePostComments(postId, chunk, stats)
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
            this.fetcher.fetchAPI({
              endpoint: `/api/morechildren`,
              params: {
                raw_json: '1',
                api_type: 'json',
                link_id: `t3_${postId}`,
                children: children.join(',')
              },
              requiresAuth: true
            })
        );
        const things = ObjectHelper.getProperty(data, 'json.data.things');
        if (!Array.isArray(things)) {
          throw new TypeError('json.data.things is not an array');
        }
        return await this.parser.parsePostComment(
          postId,
          things,
          stats,
          (postId, more, stats) =>
            this.fetchMorePostComments(postId, more, stats)
        );
      } catch (error) {
        if (!isAbortError(error)) {
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
