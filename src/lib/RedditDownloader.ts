import {
  type DownloaderMode,
  type DownloaderOptions,
  type DownloadModeConfig,
  getDownloadModeConfig
} from './DownloaderOptions.js';
import Fetcher, { FetcherError } from './utils/Fetcher.js';
import { type LogLevel } from './utils/logging/Logger.js';
import type Logger from './utils/logging/Logger.js';
import { commonLog } from './utils/logging/Logger.js';
import { type Post, type PostType } from './entities/Post.js';
import { type Subreddit } from './entities/Subreddit.js';
import { type User } from './entities/User.js';
import DB, { type DBInstance } from './db/index.js';
import Session from './utils/Session.js';
import { MediaDownloaderMixin } from './core/MediaDownloader.js';
import { UserProcessorMixin } from './core/UserProcessor.js';
import { SubredditProcessorMixin } from './core/SubredditProcessor.js';
import {
  PostProcessorMixin,
  type ProcessPostParams
} from './core/PostProcessor.js';
import API, { type APIInstance } from './api/index.js';
import FSHelper from './utils/FSHelper.js';
import { Abortable, AbortError } from './utils/Abortable.js';
import { getPostIdFromURL } from './utils/URL.js';
import { type ResolvedTarget } from './entities/Target.js';
import Limiter from './utils/Limiter.js';
import type Bottleneck from 'bottleneck';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { DEFAULT_LIMITER_NAME } from './utils/Constants.js';

export type DownloadTargetType =
  | 'userGalleries'
  | 'galleryFolder'
  | 'gallery'
  | 'photo'
  | 'favorites'
  | 'favoritesFolder';

export interface DownloaderStartParams {
  signal?: AbortSignal;
}

export interface TargetDownloadStats {
  processedPostCount: number;
  downloadedMediaCount: number;
  errorCount: number;
  warningCount: number;
}

export type LocalDownloadStats<K extends string[]> = {
  [key in K[number]]: {
    downloaded: number;
    skippedDuplicate: number;
    skippedError: number;
    skippedWarning: number;
  };
};

type TargetResult =
  | {
      name: string;
      processed: false;
    }
  | {
      name: string;
      processed: true;
      result: 'Done' | 'Aborted by user' | 'Aborted - unhandled error';
    };

export type RedditDownloaderConstructor = new (
  ...args: any[]
) => RedditDownloaderBase;

export class RedditDownloaderBase {
  name = 'RedditDownloader';

  #fetcher: Fetcher | null;
  #getFetcherPromise: Promise<Fetcher> | null;

  #api: APIInstance | null;
  #getAPIPromise: Promise<APIInstance> | null;

  #db: DBInstance | null;
  #getDBPromise: Promise<DBInstance> | null;

  protected limiter: Limiter;
  protected defaultLimiter: Bottleneck;
  protected config: DownloadModeConfig;
  protected fsHelper: FSHelper;
  protected logger?: Logger | null;
  protected session: Session;

  constructor(
    target: string | string[],
    options?: DownloaderOptions<DownloaderMode.DOWNLOAD>
  ) {
    this.#validateOptions(options);

    this.config = getDownloadModeConfig(
      !Array.isArray(target) ? [target] : target,
      options
    );

    this.#fetcher = null;
    this.#getFetcherPromise = null;

    this.#db = null;
    this.#getDBPromise = null;

    this.#api = null;
    this.#getAPIPromise = null;

    this.limiter = new Limiter();
    this.defaultLimiter = this.limiter.create(DEFAULT_LIMITER_NAME, {
      maxConcurrent: this.config.request.maxConcurrent,
      minTime: this.config.request.minTime
    });

    this.fsHelper = new FSHelper(this.config);
    this.logger = options?.logger;
    this.session = new Session();

    if (this.config.pathToFFmpeg) {
      ffmpeg.setFfmpegPath(this.config.pathToFFmpeg);
    }
  }

  #validateOptions(options?: DownloaderOptions<DownloaderMode.DOWNLOAD>) {
    if (!options) {
      return true;
    }

    // Check FFmpeg path exists
    if (options.pathToFFmpeg) {
      if (!fs.existsSync(options.pathToFFmpeg)) {
        throw Error(
          `Path to FFmpeg executable "${options.pathToFFmpeg}" does not exist`
        );
      } else if (!fs.lstatSync(options.pathToFFmpeg).isFile()) {
        throw Error(
          `Path to FFmpeg executable "${options.pathToFFmpeg}" does not point to a file`
        );
      }
    }

    // Check dataDir is a directory
    if (options.dataDir) {
      if (
        fs.existsSync(options.dataDir) &&
        !fs.lstatSync(options.dataDir).isDirectory()
      ) {
        throw Error(`"${options.dataDir}" is not a directory`);
      }
    }

