import { type DBConstructor } from '.';
import { type Downloaded } from '../entities/Common';
import { type Post, type PostType } from '../entities/Post';
import { DB_MEDIA_TYPE } from '../utils/Constants';

export type MediaDBConstructor = new (
  ...args: any[]
) => InstanceType<ReturnType<typeof MediaDBMixin<DBConstructor>>>;

export interface DBMedia {
  id: number;
  type: 'image' | 'video';
  duplicateCheckerRef: string;
  downloadPath: string;
}

interface DBGetPostMediaRow {
  media_id: number;
  media_type: number;
  uploaded: number;
  download_path: string;
  thumbnail_download_path: string | null;
  post_details: string;
  post_count: number;
}

export interface DBPostMedia {
  id: number;
  type: 'image' | 'video';
  uploaded: number;
  downloadPath: string;
  thumbnailDownloadPath: string | null;
  firstContainingPost: Post<PostType>;
  containingPostCount: number;
}

export function MediaDBMixin<TBase extends DBConstructor>(Base: TBase) {
  return class MediaDB extends Base {
    protected saveMedia(
      downloaded: Downloaded,
      mediaType: 'image' | 'video',
      thumbnail?: Downloaded | null
    ) {
      return {
        mediaId: this.#doSaveMedia(downloaded, mediaType, thumbnail),
        thumbnailMediaId:
          thumbnail ? this.#doSaveMedia(thumbnail, 'image') : undefined
      };
    }

    #doSaveMedia(
      downloaded: Downloaded,
      mediaType: 'image' | 'video',
      thumbnail?: Downloaded | null
    ) {
      const { path: downloadPath, duplicateCheckerRef } = downloaded;
      const existingMedia =
        this.getMediaByDuplicateCheckerRef(duplicateCheckerRef);
      const dbMediaType =
        mediaType === 'image' ? DB_MEDIA_TYPE.IMAGE : DB_MEDIA_TYPE.VIDEO;
      let mediaId: number | bigint;
      if (!existingMedia) {
        this.log('debug', `INSERT media "${duplicateCheckerRef}"`);
        const { lastInsertRowid: newMediaId } = this.db
          .prepare(
            `INSERT INTO media (duplicate_checker_ref, download_path, media_type, thumbnail_download_path) VALUES (?, ?, ?, ?)`
          )
          .run(
            duplicateCheckerRef,
            downloadPath,
            dbMediaType,
            thumbnail?.path || null
          );
        this.log(
          'debug',
          `INSERT media "${duplicateCheckerRef}" done - mediaId:`,
          newMediaId
        );
        mediaId = newMediaId;
      } else {
        this.log('debug', `UPDATE media "${duplicateCheckerRef}"`);
        this.db
          .prepare(
            `UPDATE media SET download_path = ?, media_type = ?, thumbnail_download_path = ? WHERE media_id = ?`
          )
          .run(
            downloadPath,
            dbMediaType,
            thumbnail?.path || null,
            existingMedia.id
          );
        this.log(
          'debug',
          `UPDATE media "${duplicateCheckerRef}" done - mediaId:`,
          existingMedia.id
        );
        mediaId = existingMedia.id;
      }

      if (!this.checkMediaStatsExists(mediaId)) {
        this.log('debug', `INSERT media_stats for "${mediaId}"`);
        this.db
          .prepare(
            `INSERT INTO media_stats (media_id, post_count) VALUES (?, ?)`
          )
          .run(mediaId, 0);
      }

      return mediaId;
    }

    getMediaByDuplicateCheckerRef(duplicateChckerRef: string): DBMedia | null {
      try {
        const result = this.db
          .prepare(`SELECT * FROM media WHERE duplicate_checker_ref = ?`)
          .get(duplicateChckerRef);
        return result ? this.#mapMediaData(result) : null;
      } catch (error) {
        this.log(
          'error',
          `Failed to get media by duplicateCheckerRef "${duplicateChckerRef}" from DB:`,
          error
        );
        return null;
      }
    }

    getPostMedia(params: {
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }): DBPostMedia[];
    getPostMedia(params: {
      by: 'user';
      username: string;
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }): DBPostMedia[];
    getPostMedia(params: {
      by: 'subreddit';
      subredditId: string;
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }): DBPostMedia[];
    getPostMedia(params: {
      by?: 'user' | 'subreddit';
      username?: string;
      subredditId?: string;
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }) {
      const { by, username, subredditId, sortBy, limit, offset } = params;
      let whereClause: string;
      let queryParams: any[];
      switch (by) {
        case 'subreddit':
          whereClause = `WHERE post_media.subreddit_id = ? AND post_media.is_post_latest_in_subreddit = 1`;
          queryParams = [subredditId, limit, offset];
          break;
        case 'user':
          whereClause = `WHERE post_media.uploader = ? AND post_media.is_post_latest_by_uploader = 1`;
          queryParams = [username, limit, offset];
          break;
        default:
          whereClause = `WHERE post_media.is_post_latest = 1`;
          queryParams = [limit, offset];
      }
      const target = by === 'user' ? username : subredditId;
      try {
        const rows = this.db
          .prepare(
            `
          SELECT
            post_media.media_id,
            media.download_path,
            media.thumbnail_download_path,
            media.media_type,
			      media_stats.post_count,
            post.created_utc AS uploaded,
			      post.details AS post_details
          FROM
            post_media 
            LEFT JOIN media ON media.media_id = post_media.media_id 
            LEFT JOIN post ON post.post_id = post_media.post_id
            LEFT JOIN media_stats ON media_stats.media_id = media.media_id
          ${whereClause}
          ORDER BY
            post_media.post_created_utc ${sortBy === 'latest' ? 'DESC' : 'ASC'},
            post_media.media_index ASC
          LIMIT ? OFFSET ?;`
          )
          .all(...queryParams) as DBGetPostMediaRow[];
        return rows.map<DBPostMedia>((row) => ({
          id: row.media_id,
          type:
            Number(row.media_type) === DB_MEDIA_TYPE.IMAGE ? 'image' : 'video',
          uploaded: row.uploaded,
          downloadPath: row.download_path,
          thumbnailDownloadPath: row.thumbnail_download_path || null,
          firstContainingPost: JSON.parse(row.post_details) as Post<PostType>,
          containingPostCount: row.post_count
        }));
      } catch (error) {
        const _error = Error(
          `Failed to get post media by ${by} "${target} from DB:`,
          {
            cause: error
          }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    getPostMediaCount(postId?: string) {
      const whereClause = postId ? 'WHERE post_media.post_id = ?' : '';
      const whereValues = postId ? [postId] : [];
      try {
        const result = this.db
          .prepare(
            `SELECT COUNT (DISTINCT media_id) AS media_count FROM post_media ${whereClause};`
          )
          .get(...whereValues) as { media_count: number } | undefined;
        return result ? result.media_count : null;
      } catch (error) {
        this.log('error', `Failed to get post media count from DB:`, error);
        return null;
      }
    }

    #mapMediaData(data: any): DBMedia {
      return {
        id: data.media_id,
        type: data.media_type === DB_MEDIA_TYPE.IMAGE ? 'image' : 'video',
        duplicateCheckerRef: data.duplicate_checker_ref,
        downloadPath: data.download_path
      };
    }

    checkMediaStatsExists(mediaId: number | bigint): boolean {
      try {
        const result = this.db
          .prepare(
            `SELECT COUNT(media_id) as count FROM media_stats WHERE media_id = ?`
          )
          .get(mediaId) as { count: number };
        return result.count > 0;
      } catch (error) {
        this.log(
          'error',
          `Failed to check if media stats for "${mediaId}" exists in DB:`,
          error
        );
        return false;
      }
    }
  };
}
