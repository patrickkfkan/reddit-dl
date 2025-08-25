import {
  type SubredditWithCounts,
  type Subreddit
} from '../entities/Subreddit';
import { type MediaDBConstructor } from './Media';

export type DBGetSubredditsParams = {
  limit: number;
  offset: number;
} & (
  | {
      search?: undefined;
      sortBy: 'a-z' | 'z-a' | 'most_posts' | 'most_media';
    }
  | {
      search: string;
      sortBy: 'best_match' | 'a-z' | 'z-a' | 'most_posts' | 'most_media';
    }
);

export interface CountsForSubreddit {
  media: number;
  post: number;
}

export function SubredditDBMixin<TBase extends MediaDBConstructor>(
  Base: TBase
) {
  return class SubredditDB extends Base {
    saveSubreddit(subreddit: Subreddit) {
      try {
        // Check if subreddit already exists in DB
        const subredditExists = this.checkSubredditExists(subreddit.id);
        this.db.exec('BEGIN TRANSACTION;');
        if (!subredditExists) {
          this.log('debug', `INSERT subreddit "${subreddit.id}"`);
          this.db
            .prepare(
              `INSERT INTO subreddit (subreddit_id, subreddit_name, post_count, media_count, details) VALUES (?, ?, ?, ? ,?)`
            )
            .run(subreddit.id, subreddit.name, 0, 0, JSON.stringify(subreddit));
        } else {
          this.log('debug', `UPDATE subreddit "${subreddit.id}"`);
          this.db
            .prepare(
              `UPDATE subreddit SET subreddit_name = ?, details = ? WHERE subreddit_id = ?`
            )
            .run(subreddit.name, JSON.stringify(subreddit), subreddit.id);
        }
        [subreddit.header, subreddit.icon, subreddit.banner].forEach(
          (image) => {
            if (image?.downloaded) {
              this.saveMedia(image.downloaded, 'image');
            }
          }
        );
        this.db.exec('COMMIT;');
      } catch (error) {
        this.log(
          'error',
          `Failed to save subreddit "${subreddit.id}" to DB:`,
          error
        );
        this.db.exec('ROLLBACK;');
      }
    }

    getSubreddit(id: string): Subreddit | null {
      try {
        const result = this.db
          .prepare(`SELECT details FROM subreddit WHERE subreddit_id = ?`)
          .get(id) as { details: string } | undefined;
        return result ? (JSON.parse(result.details) as Subreddit) : null;
      } catch (error) {
        this.log('error', `Failed to get subreddit "${id}" from DB:`, error);
        return null;
      }
    }

    getSubreddits(params: DBGetSubredditsParams) {
      const { search, sortBy, limit, offset } = params;

      let whereClause: string;
      const whereValues: string[] = [];
      if (search) {
        whereClause = `WHERE subreddit_fts MATCH ?`;
        whereValues.push(search);
      } else {
        whereClause = '';
      }

      let orderByClause: string;
      switch (sortBy) {
        case 'a-z':
          orderByClause = 'ORDER BY subreddit.subreddit_name ASC';
          break;
        case 'z-a':
          orderByClause = 'ORDER BY subreddit.subreddit_name DESC';
          break;
        case 'most_posts':
          orderByClause = 'ORDER BY subreddit.post_count DESC';
          break;
        case 'most_media':
          orderByClause = 'ORDER BY subreddit.media_count DESC';
          break;
        case 'best_match':
          orderByClause = 'ORDER BY bm25(subreddit_fts) DESC';
          break;
      }

      let fromClause: string;
      if (search) {
        fromClause = `
          FROM
            subreddit_fts
          LEFT JOIN
            subreddit_fts_source ON subreddit_fts_source.fts_rowid = subreddit_fts.rowid
          LEFT JOIN
            subreddit ON subreddit.subreddit_id = subreddit_fts_source.subreddit_id
        `;
      } else {
        fromClause = 'FROM subreddit';
      }

      try {
        const rows = this.db
          .prepare(
            `
          SELECT
            subreddit.details,
            subreddit.post_count,
            subreddit.media_count
          ${fromClause}
          ${whereClause}
          ${orderByClause}
          LIMIT ? OFFSET ?
          `
          )
          .all(...whereValues, limit, offset) as {
          details: string;
          post_count: number | null;
          media_count: number | null;
        }[];
        return rows.map<SubredditWithCounts>((row) => ({
          subreddit: JSON.parse(row.details),
          counts: {
            post: row.post_count || 0,
            media: row.media_count || 0
          }
        }));
      } catch (error) {
        const _error = Error(`Failed to get subreddits from DB:`, {
          cause: error
        });
        this.log('error', _error);
        throw _error;
      }
    }

    getSubredditByName(subredditName: string): Subreddit | null {
      try {
        const result = this.db
          .prepare(`SELECT details FROM subreddit WHERE subreddit_name = ?`)
          .get(subredditName) as { details: string } | undefined;
        return result ? (JSON.parse(result.details) as Subreddit) : null;
      } catch (error) {
        throw Error(`Failed to get subreddit "${subredditName}" from DB:`, {
          cause: error
        });
      }
    }

    getCountsForSubreddit(
      id: string[],
      search?: string
    ): Record<string, CountsForSubreddit>;
    getCountsForSubreddit(
      id: string,
      search?: string
    ): CountsForSubreddit | null;
    getCountsForSubreddit(id: string | string[], search?: string) {
      const isMultiple = Array.isArray(id);
      if (!Array.isArray(id)) {
        id = [id];
      }
      try {
        const postCountSql =
          search ?
            `
          (SELECT
            COUNT(post.post_id)
          FROM
            post_fts
          LEFT JOIN
            post_fts_source ON post_fts_source.fts_rowid = post_fts.rowid
          LEFT JOIN
            post ON post.post_id = post_fts_source.post_id
          WHERE post_fts MATCH ? AND post.subreddit_id = subreddit.subreddit_id)
        `
          : 'subreddit.post_count';
        const whereValues = search ? [search, ...id] : [...id];
        const rows = this.db
          .prepare(
            `
            SELECT
              subreddit.subreddit_id,
              subreddit.media_count,
              ${postCountSql} AS post_count
            FROM
              subreddit
            WHERE
              subreddit.subreddit_id IN (${id.map(() => '?').join(', ')})
          `
          )
          .all(...whereValues) as {
          subreddit_id: string;
          post_count: number;
          media_count: number;
        }[];
        const mapped = rows.map((row) => ({
          subredditId: row.subreddit_id,
          media: row.media_count,
          post: row.post_count
        }));
        if (isMultiple) {
          const result: Record<string, CountsForSubreddit> = {};
          for (const counts of mapped) {
            result[counts.subredditId] = {
              media: counts.media,
              post: counts.post
            };
          }
          return result;
        }
        return mapped.length > 0 ?
            {
              media: mapped[0].media,
              post: mapped[0].post
            }
          : null;
      } catch (error) {
        throw Error(
          `Failed to get counts for subreddit "${JSON.stringify(id)}" from DB:`,
          { cause: error }
        );
      }
    }

    getSubredditCount(search?: string) {
      try {
        const result =
          search ?
            (this.db
              .prepare(
                `
              SELECT COUNT(subreddit_fts) AS subreddit_count
              FROM subreddit_fts
              WHERE subreddit_fts MATCH ?
              `
              )
              .get(search) as { subreddit_count: number } | undefined)
          : (this.db
              .prepare(
                `SELECT COUNT(subreddit_id) AS subreddit_count FROM subreddit`
              )
              .get() as { subreddit_count: number } | undefined);
        return result ? result.subreddit_count : null;
      } catch (error) {
        this.log('error', `Failed to get subreddit count from DB:`, error);
        return null;
      }
    }

    checkSubredditExists(id: string): boolean {
      try {
        const result = this.db
          .prepare(
            `SELECT COUNT(subreddit_id) as count FROM subreddit WHERE subreddit_id = ?`
          )
          .get(id) as { count: number };
        return result.count > 0;
      } catch (error) {
        this.log(
          'error',
          `Failed to check if subreddit "${id}" exists in DB:`,
          error
        );
        return false;
      }
    }
  };
}
