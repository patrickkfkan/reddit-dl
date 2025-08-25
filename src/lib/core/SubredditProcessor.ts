import { type Subreddit } from '../entities/Subreddit';
import {
  type TargetDownloadStats,
  type LocalDownloadStats
} from '../RedditDownloader';
import { type DownloadableImage } from '../entities/Common';
import {
  type DownloadImageContext,
  type MediaDownloaderConstructor
} from './MediaDownloader';
import { Abortable } from '../utils/Abortable';

export function SubredditProcessorMixin<
  TBase extends MediaDownloaderConstructor
>(Base: TBase) {
  return class SubredditProcessorBase extends Base {
    async processSubreddit(subreddit: Subreddit, stats: TargetDownloadStats) {
      const processedSubreddit = this.session.getProcessedSubreddit(subreddit);
      if (processedSubreddit) {
        this.log('info', `:: Subreddit "${subreddit.name}" already processed`);
        return processedSubreddit;
      }
      const db = await this.getDB();
      const dbSubreddit = db.getSubreddit(subreddit.id);
      if (
        !this.config.overwrite &&
        dbSubreddit &&
        (!dbSubreddit.icon || this.isDownloaded(dbSubreddit.icon)) &&
        (!dbSubreddit.banner || this.isDownloaded(dbSubreddit.banner)) &&
        (!dbSubreddit.header || this.isDownloaded(dbSubreddit.header))
      ) {
        this.log(
          'info',
          `:: Subreddit info for "${subreddit.name}" already exists in DB`
        );
        return dbSubreddit;
      }

      const localStats: LocalDownloadStats<['images']> = {
        images: {
          downloaded: 0,
          skippedDuplicate: 0,
          skippedError: 0,
          skippedWarning: 0
        }
      };
      this.log('debug', 'Downloading subreddit info media...');
      const images: Array<
        [
          DownloadableImage | null,
          (DownloadImageContext & { entityType: 'subreddit' })['imageType']
        ]
      > = [
        [subreddit.header, 'header'],
        [subreddit.icon, 'icon'],
        [subreddit.banner, 'banner']
      ];
      await Promise.all(
        images.map(async ([image, type]) => {
          if (image) {
            const result = await Abortable.wrap(() =>
              this.downloadImage(image.src, {
                entityType: 'subreddit',
                subreddit,
                imageType: type
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
            this.updateStatsOnDownloadMedia(
              result,
              stats,
              localStats,
              'images'
            );
          }
        })
      );
      db.saveSubreddit(subreddit);
      this.log('info', `:: Saved subreddit info for "${subreddit.name}"`);
      this.logLocalDownloadStats(localStats);
      this.session.addProcessedSubreddit(subreddit);
      return subreddit;
    }
  };
}
