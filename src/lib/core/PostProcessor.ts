import { type Post, PostType } from '../entities/Post';
import {
  type TargetDownloadStats,
  type LocalDownloadStats
} from '../RedditDownloader';
import { type DownloadableImage } from '../entities/Common';
import { type MediaDownloaderConstructor } from './MediaDownloader';
import { Abortable, AbortError } from '../utils/Abortable';
import { getPostIdFromURL } from '../utils/URL';
import { DELETED_USER } from '../utils/Constants';
import { utcSecondsToDate } from '../utils/Misc';

export interface ProcessPostParams {
  post: Post<PostType>;
  stats: TargetDownloadStats;
  processAuthor: boolean;
  processSubreddit: boolean;
  ignoreContinueConditions?: boolean;
  isBatch: boolean;
}

export type ProcessPostResult = {
  continue: boolean;
  processedPost: Post<PostType> | null;
};

export function PostProcessorMixin<TBase extends MediaDownloaderConstructor>(
  Base: TBase
) {
  return class PostProcessorBase extends Base {
    async processPost(
      params: ProcessPostParams & { ignoreContinueConditions: true }
    ): Promise<ProcessPostResult & { processedPost: Post<PostType> }>;
    async processPost(params: ProcessPostParams): Promise<ProcessPostResult>;
    async processPost(params: ProcessPostParams) {
      const {
        post,
        stats,
        processAuthor,
        processSubreddit,
        ignoreContinueConditions = false,
        isBatch
      } = params;
      if (!ignoreContinueConditions) {
        if (
          this.config.after &&
          utcSecondsToDate(post.createdUTC).getTime() < this.config.after
        ) {
          this.log(
            'info',
            `:: Post created at ${utcSecondsToDate(post.createdUTC).toLocaleString()} is before the specified "after" date/time ${new Date(this.config.after).toLocaleString()} - skipping`
          );
          if (isBatch) {
            this.log(
              'info',
              `:: Not going to continue with subsequent posts because they will all be before the "after" date`
            );
          }
          return {
            continue: false,
            processedPost: null
          };
        }
        if (
          this.config.before &&
          utcSecondsToDate(post.createdUTC).getTime() >= this.config.before
        ) {
          this.log(
            'info',
            `:: Post created at ${utcSecondsToDate(post.createdUTC).toLocaleString()} is after or equal to the specified "before" date/time ${new Date(this.config.before).toLocaleString()} - skipping`
          );
          return {
            continue: true,
            processedPost: null
          };
        }
      }
      const db = await this.getDB();
      const dbPost = db.getPost(post.id);
      if (dbPost && this.config.continue && !ignoreContinueConditions) {
        this.log(
          'info',
          ':: Previously downloaded - not proceeding further because "--continue" option was specified'
        );
        return {
          continue: false,
          processedPost: dbPost
        };
      }
      if (processAuthor) {
        post.author = await Abortable.wrap(() => {
          if (
            post.author.username === DELETED_USER.username &&
            dbPost &&
            this.config.overwrite &&
            !this.config.overwriteDeleted
          ) {
            this.log(
              'info',
              ':: Keeping previously-saved author info because current points to deleted user'
            );
            return Promise.resolve(dbPost.author);
          }
          return this.processUser(post.author, stats);
        });
      }
      if (processSubreddit) {
        post.subreddit = await Abortable.wrap(() =>
          this.processSubreddit(post.subreddit, stats)
        );
      }
      if (
        post.removedBy &&
        dbPost &&
        this.config.overwrite &&
        !this.config.overwriteDeleted
      ) {
        this.log(
          'info',
          `:: Keeping previously-saved post data because current is marked as deleted`
        );
        return {
          continue: true,
          processedPost: dbPost
        };
      }
      if (!this.config.overwrite && dbPost && this.#postMediaExists(dbPost)) {
        this.log('info', `:: Post data already exists in DB`);
        return {
          continue: true,
          processedPost: dbPost
        };
      }
      const localStats: LocalDownloadStats<['images', 'videos']> = {
        images: {
          downloaded: 0,
          skippedDuplicate: 0,
          skippedError: 0,
          skippedWarning: 0
        },
        videos: {
          downloaded: 0,
          skippedDuplicate: 0,
          skippedError: 0,
          skippedWarning: 0
        }
      };
      const __downloadImage = async (
        image: DownloadableImage,
        imageType: 'full' | 'thumbnail',
        index: number
      ) => {
        if (imageType === 'thumbnail' && image.src === 'image') {
          // Thumbnail src is sometimes "image" instead of an URL
          // for "image" post types - perhaps this also occurs
          // with other types? In any case, we shouldn't proceed further.
          return;
        }
        const result = await Abortable.wrap(() =>
          this.downloadImage(image.src, {
            entityType: 'post',
            post,
            imageType,
            index
          })
        );
        if (
          result.status === 'downloaded' ||
          result.status === 'skippedDuplicate'
        ) {
          image.downloaded = {
            path: result.downloadPath,
            duplicateCheckerRef: result.duplicateCheckerRef
          };
        }
        this.updateStatsOnDownloadMedia(result, stats, localStats, 'images');
      };

      const __handleNoMedia = () => {
        if (post.removedBy) {
          this.log(
            'info',
            `:: Post was removed by ${post.removedBy} - no media available`
          );
          return;
        }
        this.log('warn', `:: Post type is "${post.type}" but no media found`);
        localStats.images.skippedWarning++;
        stats.warningCount++;
      };

      switch (post.type) {
        case PostType.IMAGE: {
          const _post = post as Post<PostType.IMAGE>;
          if (_post.media?.image) {
            await __downloadImage(_post.media.image, 'full', 0);
            if (_post.media.thumbnail) {
              await __downloadImage(_post.media.thumbnail, 'thumbnail', 0);
            }
          } else {
            __handleNoMedia();
          }
          break;
        }
        case PostType.GALLERY: {
          const _post = post as Post<PostType.GALLERY>;
          if (_post.media) {
            await Promise.all(
              _post.media.map((media, index) => {
                if (media?.image) {
                  return __downloadImage(media.image, 'full', index).then(
                    () => {
                      if (media.thumbnail) {
                        return __downloadImage(
                          media.thumbnail,
                          'thumbnail',
                          index
                        );
                      }
                    }
                  );
                } else {
                  this.log('warn', `:: Image at index ${index} has no src`);
                  localStats.images.skippedWarning++;
                  return Promise.resolve();
                }
              })
            );
          } else {
            __handleNoMedia();
          }
          break;
        }
        case PostType.HOSTED_VIDEO: {
          const _post = post as Post<PostType.HOSTED_VIDEO>;
          if (_post.media?.thumbnail?.src) {
            await __downloadImage(_post.media.thumbnail, 'thumbnail', 0);
          }
          // Fetch HLS source from hybrid HTML of post URL, which may contain
          // higher resolution video.
          let hlsFromHybrid: string | null = null;
          if (post.url && !post.removedBy) {
            const api = await this.getAPI();
            try {
              hlsFromHybrid = await Abortable.wrap(() =>
                api.fetchHostedVideoURLFromHybridHTML(post.id, post.url)
              );
            } catch (error) {
              if (error instanceof AbortError) {
                throw error;
              }
              this.log(
                'error',
                `(${post.id}) Failed to obtain hosted video URL from hybrid HTML of post:`,
                error
              );
            }
            if (!hlsFromHybrid) {
              this.log(
                'warn',
                `(${post.id}) Failed to obtain hosted video URL from hybrid HTML - falling back to API supplied value. Video limited to max 720p even if higher quality may be available.`
              );
              stats.warningCount++;
            }
          }
          const src =
            hlsFromHybrid ||
            _post.media?.src?.hls ||
            _post.media?.src?.fallback;
          if (_post.media && src) {
            const result = await this.downloadVideo(src, { post, index: 0 });
            if (
              result.status === 'downloaded' ||
              result.status === 'skippedDuplicate'
            ) {
              _post.media.src.downloaded = {
                path: result.downloadPath,
                duplicateCheckerRef: result.duplicateCheckerRef
              };
            }
            this.updateStatsOnDownloadMedia(
              result,
              stats,
              localStats,
              'videos'
            );
          } else {
            __handleNoMedia();
          }
          break;
        }
        case PostType.RICH_VIDEO: {
          const _post = post as Post<PostType.RICH_VIDEO>;
          if (_post.media) {
            const contentURL = _post.media.content.url;
            const provider = _post.media.provider;
            let thumbnailSrc = _post.media.thumbnail?.src;
            let extractedSrc: string | undefined = undefined;
            if (
              contentURL &&
              typeof provider === 'string' &&
              provider.toLowerCase() === 'redgifs'
            ) {
              const api = await this.getAPI();
              const redgifsData = await Abortable.wrap((signal) =>
                api.fetchRedgifsData(_post.id, contentURL, signal)
              );
              thumbnailSrc = redgifsData.thumbnailSrc || undefined;
              extractedSrc = redgifsData.videoSrc || undefined;
              if (thumbnailSrc) {
                _post.media.thumbnail = {
                  src: thumbnailSrc
                };
              }
              if (extractedSrc) {
                _post.media.content.extractedSrc = extractedSrc;
              }
              if (redgifsData.error) {
                this.log(
                  'error',
                  `(${_post.id}) Error fetching redgifs data:`,
                  redgifsData.error
                );
                stats.errorCount++;
              }
            }
            if (_post.media.thumbnail) {
              await __downloadImage(_post.media.thumbnail, 'thumbnail', 0);
            }
            const result = await this.downloadRichVideo(
              {
                url: _post.media.content.url,
                provider: _post.media.provider,
                extractedSrc
              },
              { post, index: 0 }
            );
            if (
              result.status === 'downloaded' ||
              result.status === 'skippedDuplicate'
            ) {
              _post.media.content.downloaded = {
                path: result.downloadPath,
                duplicateCheckerRef: result.duplicateCheckerRef
              };
            }
            this.updateStatsOnDownloadMedia(
              result,
              stats,
              localStats,
              'videos'
            );
          } else {
            __handleNoMedia();
          }
          break;
        }
        case PostType.LINK: {
          const _post = post as Post<PostType.LINK>;
          // Check if external URL points to a Reddit post - if so, we can download it.
          const postId = getPostIdFromURL(_post.content.externalURL);
          if (postId) {
            this.log(
              'info',
              `:: External link points to Reddit post "${postId}"`
            );
            let linkedPost;
            try {
              const { post: _linkedPost, errorCount: lpErrorCount } =
                await Abortable.wrap(async () =>
                  (await this.getAPI()).fetchPostById(
                    postId,
                    !isBatch || this.config.fetchPostAuthors
                  )
                );
              linkedPost = _linkedPost;
              stats.errorCount += lpErrorCount;
            } catch (error) {
              if (error instanceof AbortError) {
                throw error;
              }
              this.log('error', ':: Failed to fetch linked post:', error);
              stats.errorCount++;
            }
            if (linkedPost) {
              this.log(
                'info',
                `-- Linked post: (${linkedPost.id}) ${linkedPost.title}`
              );
              await this.processPost({
                post: linkedPost,
                stats,
                processAuthor: true,
                processSubreddit: true,
                ignoreContinueConditions: true,
                isBatch
              });
              this.log('info', `-- End linked post`);
            }
          } else {
            this.log(
              'warn',
              `:: External link not followed: ${_post.content.externalURL}`
            );
          }
          break;
        }
        case PostType.CROSS_POST: {
          const _post = post as Post<PostType.CROSS_POST>;
          if (_post.crossPost) {
            this.log(
              'info',
              `-- Cross post: (${_post.crossPost.id}) ${_post.crossPost.title}`
            );
            const cp = _post.crossPost;
            _post.crossPost = (
              await Abortable.wrap(() =>
                this.processPost({
                  post: cp,
                  stats,
                  processAuthor: true,
                  processSubreddit: true,
                  ignoreContinueConditions: true,
                  isBatch
                })
              )
            ).processedPost;
            this.log('info', `-- End cross post`);
          } else {
            this.log(
              'warn',
              `:: Post type is "${PostType.CROSS_POST}" but no cross post data found`
            );
            stats.warningCount++;
          }
          break;
        }
        case PostType.UNKNOWN: {
          const removed =
            post.removedBy ?
              `, but this could be because the post was removed by ${post.removedBy}`
            : '';
          this.log(
            'warn',
            `:: Unknown post type${post.rawType ? ` "${post.rawType}"` : ''} - no media saved${removed}`
          );
          break;
        }
      }

      if (post.content.embeddedMedia) {
        await Promise.all(
          post.content.embeddedMedia.map((media, index) => {
            return __downloadImage(media.image, 'full', index).then(() => {
              if (media.thumbnail) {
                return __downloadImage(media.thumbnail, 'thumbnail', index);
              }
            });
          })
        );
      }

      db.savePost(post);
      this.log('info', `:: Saved post`);
      this.logLocalDownloadStats(localStats);
      return {
        continue: true,
        processedPost: post
      };
    }

    #postMediaExists(post: Post<PostType>) {
      const embeddedContentMediaExists =
        post.content.embeddedMedia ?
          post.content.embeddedMedia.every(
            (media) =>
              this.isDownloaded(media.image) &&
              (!media.thumbnail || this.isDownloaded(media.thumbnail))
          )
        : true;
      const postMediaExists = (() => {
        switch (post.type) {
          case PostType.IMAGE: {
            const _post = post as Post<PostType.IMAGE>;
            return !!(
              _post.media &&
              _post.media.image &&
              this.isDownloaded(_post.media.image) &&
              _post.media.thumbnail &&
              this.isDownloaded(_post.media.thumbnail)
            );
          }
          case PostType.GALLERY: {
            const _post = post as Post<PostType.GALLERY>;
            return !!(
              _post.media &&
              _post.media.every(
                (media) =>
                  media &&
                  media.image &&
                  this.isDownloaded(media.image) &&
                  media.thumbnail &&
                  this.isDownloaded(media.thumbnail)
              )
            );
          }
          case PostType.HOSTED_VIDEO: {
            const _post = post as Post<PostType.HOSTED_VIDEO>;
            return !!(_post.media && this.isDownloaded(_post.media.src));
          }
          case PostType.RICH_VIDEO: {
            const _post = post as Post<PostType.RICH_VIDEO>;
            return !!(_post.media && this.isDownloaded(_post.media.content));
          }
          default:
            return true;
        }
      })();

      return embeddedContentMediaExists && postMediaExists;
    }
  };
}
