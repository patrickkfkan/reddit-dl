import { type ResolvedTarget } from '../entities/Target';
import { type Post, type PostType } from '../entities/Post';
import { type DBConstructor } from '.';

export function TargetDBMixin<TBase extends DBConstructor>(Base: TBase) {
  return class TargetDB extends Base {
    saveTarget(target: ResolvedTarget) {
      const targetId = this.#getTargetId(target);
      try {
        // Check if target already exists in DB
        const targetExists = this.checkTargetExists(target);
        this.db.exec('BEGIN TRANSACTION;');
        if (!targetExists) {
          this.log('debug', `INSERT target "${targetId}"`);
          this.db
            .prepare(
              `INSERT INTO target (target_id, target_type, last_run, details) VALUES (?, ?, ?, ?)`
            )
            .run(
              targetId,
              target.type,
              target.runTimestamp,
              JSON.stringify(target)
            );
        } else {
          this.log('debug', `UPDATE target "${targetId}"`);
          this.db
            .prepare(
              `UPDATE target SET target_type = ?, last_run = ?, details = ? WHERE target_id = ?`
            )
            .run(
              target.type,
              target.runTimestamp,
              JSON.stringify(target),
              targetId
            );
        }
        this.db.exec('COMMIT;');
      } catch (error) {
        this.log('error', `Failed to save target "${targetId}" to DB:`, error);
        this.db.exec('ROLLBACK;');
      }
    }

    addPostsToTarget(targetId: string, postIds: string[]): void {
      if (postIds.length === 0) {
        return;
      }
      try {
        this.db.exec('BEGIN TRANSACTION;');
        const stmt = this.db.prepare(
          `INSERT OR IGNORE INTO target_post (target_id, post_id) VALUES (?, ?)`
        );
        for (const postId of postIds) {
          this.log('debug', `INSERT target_post (${targetId}, ${postId})`);
          stmt.run(targetId, postId);
        }
        this.db.exec('COMMIT;');
      } catch (error) {
        this.db.exec('ROLLBACK;');
        this.log(
          'error',
          `Failed to add posts to target "${targetId}":`,
          error
        );
      }
    }

    getPostsByTarget(
      params: {
        targetId: string;
        limit: number;
        offset: number;
      } & (
        | { search?: undefined; sortBy: 'latest' | 'oldest' | 'top' }
        | { search: string; sortBy: 'best_match' | 'latest' | 'oldest' | 'top' }
      )
    ): Post<PostType>[] {
      const { targetId, search, sortBy, limit, offset } = params;
      try {
        let orderByClause: string;
        switch (sortBy) {
          case 'best_match':
            orderByClause = 'ORDER BY bm25(post_fts)';
            break;
          case 'latest':
            orderByClause = 'ORDER BY post.created_utc DESC';
            break;
          case 'oldest':
            orderByClause = 'ORDER BY post.created_utc ASC';
            break;
          case 'top':
            orderByClause = 'ORDER BY post.score DESC';
            break;
        }

        if (search) {
          const rows = this.db
            .prepare(
              `
            SELECT post.details
            FROM post_fts
            LEFT JOIN post_fts_source source ON source.fts_rowid = post_fts.rowid
            LEFT JOIN post ON post.post_id = source.post_id
            INNER JOIN target_post tp ON tp.post_id = post.post_id
            WHERE tp.target_id = ? AND post_fts MATCH ?
            ${orderByClause}
            LIMIT ? OFFSET ?
          `
            )
            .all(targetId, search, limit, offset) as { details: string }[];
          return rows.map((row) => JSON.parse(row.details));
        }
        const rows = this.db
          .prepare(
            `
          SELECT post.details
          FROM target_post tp
          LEFT JOIN post ON post.post_id = tp.post_id
          WHERE tp.target_id = ?
          ${orderByClause}
          LIMIT ? OFFSET ?
        `
          )
          .all(targetId, limit, offset) as { details: string }[];
        return rows.map((row) => JSON.parse(row.details));
      } catch (error) {
        const _error = Error(
          `Failed to get posts by target from DB (${JSON.stringify(params, null, 2)}):`,
          { cause: error }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    getPostCountByTarget(
      search: string | undefined,
      targetId: string
    ): number | null {
      try {
        if (search) {
          const row = this.db
            .prepare(
              `
            SELECT COUNT(DISTINCT post.post_id) AS post_count
            FROM post_fts
            LEFT JOIN post_fts_source source ON source.fts_rowid = post_fts.rowid
            LEFT JOIN post ON post.post_id = source.post_id
            INNER JOIN target_post tp ON tp.post_id = post.post_id
            WHERE tp.target_id = ? AND post_fts MATCH ?
          `
            )
            .get(targetId, search) as { post_count: number } | undefined;
          return row ? row.post_count : null;
        }
        const row = this.db
          .prepare(
            `
          SELECT COUNT(post_id) AS post_count
          FROM target_post
          WHERE target_id = ?
        `
          )
          .get(targetId) as { post_count: number } | undefined;
        return row ? row.post_count : null;
      } catch (error) {
        this.log('error', `Failed to get post count by target from DB:`, error);
        return null;
      }
    }

    getTargets(params: {
      type?: ResolvedTarget['type'] | ResolvedTarget['type'][];
      sortBy: 'mostRecentlyRun' | 'leastRecentlyRun';
      limit: number;
      offset: number;
    }) {
      const { type, sortBy, limit, offset } = params || {};
      let whereClause = '';
      const whereValues: string[] = [];
      if (type) {
        if (!Array.isArray(type)) {
          whereClause = 'WHERE target_type = ?';
          whereValues.push(type);
        } else {
          whereClause = `WHERE target_type IN (${type.map(() => '?').join(', ')})`;
          whereValues.push(...type);
        }
      }
      try {
        const rows = this.db
          .prepare(
            `
          SELECT details
          FROM target
          ${whereClause}
          ORDER BY last_run ${sortBy === 'mostRecentlyRun' ? 'DESC' : 'ASC'}
          LIMIT ? OFFSET ?`
          )
          .all(...whereValues, limit, offset) as { details: string }[];
        return rows.map((row) => JSON.parse(row.details) as ResolvedTarget);
      } catch (error) {
        const _error = Error(`Failed to get targets from DB:`, {
          cause: error
        });
        this.log('error', _error);
        throw _error;
      }
    }

    getTargetCount(type?: ResolvedTarget['type']) {
      let whereClause = '';
      const whereValues: string[] = [];
      if (type) {
        whereClause = 'WHERE target_type = ?';
        whereValues.push(type);
      }
      try {
        const result = this.db
          .prepare(
            `SELECT COUNT(target_id) AS target_count FROM target ${whereClause}`
          )
          .get(...whereValues) as { target_count: number } | undefined;
        return result ? result.target_count : null;
      } catch (error) {
        this.log('error', `Failed to get target count from DB:`, error);
        return null;
      }
    }

    checkTargetExists(target: ResolvedTarget): boolean {
      const targetId = this.#getTargetId(target);
      try {
        const result = this.db
          .prepare(
            `SELECT COUNT(target_id) as count FROM target WHERE target_id = ?`
          )
          .get(targetId) as { count: number };
        return result.count > 0;
      } catch (error) {
        this.log(
          'error',
          `Failed to check if target "${targetId}" exists in DB:`,
          error
        );
        return false;
      }
    }

    #getTargetId(details: ResolvedTarget) {
      switch (details.type) {
        case 'user_submitted':
          return `user.submitted:${details.user.username}`;
        case 'user_saved':
          return `user.saved:${details.user.username}`;
        case 'subreddit_posts':
          return `subreddit.posts:${details.subreddit.id}`;
        case 'post':
          return `post:${details.post.id}`;
      }
    }
  };
}
