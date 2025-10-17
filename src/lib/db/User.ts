import { type Subreddit } from '../entities/Subreddit';
import { type UserWithCounts, type User } from '../entities/User';
import { type MediaDBConstructor } from './Media';

export type DBGetUsersParams = {
  followedBy?: string;
  limit: number;
  offset: number;
} & (
  | {
      search?: undefined;
      sortBy: 'a-z' | 'z-a' | 'most_posts' | 'most_media' | 'karma';
    }
  | {
      search: string;
      sortBy:
        | 'best_match'
        | 'a-z'
        | 'z-a'
        | 'most_posts'
        | 'most_media'
        | 'karma';
    }
);

export interface CountsForUser {
  media: number;
  post: number;
  savedPost: number;
  savedComment: number;
  joinedSubreddit: number;
  following: number;
}

export function UserDBMixin<TBase extends MediaDBConstructor>(Base: TBase) {
  return class UserDB extends Base {
    saveUser(user: User) {
      try {
        // Check if user already exists in DB
        const userExists = this.checkUserExists(user.username);
        this.db.exec('BEGIN TRANSACTION;');
        if (!userExists) {
          this.log('debug', `INSERT user "${user.username}"`);
          this.db
            .prepare(
              `INSERT INTO user (username, post_count, media_count, saved_post_count, saved_comment_count, karma, details) VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(user.username, 0, 0, 0, 0, user.karma, JSON.stringify(user));
        } else {
          this.log('debug', `UPDATE user "${user.username}"`);
          this.db
            .prepare(`UPDATE user SET details = ? WHERE username = ?`)
            .run(JSON.stringify(user), user.username);
        }
        [user.avatar, user.banner, user.icon].forEach((image) => {
          if (image?.downloaded) {
            this.saveMedia(image.downloaded, 'image');
          }
        });
        this.db.exec('COMMIT;');
      } catch (error) {
        this.log(
          'error',
          `Failed to save user "${user.username}" to DB:`,
          error
        );
        this.db.exec('ROLLBACK;');
      }
    }

    getUser(username: string): User | null {
      try {
        const result = this.db
          .prepare(`SELECT details FROM user WHERE username = ?`)
          .get(username) as { details: string } | undefined;
        return result ? JSON.parse(result.details) : null;
      } catch (error) {
        this.log('error', `Failed to get user "${username}" from DB:`, error);
        return null;
      }
    }

    getUsers(params: DBGetUsersParams) {
      const { followedBy, search, sortBy, limit, offset } = params;

      const whereClauseParts: string[] = [];
      const whereValues: (string | number)[] = [];
      if (search) {
        whereClauseParts.push('user_fts MATCH ?');
        whereValues.push(search);
      }
      if (followedBy) {
        whereClauseParts.push('following.followed_by = ?');
        whereValues.push(followedBy);
      }
      const whereClause =
        whereClauseParts.length > 0 ?
          `WHERE ${whereClauseParts.join(' AND ')}`
        : '';

      let orderByClause: string;
      switch (sortBy) {
        case 'a-z':
          orderByClause = 'ORDER BY user.username ASC';
          break;
        case 'z-a':
          orderByClause = 'ORDER BY user.username DESC';
          break;
        case 'most_posts':
          orderByClause = 'ORDER BY user.post_count DESC';
          break;
        case 'most_media':
          orderByClause = 'ORDER BY user.media_count DESC';
          break;
        case 'karma':
          orderByClause = 'ORDER BY user.karma DESC';
          break;
        case 'best_match':
          orderByClause = 'ORDER BY bm25(user_fts) DESC';
          break;
      }

      let fromClause: string;
      if (search) {
        fromClause = `
          FROM
            user_fts
          LEFT JOIN
            user_fts_source ON user_fts_source.fts_rowid = user_fts.rowid
          LEFT JOIN
            user ON user.username = user_fts_source.username
        `;
      } else {
        fromClause = 'FROM user';
      }
      if (followedBy) {
        fromClause = `${fromClause}
          INNER JOIN following ON user.username = following.username`;
      }

      try {
        const rows = this.db
          .prepare(
            `
          SELECT
            user.details,
            user.post_count,
            user.media_count,
            user.saved_post_count,
            user.saved_comment_count,
            user.joined_subreddit_count,
            user.following_count
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
          saved_post_count: number | null;
          saved_comment_count: number | null;
          joined_subreddit_count: number | null;
          following_count: number | null;
        }[];
        return rows.map<UserWithCounts>((row) => ({
          user: JSON.parse(row.details),
          counts: {
            post: row.post_count || 0,
            media: row.media_count || 0,
            savedPost: row.saved_post_count || 0,
            savedComment: row.saved_comment_count || 0,
            joinedSubreddit: row.joined_subreddit_count || 0,
            following: row.following_count || 0
          }
        }));
      } catch (error) {
        const _error = Error(`Failed to get users from DB:`, {
          cause: error
        });
        this.log('error', _error);
        throw _error;
      }
    }

    getCountsForUser(
      username: string[],
      search?: string
    ): Record<string, CountsForUser>;
    getCountsForUser(username: string, search?: string): CountsForUser | null;
    getCountsForUser(username: string | string[], search?: string) {
      const isMultiple = Array.isArray(username);
      if (!Array.isArray(username)) {
        username = [username];
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
          WHERE post_fts MATCH ? AND post.author = user.username)
        `
          : 'user.post_count';
        const whereValues = search ? [search, ...username] : [...username];
        const rows = this.db
          .prepare(
            `
            SELECT
              user.username,
              user.media_count,
              user.saved_post_count,
              user.saved_comment_count,
              user.joined_subreddit_count,
              user.following_count,
              ${postCountSql} AS post_count
            FROM
              user
            WHERE
              user.username IN (${username.map(() => '?').join(', ')})
          `
          )
          .all(...whereValues) as {
          username: string;
          media_count: number;
          post_count: number;
          saved_post_count: number | null;
          saved_comment_count: number | null;
          joined_subreddit_count: number | null;
          following_count: number | null;
        }[];
        const mapped = rows.map((row) => ({
          username: row.username,
          media: row.media_count,
          post: row.post_count,
          savedPost: row.saved_post_count || 0,
          savedComment: row.saved_comment_count || 0,
          joinedSubreddit: row.joined_subreddit_count || 0,
          following: row.following_count || 0
        }));
        if (isMultiple) {
          const result: Record<string, CountsForUser> = {};
          for (const counts of mapped) {
            result[counts.username] = {
              media: counts.media,
              post: counts.post,
              savedPost: counts.savedPost,
              savedComment: counts.savedComment,
              joinedSubreddit: counts.joinedSubreddit,
              following: counts.following
            };
          }
          return result;
        }
        return mapped.length > 0 ?
            {
              media: mapped[0].media,
              post: mapped[0].post,
              savedPost: mapped[0].savedPost,
              savedComment: mapped[0].savedComment,
              joinedSubreddit: mapped[0].joinedSubreddit,
              following: mapped[0].following
            }
          : null;
      } catch (error) {
        throw Error(
          `Failed to get counts for user "${JSON.stringify(username)}" from DB:`,
          { cause: error }
        );
      }
    }

    getUserCount(search?: string, followedBy?: string) {
      let selectClause: string;
      let fromClause: string;
      const whereClauseParts: string[] = [];
      const whereValues: (string | number)[] = [];
      if (search) {
        selectClause = 'SELECT COUNT(user_fts) AS user_count';
        fromClause = 'FROM user_fts';
        if (followedBy) {
          fromClause = `${fromClause}
            LEFT JOIN
              user_fts_source ON user_fts_source.fts_rowid = user_fts.rowid
            LEFT JOIN
              user ON user.username = user_fts_source.username
            INNER JOIN
              following ON user.username = following.username`;
        }
      } else {
        selectClause = 'SELECT COUNT(user.username) AS user_count';
        fromClause = 'FROM user';
        if (followedBy) {
          fromClause = `${fromClause}
            INNER JOIN
              following ON user.username = following.username`;
        }
      }
      if (search) {
        whereClauseParts.push('user_fts MATCH ?');
        whereValues.push(search);
      }
      if (followedBy) {
        whereClauseParts.push('following.followed_by = ?');
        whereValues.push(followedBy);
      }
      const whereClause =
        whereClauseParts.length > 0 ?
          `WHERE ${whereClauseParts.join(' AND ')}`
        : '';

      try {
        const result = this.db
          .prepare(
            `
          ${selectClause}
          ${fromClause}
          ${whereClause}
          `
          )
          .get(...whereValues) as { user_count: number } | undefined;
        return result ? result.user_count : null;
      } catch (error) {
        this.log('error', `Failed to get user count from DB:`, error);
        return null;
      }
    }

    checkUserExists(username: string): boolean {
      try {
        const result = this.db
          .prepare(
            `SELECT COUNT(username) as count FROM user WHERE username = ?`
          )
          .get(username) as { count: number };
        return result.count > 0;
      } catch (error) {
        this.log(
          'error',
          `Failed to check if user "${username}" exists in DB:`,
          error
        );
        return false;
      }
    }

    saveJoinedSubredditInfo(
      subreddit: Subreddit | string,
      joinedBy: User | string
    ) {
      const subredditId =
        typeof subreddit === 'string' ? subreddit : subreddit.id;
      const username =
        typeof joinedBy === 'string' ? joinedBy : joinedBy.username;
      try {
        this.db.exec('BEGIN TRANSACTION;');
        const exists = this.checkJoinedSubredditInfoExists(
          subredditId,
          username
        );
        if (!exists) {
          this.db
            .prepare(
              `
              INSERT INTO joined_subreddit (
                subreddit_id,
                joined_by
              ) VALUES (?, ?)`
            )
            .run(subredditId, username);
        }
        this.#refreshUserStats(username);
        this.db.exec('COMMIT;');
      } catch (error: any) {
        this.db.exec('ROLLBACK;');
        const paramsStr = `[subredditId: ${subredditId}; joinedBy: ${username}]`;
        throw Error(
          `An error occurred while writing joined_subreddit ${paramsStr} to database.`,
          {
            cause: error
          }
        );
      }
    }

    checkJoinedSubredditInfoExists(
      subreddit: Subreddit | string,
      joinedBy: User | string
    ) {
      const subredditId =
        typeof subreddit === 'string' ? subreddit : subreddit.id;
      const username =
        typeof joinedBy === 'string' ? joinedBy : joinedBy.username;
      try {
        const result = this.db
          .prepare(
            `
            SELECT
              COUNT(*) as count
            FROM
              joined_subreddit
            WHERE
              subreddit_id = ? AND
              joined_by = ?
          `
          )
          .get(subredditId, username) as { count: number };
        return result.count > 0;
      } catch (error) {
        const paramsStr = `[subredditId: ${subredditId}; joinedBy: ${username}]`;
        this.log(
          'error',
          `Failed to check if joined_subreddit ${paramsStr} exists in DB:`,
          error
        );
        return false;
      }
    }

    saveFollowing(user: User | string, followedBy: User | string) {
      const username = typeof user === 'string' ? user : user.username;
      const followedByUsername =
        typeof followedBy === 'string' ? followedBy : followedBy.username;
      try {
        this.db.exec('BEGIN TRANSACTION;');
        const exists = this.checkFollowingExists(username, followedByUsername);
        if (!exists) {
          this.db
            .prepare(
              `
              INSERT INTO following (
                username,
                followed_by
              ) VALUES (?, ?)`
            )
            .run(username, followedByUsername);
        }
        this.#refreshUserStats(followedByUsername);
        this.db.exec('COMMIT;');
      } catch (error: any) {
        this.db.exec('ROLLBACK;');
        const paramsStr = `[username: ${username}; followedBy: ${followedByUsername}]`;
        throw Error(
          `An error occurred while writing following info ${paramsStr} to database.`,
          {
            cause: error
          }
        );
      }
    }

    checkFollowingExists(user: User | string, followedBy: User | string) {
      const username = typeof user === 'string' ? user : user.username;
      const followedByUsername =
        typeof followedBy === 'string' ? followedBy : followedBy.username;
      try {
        const result = this.db
          .prepare(
            `
            SELECT
              COUNT(*) as count
            FROM
              following
            WHERE
              username = ? AND
              followed_by = ?
          `
          )
          .get(username, followedByUsername) as { count: number };
        return result.count > 0;
      } catch (error) {
        const paramsStr = `[username: ${username}; followedBy: ${followedByUsername}]`;
        this.log(
          'error',
          `Failed to check if following info ${paramsStr} exists in DB:`,
          error
        );
        return false;
      }
    }

    #refreshUserStats(user: User | string) {
      const username = typeof user === 'string' ? user : user.username;
      this.log(
        'debug',
        `Refresh user joined_subreddi / following stats for "${username}"`
      );
      try {
        this.db
          .prepare(
            `
          UPDATE user
          SET
            joined_subreddit_count = (SELECT COUNT(subreddit_id) FROM joined_subreddit WHERE joined_by = user.username),
            following_count = (SELECT COUNT(username) FROM following WHERE followed_by = user.username)
          WHERE username = ?
        `
          )
          .run(username);
      } catch (error) {
        this.log(
          'error',
          `Failed to refresh user joined_subreddit / following stats in DB for "${username}":`,
          error
        );
      }
    }
  };
}