    return true;
  }

  protected async getFetcher() {
    if (this.#fetcher) {
      return this.#fetcher;
    }
    if (this.#getFetcherPromise) {
      return this.#getFetcherPromise;
    }
    this.#getFetcherPromise = Fetcher.getInstance(this.config).then(
      (fetcher) => {
        this.#fetcher = fetcher;
        this.#getFetcherPromise = null;
        return fetcher;
      }
    );
    return this.#getFetcherPromise;
  }

  protected async getAPI() {
    if (this.#api) {
      return this.#api;
    }
    if (this.#getAPIPromise) {
      return this.#getAPIPromise;
    }
    this.#getAPIPromise = this.getFetcher().then((fetcher) => {
      this.#api = new API(this.config, fetcher, this.limiter, this.logger);
      this.#getAPIPromise = null;
      if (this.config.fetchComments && !this.config.oauth) {
        this.log(
          'warn',
          '"--comments" option enabled but no authentication credentials provided. Full access to comments may be restricted.'
        );
      }
      return this.#api;
    });
    return this.#getAPIPromise;
  }

  protected async getDB() {
    if (this.#db) {
      return this.#db;
    }
    if (this.#getDBPromise) {
      return this.#getDBPromise;
    }
    this.#getDBPromise = this.fsHelper
      .getDBFilePath()
      .then((dbFile) => DB.getInstance(dbFile, this.logger))
      .then((db) => {
        this.#db = db;
        this.#getDBPromise = null;
        return this.#db;
      });
    return this.#getDBPromise;
  }

  async start(params: DownloaderStartParams): Promise<void> {
    const combinedStats = this.#getEmptyStats();
    const targetResults = this.config.targets.map<TargetResult>((target) => ({
      name: target,
      processed: false
    }));
    const __updateTargetResult = (result: TargetResult) => {
      const resultIndex = targetResults.findIndex(
        (r) => r.name === result.name
      );
      if (resultIndex >= 0) {
        targetResults[resultIndex] = result;
      }
    };

    try {
      if (params.signal) {
        params.signal.onabort = () => {
          Abortable.abortAll();
        };
      }
      for (const target of this.config.targets) {
        const stats = this.#getEmptyStats();
        let abortDueToUnhandledError = false;
        try {
          await this.#process(target, stats);
          this.log('info', 'Download complete');
          __updateTargetResult({
            name: target,
            processed: true,
            result: 'Done'
          });
        } catch (error: any) {
          if (!params.signal?.aborted) {
            this.log('error', 'Unhandled error: ', error);
            this.updateTargetStatsOnError(error, stats);
            abortDueToUnhandledError = true;
            __updateTargetResult({
              name: target,
              processed: true,
              result: 'Aborted - unhandled error'
            });
          } else {
            __updateTargetResult({
              name: target,
              processed: true,
              result: 'Aborted by user'
            });
          }
          throw error;
        } finally {
          this.logEmptyLine();
          let header: string;
          if (params.signal?.aborted) {
            header = `Abort signal received while processing target "${target}"`;
          } else if (abortDueToUnhandledError) {
            header = `Target "${target}" aborted due to unhandled error`;
          } else {
            header = `Done processing target "${target}"`;
          }
          this.logTargetDownloadStats(stats, header);
          combinedStats.processedPostCount += stats.processedPostCount;
          combinedStats.downloadedMediaCount += stats.downloadedMediaCount;
          combinedStats.errorCount += stats.errorCount;
          combinedStats.warningCount += stats.warningCount;
          Abortable.clear();
        }
      }
    } catch (_error) {
      const __clearLimiters = () => this.limiter.clear();
      if (params.signal?.aborted) {
        await __clearLimiters();
        this.log('info', 'Download aborted');
      } else {
        await __clearLimiters();
      }
    }
    if (targetResults.length > 1) {
      this.logEmptyLine();
      this.log('info', 'Target summary');
      this.log('info', '--------------');
      targetResults.forEach((result, index) => {
        this.log(
          'info',
          `${index + 1}. ${result.name} -> ${!result.processed ? 'Not processed' : result.result}`
        );
      });
      this.logEmptyLine();
      const processedCount = targetResults.filter(
        (result) => result.processed
      ).length;
      this.logTargetDownloadStats(
        combinedStats,
        `Total ${processedCount} targets processed`
      );
    }
  }

  getConfig() {
    return this.config;
  }

  protected processUser(_user: User, _stats: TargetDownloadStats) {
    // To be fulfilled by mixin
    return Promise.resolve(_user);
  }

  protected processSubreddit(
    _subreddit: Subreddit,
    _stats: TargetDownloadStats
  ) {
    // To be fulfilled by mixin
    return Promise.resolve(_subreddit);
  }

  protected processPost(
    params: ProcessPostParams
  ): Promise<{ continue: boolean; processedPost: Post<PostType> | null }> {
    // To be fulfilled by mixin
    return Promise.resolve({
      continue: true,
      processedPost: params.post
    });
  }

  async #process(target: string, stats: TargetDownloadStats) {
    const runTimestamp = new Date().getTime();
    const postId =
      getPostIdFromURL(target) ||
      (target.startsWith('p/') ? target.replace('p/', '') : null);
    const targetType =
      postId ? 'post'
      : target.startsWith('u/') ? 'user'
      : target.startsWith('r/') ? 'subreddit'
      : null;
    const api = await this.getAPI();
    const db = await this.getDB();
    switch (targetType) {
      case 'post': {
        const _postId = postId as string;
        this.log('info', `Fetching post "${_postId}"...`);
        const { post, errorCount } = await Abortable.wrap(() =>
          api.fetchPostById(_postId, true)
        );
        stats.errorCount += errorCount;

        if (!post) {
          break;
        }

        const resolvedTarget: ResolvedTarget = {
          type: 'post',
          rawValue: target,
          runTimestamp,
          post
        };

        this.log('info', `#0 - (${post.id}) ${post.title}`);
        const { processedPost } = await Abortable.wrap(() =>
          this.processPost({
            post,
            stats,
            processAuthor: true,
            processSubreddit: true,
            isBatch: false
          })
        );

        if (processedPost) {
          resolvedTarget.post = processedPost;
          if (this.config.saveTargetToDB) {
            db.saveTarget(resolvedTarget);
            this.log('info', `Saved target info`);
          }
          stats.processedPostCount++;
        }
        break;
      }
      case 'user': {
        const userPath = target.replace(/^u\//, '');
        const isSaved = userPath.endsWith('/saved');
        const cleanUsername =
          isSaved ? userPath.replace(/\/saved$/, '') : userPath;
        this.log('info', `Fetching user profile for "${cleanUsername}"...`);
        let user = await Abortable.wrap(() => api.fetchUser(cleanUsername));

        const resolvedTarget = {
          type: isSaved ? 'user_saved' : 'user_submitted',
          rawValue: target,
          runTimestamp,
          user
        } as Extract<ResolvedTarget, { type: 'user_submitted' | 'user_saved' }>;
        if (this.config.saveTargetToDB) {
          db.saveTarget(resolvedTarget);
          this.log('info', `Saved target info`);
        }

        resolvedTarget.user = user = await Abortable.wrap(() =>
          this.processUser(user, stats)
        );

        // Need to save target again because user would now have downloaded
        // image info
        if (this.config.saveTargetToDB) {
          db.saveTarget(resolvedTarget);
        }

        let firstRun = true;
        let continuation: string | undefined = undefined;
        let processed = 0;
        let counter = 1;
        const associatedPostIds: string[] = [];
        while (firstRun || continuation) {
          if (this.#postLimitReached(processed)) {
            return;
          }
          this.log(
            'info',
            `Fetching ${firstRun ? '' : 'next batch of '}${isSaved ? 'saved ' : ''}posts for "${target}"...`
          );
          firstRun = false;
          const { posts, errorCount, after } = await Abortable.wrap(() =>
            isSaved ?
              api.fetchSavedPostsByUser({ user, after: continuation })
            : api.fetchPostsByUser({ user, after: continuation })
          );
          stats.errorCount += errorCount;
          if (posts.length === 0) {
            this.log(
              'warn',
              `No ${firstRun ? '' : 'more '} ${isSaved ? 'saved ' : ''}posts found for "${target}"`
            );
            break;
          }
          for (const post of posts) {
            if (this.#postLimitReached(processed)) {
              return;
            }
            this.log('info', `#${counter} - (${post.id}) ${post.title}`);
            const { continue: cont, processedPost } = await Abortable.wrap(() =>
              this.processPost({
                post,
                stats,
                processAuthor: isSaved,
                processSubreddit: true,
                isBatch: true
              })
            );
            counter++;
            if (processedPost) {
              processed++;
              stats.processedPostCount++;
              if (isSaved) {
                associatedPostIds.push(processedPost.id);
              }
            }
            if (!cont) {
              return;
            }
          }
          continuation = after || undefined;
        }
        if (isSaved && this.config.saveTargetToDB && associatedPostIds.length) {
          const targetId = `user.saved:${user.username}`;
          db.addPostsToTarget(targetId, associatedPostIds);
        }
        break;
      }
      case 'subreddit': {
        const subredditName = target.replace('r/', '');
        this.log('info', `Fetching subreddit info for "${subredditName}"...`);
        let subreddit = await Abortable.wrap(() =>
          api.fetchSubreddit(subredditName)
        );

        const resolvedTarget: ResolvedTarget = {
          type: 'subreddit_posts',
          rawValue: target,
          runTimestamp,
          subreddit
        };
        if (this.config.saveTargetToDB) {
          db.saveTarget(resolvedTarget);
          this.log('info', `Saved target info`);
        }

        resolvedTarget.subreddit = subreddit = await Abortable.wrap(() =>
          this.processSubreddit(subreddit, stats)
        );

        // Need to save target again because subreddit would now have downloaded
        // image info
        if (this.config.saveTargetToDB) {
          db.saveTarget(resolvedTarget);
        }

        let firstRun = true;
        let continuation: string | undefined = undefined;
        let processed = 0;
        let counter = 1;
        while (firstRun || continuation) {
          if (this.#postLimitReached(processed)) {
            return;
          }
          this.log(
            'info',
            `Fetching ${firstRun ? '' : 'next batch of '}posts in "${target}"...`
          );
          firstRun = false;
          const { posts, errorCount, after } = await Abortable.wrap(() =>
            api.fetchPostsBySubreddit({
              subreddit,
              after: continuation
            })
          );
          stats.errorCount += errorCount;
          if (posts.length === 0) {
            this.log(
              'warn',
              `No ${firstRun ? '' : 'more '} posts found in "${target}"`
            );
            break;
          }
          for (const post of posts) {
            if (this.#postLimitReached(processed)) {
              return;
            }
            this.log('info', `#${counter} - (${post.id}) ${post.title}`);
            const { continue: cont, processedPost } = await Abortable.wrap(() =>
              this.processPost({
                post,
                stats,
                processAuthor: true,
                processSubreddit: false,
                isBatch: true
              })
            );
            counter++;
            if (processedPost) {
              processed++;
              stats.processedPostCount++;
            }
            if (!cont) {
              return;
            }
          }
          continuation = after || undefined;
        }
        break;
      }

      default:
        throw Error(`Unknown target "${target}"`);
    }
  }

  #postLimitReached(processed: number) {
    if (this.config.limit !== null && processed >= this.config.limit) {
      this.log('info', '** Specified post limit reached **');
      return true;
    }
    return false;
  }

  protected isErrorNonContinuable(error: any, signal?: AbortSignal) {
    return (
      signal?.aborted ||
      error instanceof AbortError ||
      (error instanceof FetcherError && error.fatal)
    );
  }

  #getEmptyStats(): TargetDownloadStats {
    return {
      processedPostCount: 0,
      downloadedMediaCount: 0,
      errorCount: 0,
      warningCount: 0
    };
  }

  updateTargetStatsOnError(error: any, stats: TargetDownloadStats) {
    if (!(error instanceof Error) || error.message !== 'LimiterStopOnError') {
      stats.errorCount++;
    }
  }

  protected logLocalDownloadStats(stats: LocalDownloadStats<any>) {
    for (const key in stats) {
      const stat = stats[key];
      if (stat.downloaded > 0) {
        this.log('info', `:: - ${stat.downloaded} ${key} downloaded`);
      }
      if (stat.skippedDuplicate > 0) {
        this.log(
          'info',
          `:: - ${stat.skippedDuplicate} duplicate ${key} skipped`
        );
      }
      if (stat.skippedError > 0 || stat.skippedWarning > 0) {
        this.log(
          'warn',
          `:: - ${stat.skippedError + stat.skippedWarning} ${key} failed to download`
        );
      }
    }
  }

  protected logTargetDownloadStats(stats: TargetDownloadStats, header: string) {
    this.log('info', header);
    this.log('info', '-'.repeat(header.length));
    this.log('info', `Processed posts: ${stats.processedPostCount}`);
    this.log('info', `Downloaded media: ${stats.downloadedMediaCount}`);
    this.log('info', `Errors: ${stats.errorCount}`);
    this.log('info', `Warnings: ${stats.warningCount}`);
    this.logEmptyLine();
  }

  protected log(level: LogLevel, ...msg: any[]) {
    const limiterStopOnError = msg.find(
      (m) => m instanceof Error && m.message === 'LimiterStopOnError'
    );
    if (limiterStopOnError) {
      return;
    }
    commonLog(this.logger, level, this.name, ...msg);
  }

  protected logEmptyLine() {
    this.logger?.log(null);
  }
}

const RedditDownloader = PostProcessorMixin(
  SubredditProcessorMixin(
    UserProcessorMixin(MediaDownloaderMixin(RedditDownloaderBase))
  )
);

export default RedditDownloader;
