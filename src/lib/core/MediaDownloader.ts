import { existsSync } from 'fs';
import {
  type RedditDownloaderConstructor,
  type LocalDownloadStats,
  type TargetDownloadStats
} from '../RedditDownloader';
import { normalizeRedditImageURL } from '../utils/URL';
import path from 'path';
import { getDuplicateMediaCheckerRef } from '../utils/DuplicateMediaCheckerRef';
import { type Post, type PostType } from '../entities/Post';
import { type Downloaded } from '../entities/Common';
import FSHelper from '../utils/FSHelper';
import { Abortable } from '../utils/Abortable';
import { type User } from '../entities/User';
import { type Subreddit } from '../entities/Subreddit';

export type DownloadImageContext =
  | {
      entityType: 'post';
      post: Post<PostType>;
      imageType: 'full' | 'thumbnail';
      index: number;
    }
  | {
      entityType: 'user';
      user: User;
      imageType: 'avatar' | 'banner' | 'icon';
    }
  | {
      entityType: 'subreddit';
      subreddit: Subreddit;
      imageType: 'header' | 'icon' | 'banner';
    };

export type DownloadMediaResult =
  | {
      status: 'downloaded' | 'skippedDuplicate';
      duplicateCheckerRef: string;
      downloadPath: string;
    }
  | {
      status: 'skippedError';
      error: any;
    }
  | {
      status: 'skippedWarning';
      message: string;
    };

export type MediaDownloaderConstructor = new (
  ...args: any[]
) => InstanceType<
  ReturnType<typeof MediaDownloaderMixin<RedditDownloaderConstructor>>
>;

