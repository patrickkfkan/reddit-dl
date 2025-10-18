import { type ResolvedTarget } from '../entities/Target';
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

    lookupTarget(target: ResolvedTarget): ResolvedTarget | null {
      const targetId = this.#getTargetId(target);
      try {
        const result = this.db
          .prepare(`SELECT details FROM target WHERE target_id = ?`)
          .get(targetId) as { details: string } | undefined;
        return result ? JSON.parse(result.details) : null;
      } catch (error) {
        this.log('error', `Failed to look up target "${targetId}":`, error);
        return null;
      }
    }

    #getTargetId(details: ResolvedTarget) {
      switch (details.type) {
        case 'user_submitted':
          return `user.submitted:${details.user.username}`;
        case 'subreddit_posts':
          return `subreddit.posts:${details.subreddit.id}`;
        case 'post':
          return `post:${details.post.id}`;
        case 'me':
          return `me:${details.me.username}`;
      }
    }
  };
}
