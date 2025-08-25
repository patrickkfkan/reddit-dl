import { type User } from '../entities/User';
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

export function UserProcessorMixin<TBase extends MediaDownloaderConstructor>(
  Base: TBase
) {
  return class UserProcessorBase extends Base {
    async processUser(user: User, stats: TargetDownloadStats) {
      const processedUser = this.session.getProcessedUser(user);
      if (processedUser) {
        this.log('info', `:: User "${user.username}" already processed`);
        return processedUser;
      }
      const db = await this.getDB();
      const dbUser = db.getUser(user.username);
      if (
        !this.config.overwrite &&
        dbUser &&
        dbUser.wasFetchedFromAPI &&
        (!dbUser.avatar || this.isDownloaded(dbUser.avatar)) &&
        (!dbUser.banner || this.isDownloaded(dbUser.banner)) &&
        (!dbUser.icon || this.isDownloaded(dbUser.icon))
      ) {
        this.log(
          'info',
          `:: User profile for "${user.username}" already exists in DB`
        );
        this.session.addProcessedUser(dbUser);
        return dbUser;
      }
      if (
        this.config.overwrite &&
        dbUser &&
        dbUser.wasFetchedFromAPI &&
        !user.wasFetchedFromAPI
      ) {
        this.log(
          'info',
          `:: Not overwriting user profile in DB for "${user.username}" as it contains data fetched from API whereas current does not`
        );
        this.session.addProcessedUser(dbUser);
        return dbUser;
      }

      const localStats: LocalDownloadStats<['images']> = {
        images: {
          downloaded: 0,
          skippedDuplicate: 0,
          skippedError: 0,
          skippedWarning: 0
        }
      };
      const images: Array<
        [
          DownloadableImage | null,
          (DownloadImageContext & { entityType: 'user' })['imageType']
        ]
      > = [
        [user.avatar, 'avatar'],
        [user.banner, 'banner'],
        [user.icon, 'icon']
      ];
      this.log('debug', 'Downloading user profile media...');
      await Promise.all(
        images.map(async ([image, type]) => {
          if (image) {
            const result = await Abortable.wrap(() =>
              this.downloadImage(image.src, {
                entityType: 'user',
                user,
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
      db.saveUser(user);
      this.log('info', `:: Saved user profile for "${user.username}"`);
      this.logLocalDownloadStats(localStats);
      this.session.addProcessedUser(user);
      return user;
    }
  };
}
