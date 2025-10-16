import { type Post, type PostType } from '../entities/Post';
import { type SavedItem, type SavedItemType } from '../entities/SavedItem';
import { type User } from '../entities/User';
import { type TargetDownloadStats } from '../RedditDownloader';
import { type MediaDownloaderConstructor } from './MediaDownloader';

export type ProcessSavedItemParams<T extends SavedItemType> = {
  item: SavedItem<T>;
  savedBy: User;
  stats: TargetDownloadStats;
  post?: T extends 'postComment' ? Post<PostType> | null : undefined | null;
};

export function SavedItemProcessorMixin<
  TBase extends MediaDownloaderConstructor
>(Base: TBase) {
  return class PostProcessorBase extends Base {
    async processSavedItem<T extends SavedItemType>(
      params: ProcessSavedItemParams<T>
    ) {
      const { item, savedBy, stats } = params;
      const db = await this.getDB();
      const post =
        item.type === 'post' ? item.data
        : item.type === 'postComment' ? params.post
        : null;
      const { processedPost } =
        post ?
          await this.processPost({
            post,
            stats,
            processAuthor: true,
            processSubreddit: true,
            ignoreContinueConditions: true,
            isBatch: false
          })
        : {};
      let processedItem: SavedItem<T> | null = null;
      switch (item.type) {
        case 'post': {
          if (processedPost) {
            item.data = processedPost;
            db.saveSavedItem(item, savedBy);
            processedItem = item;
            this.log('info', `:: Processed saved item`);
          } else {
            this.log('warn', ':: Saved item not processed - no processed post');
          }
          break;
        }
        case 'postComment': {
          db.saveSavedItem(item, savedBy);
          processedItem = item;
          this.log('info', `:: Processed saved item`);
          break;
        }
      }
      return {
        processedItem
      };
    }
  };
}