export function MediaDownloaderMixin<TBase extends RedditDownloaderConstructor>(
  Base: TBase
) {
  return class MediaDownloaderBase extends Base {
    protected async downloadImage(
      src: string,
      context: DownloadImageContext
    ): Promise<DownloadMediaResult> {
      let normalizedSrc: string;
      let ext: string;
      try {
        normalizedSrc = normalizeRedditImageURL(src);
        ext = path.parse(new URL(normalizedSrc).pathname).ext;
      } catch (error) {
        this.log('error', `Error normalizing image URL "${src}":`, error);
        return {
          status: 'skippedError',
          error
        };
      }
      let filename, destFilePath;
      let duplicateMediaCheckerRefFn: (file: string) => Promise<string>;
      switch (context.entityType) {
        case 'post': {
          filename = this.#getPostMediaFilename(
            context.post,
            context.index,
            ext
          );
          const dir = await (context.imageType === 'full' ?
            this.fsHelper.mkdirForPostMedia(context.post)
          : this.fsHelper.mkdirForPostMediaThumbnails(context.post));
          destFilePath = path.resolve(dir, filename);
          duplicateMediaCheckerRefFn = (file: string) =>
            getDuplicateMediaCheckerRef({
              refType: 'sha256sum',
              domain:
                context.imageType === 'full' ?
                  'postMedia'
                : 'postMediaThumbnail',
              post: context.post,
              file
            });
          break;
        }
        case 'user': {
          filename = `${context.imageType}${ext}`;
          destFilePath = path.resolve(
            await this.fsHelper.mkdirForUserProfileMedia(context.user),
            filename
          );
          duplicateMediaCheckerRefFn = (file: string) =>
            getDuplicateMediaCheckerRef({
              refType: 'sha256sum',
              domain: 'userProfile',
              user: context.user,
              file
            });
          break;
        }
        case 'subreddit': {
          filename = `${context.imageType}${ext}`;
          destFilePath = path.resolve(
            await this.fsHelper.mkdirForSubredditInfoMedia(context.subreddit),
            filename
          );
          duplicateMediaCheckerRefFn = (file: string) =>
            getDuplicateMediaCheckerRef({
              refType: 'sha256sum',
              domain: 'subredditInfo',
              subreddit: context.subreddit,
              file
            });
          break;
        }
      }
      if (existsSync(destFilePath) && !this.config.overwrite) {
        this.log('debug', `Skipping existing image file "${destFilePath}"`);
        return Promise.resolve({
          status: 'skippedDuplicate',
          duplicateCheckerRef: await duplicateMediaCheckerRefFn(destFilePath),
          downloadPath: this.toRelativePath(destFilePath)
        });
      }
      try {
        const fetcher = await this.getFetcher();
        const db = await this.getDB();
        this.log('debug', 'Downloading image...');
        return await this.defaultLimiter.schedule(() =>
          (async () => {
            const { tmpFilePath, commit, discard } = await Abortable.wrap(
              (signal) =>
                fetcher.downloadFile({
                  src: normalizedSrc,
                  dest: destFilePath,
                  signal
                })
            );
            const ref = await duplicateMediaCheckerRefFn(tmpFilePath);
            const { downloadPath: dbDownloadPath } =
              db.getMediaByDuplicateCheckerRef(ref) || {};
            const fullDBDownloadPath =
              dbDownloadPath ? this.toAbsolutePath(dbDownloadPath) : null;
            if (
              dbDownloadPath &&
              fullDBDownloadPath &&
              existsSync(fullDBDownloadPath)
            ) {
              this.log(
                'debug',
                `Duplicate media found in DB: "${ref}" -> "${fullDBDownloadPath}"`
              );
              discard();
              return {
                status: 'skippedDuplicate',
                duplicateCheckerRef: ref,
                downloadPath: dbDownloadPath
              };
            }
            this.log('debug', `Downloaded "${destFilePath}"`);
            commit();
            return {
              status: 'downloaded',
              duplicateCheckerRef: ref,
              downloadPath: this.toRelativePath(destFilePath)
            };
          })()
        );
      } catch (error) {
        if (this.isErrorNonContinuable(error)) {
          throw error;
        }
        this.log(
          'error',
          `Error downloading ${context.imageType} image "${destFilePath}" from "${src}": `,
          error
        );
        return {
          status: 'skippedError',
          error
        };
      }
    }

    protected async downloadVideo(
      src: string,
      context: { post: Post<PostType>; index: number },
      customDuplicateCheckerRef: string | null = null
    ): Promise<DownloadMediaResult> {
      const filename = this.#getPostMediaFilename(
        context.post,
        context.index,
        '.mp4'
      );
      const destFilePath = path.resolve(
        await this.fsHelper.mkdirForPostMedia(context.post),
        filename
      );
      if (existsSync(destFilePath) && !this.config.overwrite) {
        this.log('debug', `Skipping existing video file "${destFilePath}"`);
        return Promise.resolve({
          status: 'skippedDuplicate',
          duplicateCheckerRef:
            customDuplicateCheckerRef ||
            (await getDuplicateMediaCheckerRef({
              refType: 'sha256sum',
              domain: 'postMedia',
              post: context.post,
              file: destFilePath
            })),
          downloadPath: this.toRelativePath(destFilePath)
        });
      }
      try {
        const fetcher = await this.getFetcher();
        const db = await this.getDB();
        this.log('debug', 'Downloading video...');
        return await this.defaultLimiter.schedule(() =>
          (async () => {
            const { tmpFilePath, commit, discard } = await Abortable.wrap(
              (signal) =>
                fetcher.downloadVideo({
                  src,
                  dest: destFilePath,
                  signal
                })
            );
            const ref =
              customDuplicateCheckerRef ||
              (await getDuplicateMediaCheckerRef({
                refType: 'sha256sum',
                domain: 'postMedia',
                post: context.post,
                file: tmpFilePath
              }));
            const { downloadPath: dbDownloadPath } =
              db.getMediaByDuplicateCheckerRef(ref) || {};
            const fullDBDownloadPath =
              dbDownloadPath ? this.toAbsolutePath(dbDownloadPath) : null;
            if (
              dbDownloadPath &&
              fullDBDownloadPath &&
              existsSync(fullDBDownloadPath)
            ) {
              this.log(
                'debug',
                `Duplicate media found in DB: "${ref}" -> "${fullDBDownloadPath}"`
              );
              discard();
              return {
                status: 'skippedDuplicate',
                duplicateCheckerRef: ref,
                downloadPath: dbDownloadPath
              };
            }
            this.log('debug', `Downloaded "${destFilePath}"`);
            commit();
            return {
              status: 'downloaded',
              duplicateCheckerRef: ref,
              downloadPath: this.toRelativePath(destFilePath)
            };
          })()
        );
      } catch (error) {
        if (this.isErrorNonContinuable(error)) {
          throw error;
        }
        this.log(
          'error',
          `Error downloading "${destFilePath}" from "${src}": `,
          error
        );
        return {
          status: 'skippedError',
          error
        };
      }
    }

    protected async downloadRichVideo(
      content: { url: string; provider: string; extractedSrc?: string },
      context: { post: Post<PostType>; index: number }
    ): Promise<DownloadMediaResult> {
      const filename = this.#getPostMediaFilename(
        context.post,
        context.index,
        '.mp4'
      );
      const destFilePath = path.resolve(
        await this.fsHelper.mkdirForPostMedia(context.post),
        filename
      );
      const ref = await getDuplicateMediaCheckerRef({
        refType: 'url',
        domain: 'postMedia',
        post: context.post,
        url: content.url
      });
      if (existsSync(destFilePath) && !this.config.overwrite) {
        this.log('debug', `Skipping existing video file "${destFilePath}"`);
        return Promise.resolve({
          status: 'skippedDuplicate',
          duplicateCheckerRef: ref,
          downloadPath: this.toRelativePath(destFilePath)
        });
      }
      switch (content.provider.toLowerCase()) {
        case 'redgifs': {
          const db = await this.getDB();
          const { downloadPath: dbDownloadPath } =
            db.getMediaByDuplicateCheckerRef(ref) || {};
          const fullDBDownloadPath =
            dbDownloadPath ? this.toAbsolutePath(dbDownloadPath) : null;
          if (
            dbDownloadPath &&
            fullDBDownloadPath &&
            existsSync(fullDBDownloadPath)
          ) {
            this.log(
              'debug',
              `Duplicate media found in DB: "${ref}" -> "${fullDBDownloadPath}"`
            );
            return Promise.resolve({
              status: 'skippedDuplicate',
              duplicateCheckerRef: ref,
              downloadPath: dbDownloadPath
            });
          }
          try {
            if (content.extractedSrc) {
              return await this.downloadVideo(
                content.extractedSrc,
                context,
                ref
              );
            }
            this.log(
              'warn',
              `Skipping video download - Redgifs src unavailable`
            );
            return {
              status: 'skippedWarning',
              message: `Skipping video download - Redgifs src unavailable`
            };
            break;
          } catch (error) {
            if (this.isErrorNonContinuable(error)) {
              throw error;
            }
            this.log(
              'error',
              `Error fetching Redgifs video from ${content.url}: `,
              error
            );
            return {
              status: 'skippedError',
              error
            };
          }
        }
        default:
          this.log(
            'warn',
            'Skipping video download - unknown content provider: ',
            content.provider
          );
          return {
            status: 'skippedWarning',
            message: `Skipping video download - unknown content provider: ${content.provider}`
          };
      }
    }

    #getPostMediaFilename(
      post: Post<PostType>,
      mediaIndex: number,
      ext: string
    ) {
      return FSHelper.getFilenameForPost(post, {
        suffix: `_${mediaIndex}`,
        ext
      });
    }

    protected updateStatsOnDownloadMedia<S extends LocalDownloadStats<any>>(
      result: DownloadMediaResult,
      targetStats: TargetDownloadStats,
      localStats: S,
      localStatsKey: keyof S
    ) {
      switch (result.status) {
        case 'downloaded':
          localStats[localStatsKey].downloaded++;
          targetStats.downloadedMediaCount++;
          break;
        case 'skippedDuplicate':
          localStats[localStatsKey].skippedDuplicate++;
          break;
        case 'skippedError':
          localStats[localStatsKey].skippedError++;
          this.updateTargetStatsOnError(result.error, targetStats);
          break;
        case 'skippedWarning':
          localStats[localStatsKey].skippedWarning++;
          targetStats.warningCount++;
          break;
      }
    }

    protected toRelativePath(p: string) {
      return path.relative(this.config.dataDir, p);
    }

    protected toAbsolutePath(p: string) {
      return path.resolve(this.config.dataDir, p);
    }

    protected isDownloaded(data: { downloaded?: Downloaded | null }) {
      if (!data.downloaded) {
        return false;
      }
      return existsSync(this.toAbsolutePath(data.downloaded.path));
    }
  };
}
