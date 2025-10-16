import { type DBConstructor } from '.';
import { type SavedItem, type SavedItemType } from '../entities/SavedItem';
import { type User } from '../entities/User';

export type DBGetSavedItemsParams = {
  savedBy?: User | string;
  limit: number;
  offset: number;
} & (
  | {
      search?: undefined;
      sortBy?: 'mostRecentlySaved' | 'leastRecentlySaved';
    }
  | {
      search: string;
      sortBy?: 'best_match' | 'mostRecentlySaved' | 'leastRecentlySaved';
    }
);

export function SavedItemDBMixin<TBase extends DBConstructor>(Base: TBase) {
  return class SavedItemDB extends Base {
    saveSavedItem(item: SavedItem<SavedItemType>, savedBy: User | string) {
      const username = typeof savedBy === 'string' ? savedBy : savedBy.username;
      try {
        this.db.exec('BEGIN TRANSACTION;');
        const exists = this.checkSavedItemExists(
          item.data.id,
          item.type,
          username
        );
        if (!exists) {
          this.db
            .prepare(
              `INSERT INTO saved_item (
                item_id,
                item_type,
                saved_by,
                item_index,
                details
              ) VALUES (?, ?, ?, ?, ?)`
            )
            .run(
              item.data.id,
              item.type,
              username,
              item.index,
              JSON.stringify(item)
            );
        } else {
          this.db
            .prepare(
              `
              UPDATE saved_item
              SET
                item_index = ?,
                details = ?
              WHERE
                item_id = ? AND
                item_type = ? AND
                saved_by = ?
              `
            )
            .run(
              item.index,
              JSON.stringify(item),
              item.data.id,
              item.type,
              username
            );
        }
        this.#refreshUserStats(username);
        this.db.exec('COMMIT;');
      } catch (error: any) {
        this.db.exec('ROLLBACK;');
        const savedItemDesc = `[type: ${item.type}; id: ${item.data.id}; savedBy: ${username}]`;
        throw Error(
          `An error occurred while writing saved_item ${savedItemDesc} to database.`,
          {
            cause: error
          }
        );
      }
    }

    checkSavedItemExists(
      id: string,
      itemType: 'post' | 'postComment',
      savedBy: User | string
    ) {
      const username = typeof savedBy === 'string' ? savedBy : savedBy.username;
      try {
        const result = this.db
          .prepare(
            `
            SELECT
              COUNT(item_id) as count
            FROM
              saved_item
            WHERE
              item_id = ? AND
              item_type = ? AND
              saved_by = ?
          `
          )
          .get(id, itemType, username) as { count: number };
        return result.count > 0;
      } catch (error) {
        const savedItemDesc = `[type: ${itemType}; id: ${id}; savedBy: ${username}]`;
        this.log(
          'error',
          `Failed to check if saved_item ${savedItemDesc} exists in DB:`,
          error
        );
        return false;
      }
    }

    getSavedItem(
      id: string,
      itemType: 'postComment',
      savedBy: User
    ): SavedItem<'postComment'> | null;
    getSavedItem(
      id: string,
      itemType: 'post',
      savedBy: User
    ): SavedItem<'post'> | null;
    getSavedItem(
      id: string,
      itemType: 'post' | 'postComment',
      savedBy: User
    ): SavedItem<SavedItemType> | null {
      try {
        const result = this.db
          .prepare(
            `
            SELECT
              details
            FROM
              saved_item
            WHERE
              item_id = ? AND
              item_type = ? AND
              saved_by = ?
          `
          )
          .get(id, itemType, savedBy.username) as
          | { details: string }
          | undefined;
        if (result) {
          return JSON.parse(result.details);
        }
        return null;
      } catch (error) {
        const savedItemDesc = `[type: ${itemType}; id: ${id}; savedBy: ${savedBy.username}]`;
        this.log(
          'error',
          `Failed to get saved_item ${savedItemDesc} from DB:`,
          error
        );
        return null;
      }
    }

    getSavedItems(params: DBGetSavedItemsParams) {
      const {
        savedBy,
        search,
        sortBy = 'mostRecentlySaved',
        limit,
        offset
      } = params;
      const username =
        savedBy && (typeof savedBy === 'string' ? savedBy : savedBy.username);

      const whereClauseParts: string[] = [];
      const whereValues: string[] = [];
      if (username) {
        whereClauseParts.push('saved_item.saved_by = ?');
        whereValues.push(username);
      }
      if (search) {
        whereClauseParts.push('saved_item_fts MATCH ?');
        whereValues.push(search);
      }
      const whereClause =
        whereClauseParts.length > 0 ?
          `WHERE ${whereClauseParts.join(' AND ')}`
        : '';

      let orderByClause;
      switch (sortBy) {
        case 'leastRecentlySaved':
          orderByClause = 'ORDER BY item_index ASC';
          break;
        case 'mostRecentlySaved':
          orderByClause = 'ORDER BY item_index DESC';
          break;
        case 'best_match':
          orderByClause = 'ORDER BY bm25(saved_item_fts) DESC';
          break;
      }

      let fromClause: string;
      if (search) {
        fromClause = `
          FROM
            saved_item_fts
          LEFT JOIN
            saved_item_fts_source ON saved_item_fts_source.fts_rowid = saved_item_fts.rowid
          LEFT JOIN
            saved_item
            ON
              saved_item.item_id = saved_item_fts_source.item_id AND
              saved_item.item_type = saved_item_fts_source.item_type AND
              saved_item.saved_by = saved_item_fts_source.saved_by
        `;
      } else {
        fromClause = 'FROM saved_item';
      }

      const sql = `
        SELECT saved_item.details
        ${fromClause}
        ${whereClause}
        ${orderByClause}
        LIMIT ? OFFSET ?
      `;

      try {
        const rows = this.db
          .prepare(sql)
          .all(...whereValues, limit, offset) as { details: string }[];

        return rows.map<SavedItem<SavedItemType>>((row) =>
          JSON.parse(row.details)
        );
      } catch (error) {
        const _error = Error(
          `Failed to get saved items from DB (savedBy: ${username}):`,
          {
            cause: error
          }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    getSavedItemCount(
      user?: User | string,
      search?: string,
      itemType?: 'post' | 'postComment'
    ) {
      const username = typeof user === 'string' ? user : user?.username;

      const whereClauseParts: string[] = [];
      const whereValues: string[] = [];
      if (username) {
        whereClauseParts.push('saved_item.saved_by = ?');
        whereValues.push(username);
      }
      if (search) {
        whereClauseParts.push('saved_item_fts MATCH ?');
        whereValues.push(search);
      }
      const whereClause =
        whereClauseParts.length > 0 ?
          `WHERE ${whereClauseParts.join(' AND ')}`
        : '';

      let fromClause: string;
      if (search) {
        fromClause = `
          FROM
            saved_item_fts
          LEFT JOIN
            saved_item_fts_source ON saved_item_fts_source.fts_rowid = saved_item_fts.rowid
          LEFT JOIN
            saved_item
            ON
              saved_item.item_id = saved_item_fts_source.item_id AND
              saved_item.item_type = saved_item_fts_source.item_type AND
              saved_item.saved_by = saved_item_fts_source.saved_by
        `;
      } else {
        fromClause = 'FROM saved_item';
      }

      const sql = `
        SELECT COUNT(DISTINCT saved_item.item_id) AS item_count
        ${fromClause}
        ${whereClause}
      `;

      try {
        const result = this.db.prepare(sql).get(...whereValues) as
          | { item_count: number }
          | undefined;
        return result ? result.item_count : null;
      } catch (error) {
        this.log(
          'error',
          `Failed to get saved_item count (user: ${username}; itemType: ${itemType}) from DB:`,
          error
        );
        return null;
      }
    }

    #refreshUserStats(user: User | string) {
      const username = typeof user === 'string' ? user : user.username;
      this.log('debug', `Refresh user saved_item stats for "${username}"`);
      try {
        this.db
          .prepare(
            `
          UPDATE user
          SET
            saved_post_count = (SELECT COUNT(DISTINCT item_id) FROM saved_item WHERE saved_by = user.username AND item_type = ?),
            saved_comment_count = (SELECT COUNT(DISTINCT item_id) FROM saved_item WHERE saved_by = user.username AND item_type = ?)
          WHERE username = ?
        `
          )
          .run('post', 'postComment', username);
      } catch (error) {
        this.log(
          'error',
          `Failed to refresh user saved_item stats in DB for "${username}":`,
          error
        );
      }
    }
  };
}
