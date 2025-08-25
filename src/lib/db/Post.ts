import {
  type Post,
  type PostComment,
  type PostCommentWithPost,
  PostType
} from '../entities/Post';
import { type Downloaded } from '../entities/Common';
import { type MediaDBConstructor } from './Media';

export type DBGetPostsParams = {
  author?: string;
  subredditId?: string;
  limit: number;
  offset: number;
} & (
  | {
      search?: undefined;
      sortBy: 'latest' | 'oldest' | 'top';
    }
  | {
      search: string;
      sortBy: 'best_match' | 'latest' | 'oldest' | 'top';
    }
);

export function PostDBMixin<TBase extends MediaDBConstructor>(Base: TBase) {
  return class PostDB extends Base {
    savePost(post: Post<PostType>) {
      try {
        this.db.exec('BEGIN TRANSACTION;');

        // Check if post already exists in DB
        const postExists = this.checkPostExists(post.id);
        if (!postExists) {
          this.log('debug', `INSERT post "${post.id}"`);
          this.db
            .prepare(
              `INSERT INTO post (
                post_id,
                author,
                subreddit_id,
                created_utc,
                score,
                comment_count_all, 
                comment_count_top_level,
                details
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              post.id,
              post.author.username,
              post.subreddit.id,
              post.createdUTC,
              post.upvotes - post.downvotes,
              post.commentCount.all,
              post.commentCount.topLevel,
              JSON.stringify({ ...post, comments: [] })
            );
        } else {
          this.log('debug', `UPDATE post "${post.id}"`);
          this.db
            .prepare(
              `UPDATE
                post
              SET
                author = ?,
                subreddit_id = ?,
                score = ?,
                comment_count_all = ?,
                comment_count_top_level = ?,
                details = ? WHERE post_id = ?`
            )
            .run(
              post.author.username,
              post.subreddit.id,
              post.upvotes - post.downvotes,
              post.commentCount.all,
              post.commentCount.topLevel,
              JSON.stringify({ ...post, comments: [] }),
              post.id
            );
        }

        // Make sure post_media is cleared for this post
        this.db
          .prepare(`DELETE FROM post_media WHERE post_id = ?`)
          .run(post.id);

        const savedMediaIds: (number | bigint)[] = [];

        const __saveMedia = (
          downloaded: Downloaded,
          index: number,
          mediaType: 'image' | 'video',
          thumbnail?: Downloaded | null
        ) => {
          const { mediaId } = this.saveMedia(downloaded, mediaType, thumbnail);
          // Edge case: sometimes a post has duplicate media, which will cause the same mediaId to be inserted into post_media, which will in turn violate the PK constraint.
          // We need to check for this and skip the insert.
          if (savedMediaIds.includes(mediaId)) {
            return;
          }
          this.log(
            'debug',
            `INSERT post_media (media_id: ${mediaId}, post_id: ${post.id}, media_index: ${index}, subreddit_id: ${post.subreddit.id}, uploader: ${post.author.username})`
          );
          this.db
            .prepare(
              `INSERT INTO post_media (media_id, post_id, post_created_utc, media_index, subreddit_id, uploader) VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
              mediaId,
              post.id,
              post.createdUTC,
              index,
              post.subreddit.id,
              post.author.username
            );
          savedMediaIds.push(mediaId);
        };

        switch (post.type) {
          case PostType.IMAGE: {
            const _post = post as Post<PostType.IMAGE>;
            if (_post.media?.image.downloaded) {
              __saveMedia(
                _post.media.image.downloaded,
                0,
                'image',
                _post.media?.thumbnail?.downloaded
              );
            }
            break;
          }
          case PostType.GALLERY: {
            const _post = post as Post<PostType.GALLERY>;
            if (_post.media) {
              _post.media.forEach((media, index) => {
                if (media?.image.downloaded) {
                  __saveMedia(
                    media.image.downloaded,
                    index,
                    'image',
                    media?.thumbnail?.downloaded
                  );
                }
              });
            }
            break;
          }
          case PostType.HOSTED_VIDEO: {
            const _post = post as Post<PostType.HOSTED_VIDEO>;
            if (_post.media?.src.downloaded) {
              __saveMedia(
                _post.media.src.downloaded,
                0,
                'video',
                _post.media?.thumbnail?.downloaded
              );
            }
            break;
          }
          case PostType.RICH_VIDEO: {
            const _post = post as Post<PostType.RICH_VIDEO>;
            if (_post.media?.content.downloaded) {
              __saveMedia(
                _post.media.content.downloaded,
                0,
                'video',
                _post.media?.thumbnail?.downloaded
              );
            }
            break;
          }
        }

        // Embedded content media
        if (post.content.embeddedMedia) {
          post.content.embeddedMedia.forEach((media, index) => {
            if (media?.image.downloaded) {
              __saveMedia(
                media.image.downloaded,
                index,
                'image',
                media?.thumbnail?.downloaded
              );
            }
          });
        }

        // Comments
        this.db
          .prepare(`DELETE FROM post_comment WHERE post_id = ?`)
          .run(post.id);
        for (const comment of post.comments) {
          this.#savePostComment(post, comment);
        }

        // Refresh stats
        this.#refreshUserStats(post.author.username);
        this.#refreshSubredditStats(post.subreddit.id);
        this.#refreshMediaStats(
          savedMediaIds,
          post.author.username,
          post.subreddit.id
        );

        this.db.exec('COMMIT;');
      } catch (error: any) {
        this.db.exec('ROLLBACK;');
        throw Error('An error occurred while writing post to database.', {
          cause: error
        });
      }
    }

    #savePostComment(
      post: Post<PostType>,
      comment: PostComment,
      parent?: PostComment
    ) {
      this.log(
        'debug',
        `INSERT post_comment (post_comment_id: ${comment.id}, post_id: ${post.id})`
      );
      this.db
        .prepare(
          `
        INSERT INTO post_comment(
          post_comment_id,
          post_id,
          author,
          parent_id,
          created_utc,
          score,
          details
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          comment.id,
          post.id,
          comment.author,
          parent?.id || null,
          comment.createdUTC,
          comment.upvotes - comment.downvotes,
          JSON.stringify({ ...comment, replies: [] })
        );
      if (comment.replies.length > 0) {
        for (const reply of comment.replies) {
          this.#savePostComment(post, reply, comment);
        }
      }
    }

    getPost(id: string): Post<PostType> | null {
      try {
        const result = this.db
          .prepare(`SELECT details FROM post WHERE post_id = ?`)
          .get(id) as { details: string } | undefined;
        if (result) {
          const post = JSON.parse(result.details) as Post<PostType>;
          return post;
        }
        return null;
      } catch (error) {
        this.log('error', `Failed to get post "${id}" from DB:`, error);
        return null;
      }
    }

    getPosts(params: DBGetPostsParams): Post<PostType>[] {
      const { author, subredditId, search, sortBy, limit, offset } = params;

      const whereClauseParts: string[] = [];
      const whereValues: (string | number)[] = [];
      if (author) {
        whereClauseParts.push('post.author = ?');
        whereValues.push(author);
      }
      if (subredditId) {
        whereClauseParts.push('post.subreddit_id = ?');
        whereValues.push(subredditId);
      }
      if (search) {
        whereClauseParts.push('post_fts MATCH ?');
        whereValues.push(search);
      }
      const whereClause =
        whereClauseParts.length > 0 ?
          `WHERE ${whereClauseParts.join(' AND ')}`
        : '';

      let orderByClause: string;
      switch (sortBy) {
        case 'latest':
          orderByClause = 'ORDER BY created_utc DESC';
          break;
        case 'oldest':
          orderByClause = 'ORDER BY created_utc ASC';
          break;
        case 'top':
          orderByClause = 'ORDER BY score DESC';
          break;
        case 'best_match':
          orderByClause = 'ORDER BY bm25(post_fts) DESC';
          break;
      }

      let fromClause: string;
      if (search) {
        fromClause = `
          FROM
            post_fts
          LEFT JOIN
            post_fts_source ON post_fts_source.fts_rowid = post_fts.rowid
          LEFT JOIN
            post ON post.post_id = post_fts_source.post_id
        `;
      } else {
        fromClause = 'FROM post';
      }
      try {
        const rows = this.db
          .prepare(
            `
          SELECT post.details
          ${fromClause}
          ${whereClause}
          ${orderByClause}
          LIMIT ? OFFSET ?
        `
          )
          .all(...whereValues, limit, offset) as { details: string }[];

        return rows.map<Post<PostType>>((row) => JSON.parse(row.details));
      } catch (error) {
        const _error = Error(
          `Failed to get posts from DB (${JSON.stringify(params, null, 2)}):`,
          {
            cause: error
          }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    getPostsContainingMedia(mediaId: number) {
      try {
        const rows = this.db
          .prepare(
            `
          SELECT post.details
          FROM
            post_media
            LEFT JOIN post ON post_media.post_id = post.post_id
          WHERE post_media.media_id = ? ORDER BY post.created_utc DESC;`
          )
          .all(mediaId) as { details: string }[];
        return rows.map<Post<PostType>>((row) => JSON.parse(row.details));
      } catch (error) {
        const _error = Error(
          `Failed to get posts containing media "${mediaId}" from DB:`,
          {
            cause: error
          }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    getPostCount(search?: string, author?: string, subredditId?: string) {
      try {
        const whereClauseParts: string[] = [];
        const whereValues: (string | number)[] = [];
        if (author) {
          whereClauseParts.push('post.author = ?');
          whereValues.push(author);
        }
        if (subredditId) {
          whereClauseParts.push('post.subreddit_id = ?');
          whereValues.push(subredditId);
        }
        if (search) {
          whereClauseParts.push('post_fts MATCH ?');
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
              post_fts
            LEFT JOIN
              post_fts_source ON post_fts_source.fts_rowid = post_fts.rowid
            LEFT JOIN
              post ON post.post_id = post_fts_source.post_id
          `;
        } else {
          fromClause = 'FROM post';
        }

        const sql = `
          SELECT COUNT(DISTINCT post.post_id) AS post_count
          ${fromClause}
          ${whereClause}
        `;

        const result = this.db.prepare(sql).get(...whereValues) as
          | { post_count: number }
          | undefined;
        return result ? result.post_count : null;
      } catch (error) {
        this.log('error', `Failed to get post count from DB:`, error);
        return null;
      }
    }

    checkPostExists(id: string) {
      try {
        const result = this.db
          .prepare(`SELECT COUNT(post_id) as count FROM post WHERE post_id = ?`)
          .get(id) as { count: number };
        return result.count > 0;
      } catch (error) {
        this.log(
          'error',
          `Failed to check if post "${id}" exists in DB:`,
          error
        );
        return false;
      }
    }

    searchPostComments(params: {
      search: string;
      author?: string;
      subredditId?: string;
      sortBy: 'best_match' | 'latest' | 'oldest' | 'top';
      limit: number;
      offset: number;
    }) {
      const { search, author, subredditId, sortBy, limit, offset } = params;
      let orderBy: string;
      switch (sortBy) {
        case 'best_match':
          orderBy = 'bm25(post_comment_fts)';
          break;
        case 'latest':
          orderBy = 'comment.created_utc DESC';
          break;
        case 'oldest':
          orderBy = 'comment.created_utc ASC';
          break;
        case 'top':
          orderBy = 'comment.score DESC';
          break;
      }
      const whereParts: string[] = ['post_comment_fts MATCH ?'];
      const whereValues: string[] = [search];
      if (author) {
        whereParts.push('post.author = ?');
        whereValues.push(author);
      }
      if (subredditId) {
        whereParts.push('post.subreddit_id = ?');
        whereValues.push(subredditId);
      }
      const sql = `
        SELECT
          post_details,
          comment_details
        FROM (
          SELECT
            post.details AS post_details,
            comment.details AS comment_details,
            ROW_NUMBER() OVER (PARTITION BY post.post_id ORDER BY ${orderBy}) AS rn
          FROM
            post_comment_fts
          LEFT JOIN
            post_comment_fts_source source ON source.fts_rowid = post_comment_fts.rowid
          LEFT JOIN
            post_comment comment ON comment.post_comment_id = source.post_comment_id
          LEFT JOIN
            post ON post.post_id = comment.post_id
          WHERE
            ${whereParts.join(' AND ')}
        )
        WHERE rn = 1
        LIMIT ? OFFSET ?;
      `;
      const rows = this.db.prepare(sql).all(...whereValues, limit, offset) as {
        post_details: string;
        comment_details: string;
      }[];
      return rows.map<PostCommentWithPost>((row) => ({
        comment: JSON.parse(row.comment_details),
        post: JSON.parse(row.post_details)
      }));
    }

    getPostCommentSearchResultCount(
      search: string,
      author?: string,
      subredditId?: string
    ) {
      const whereParts: string[] = ['post_comment_fts MATCH ?'];
      const whereValues: string[] = [search];
      if (author) {
        whereParts.push('post.author = ?');
        whereValues.push(author);
      }
      if (subredditId) {
        whereParts.push('post.subreddit_id = ?');
        whereValues.push(subredditId);
      }
      const sql = `
        SELECT
          COUNT(*) AS post_comment_count
        FROM (
          SELECT
            ROW_NUMBER() OVER (PARTITION BY comment.post_id) AS rn
          FROM
            post_comment_fts
          LEFT JOIN
            post_comment_fts_source source ON source.fts_rowid = post_comment_fts.rowid
          LEFT JOIN
            post_comment comment ON comment.post_comment_id = source.post_comment_id
          LEFT JOIN
            post ON post.post_id = comment.post_id
          WHERE
            ${whereParts.join(' AND ')}
        )
        WHERE rn = 1;
      `;
      const result = this.db.prepare(sql).get(...whereValues) as
        | { post_comment_count: number }
        | undefined;
      return result ? result.post_comment_count : null;
    }

    getPostComment(id: string): PostComment {
      try {
        const result = this.db
          .prepare(
            `
          SELECT
            details
          FROM post_comment
          WHERE post_comment_id = ?
        `
          )
          .get(id) as { details: string };
        return JSON.parse(result.details);
      } catch (error) {
        const _error = Error(`Failed to get post comment "${id}" from DB:`, {
          cause: error
        });
        this.log('error', _error);
        throw _error;
      }
    }

    getTopLevelPostComments(params: {
      postId: string;
      replyCount: number;
      sortBy: 'latest' | 'oldest' | 'top';
      limit: number;
      offset: number;
    }) {
      const { postId, replyCount, sortBy, limit, offset } = params;
      let orderByClause = '';
      switch (sortBy) {
        case 'latest':
          orderByClause = 'ORDER BY created_utc DESC';
          break;
        case 'oldest':
          orderByClause = 'ORDER BY created_utc ASC';
          break;
        case 'top':
          orderByClause = 'ORDER BY score DESC';
          break;
      }
      try {
        const rows = this.db
          .prepare(
            `
          SELECT
            details
          FROM post_comment
          WHERE post_id = ? AND parent_id IS NULL
          ${orderByClause}
          LIMIT ? OFFSET ?
        `
          )
          .all(postId, limit, offset) as { details: string }[];
        const comments = rows.map<PostComment>((row) =>
          JSON.parse(row.details)
        );
        if (replyCount > 0) {
          const commentIds = comments.map((comment) => comment.id);
          const replies = this.getPostCommentReplies({
            parentIds: commentIds,
            sortBy,
            replyCount: 0,
            limit: replyCount,
            offset: 0
          });
          comments.forEach((comment) => {
            comment.replies = replies[comment.id] || [];
          });
        }
        return comments;
      } catch (error) {
        const _error = Error(
          `Failed to get top-level post comments for post "${postId}" from DB:`,
          {
            cause: error
          }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    getPostCommentReplies(params: {
      parentIds: string[];
      sortBy: 'latest' | 'oldest' | 'top';
      replyCount: number;
      limit: number;
      offset: number;
    }) {
      const { parentIds, replyCount, sortBy, limit, offset } = params;
      let orderByClause = '';
      switch (sortBy) {
        case 'latest':
          orderByClause = 'ORDER BY created_utc DESC';
          break;
        case 'oldest':
          orderByClause = 'ORDER BY created_utc ASC';
          break;
        case 'top':
          orderByClause = 'ORDER BY score DESC';
          break;
      }
      try {
        const rows = this.db
          .prepare(
            `
          WITH partitioned AS (
            SELECT *,
              ROW_NUMBER() OVER (
                PARTITION BY parent_id
                ${orderByClause}
              ) AS rn
            FROM post_comment
          )
          SELECT parent_id, details FROM partitioned
          WHERE
            parent_id IN (${parentIds.map(() => '?').join(', ')}) AND
            rn > ? AND rn <= ?;
        `
          )
          .all(...parentIds, offset, offset + limit) as {
          parent_id: string;
          details: string;
        }[];
        const replies = parentIds.reduce<Record<string, PostComment[]>>(
          (result, id) => {
            result[id] = [];
            return result;
          },
          {}
        );
        rows.forEach((row) => {
          const parentId = row['parent_id'];
          if (replies[parentId]) {
            replies[parentId].push(JSON.parse(row.details));
          }
        });
        if (replyCount > 0) {
          const commentIds = Object.values(replies).reduce<string[]>(
            (result, comments) => {
              const ids = comments.map((comment) => comment.id);
              result.push(...ids);
              return result;
            },
            []
          );
          const repliesToReplies = this.getPostCommentReplies({
            parentIds: commentIds,
            sortBy,
            replyCount: 0,
            limit: replyCount,
            offset: 0
          });
          for (const reply of Object.values(replies)) {
            reply.forEach((r) => (r.replies = repliesToReplies[r.id] || []));
          }
        }
        return replies;
      } catch (error) {
        const _error = Error(
          `Failed to get replies for post comments ${JSON.stringify(parentIds)} from DB:`,
          {
            cause: error
          }
        );
        this.log('error', _error);
        throw _error;
      }
    }

    #refreshUserStats(username: string) {
      this.log('debug', `Refresh user stats for "${username}"`);
      try {
        this.db
          .prepare(
            `
          UPDATE user
          SET
            post_count = (SELECT COUNT(DISTINCT post_id) FROM post WHERE author = user.username),
            media_count = (SELECT COUNT(DISTINCT media_id) FROM post_media WHERE uploader = user.username)
          WHERE username = ?
        `
          )
          .run(username);
      } catch (error) {
        this.log(
          'error',
          `Failed to refresh user stats in DB for "${username}":`,
          error
        );
      }
    }

    #refreshSubredditStats(subredditId: string) {
      this.log('debug', `Refresh subreddit stats for "${subredditId}"`);
      try {
        this.db
          .prepare(
            `
          UPDATE subreddit
          SET
            post_count = (SELECT COUNT(DISTINCT post_id) FROM post WHERE subreddit_id = subreddit.subreddit_id),
            media_count = (SELECT COUNT(DISTINCT media_id) FROM post_media WHERE subreddit_id = subreddit.subreddit_id)
          WHERE subreddit_id = ?
        `
          )
          .run(subredditId);
      } catch (error) {
        this.log(
          'error',
          `Failed to refresh subreddit stats in DB for "${subredditId}":`,
          error
        );
      }
    }

    #refreshMediaStats(
      mediaIds: (number | bigint)[],
      username: string,
      subredditId: string
    ) {
      if (mediaIds.length === 0) {
        return;
      }
      try {
        const mediaIdPlaceholders = mediaIds.map(() => '?').join(', ');
        this.log(
          'debug',
          `Refresh media_stats for ${JSON.stringify(mediaIds)}`
        );
        this.db
          .prepare(
            `
          UPDATE media_stats
          SET
            post_count = (SELECT COUNT(DISTINCT post_id) FROM post_media WHERE media_id = media_stats.media_id)
          WHERE media_id IN (${mediaIdPlaceholders});
        `
          )
          .run(...mediaIds);
        this.log(
          'debug',
          `Refresh post_media.is_post_latest for ${JSON.stringify(mediaIds)}`
        );

        const __getExistCondition = (type?: 'by_uploader' | 'in_subreddit') => {
          const w =
            type === 'by_uploader' ? 'AND p2.uploader = post_media.uploader'
            : type === 'in_subreddit' ?
              'AND p2.subreddit_id = post_media.subreddit_id'
            : '';
          return `
            SELECT 1
            FROM post_media p2
            WHERE p2.media_id = post_media.media_id ${w}
              AND
              (
                p2.post_created_utc > post_media.post_created_utc OR
                (p2.post_created_utc = post_media.post_created_utc AND p2.post_id > post_media.post_id)
              )
          `;
        };

        const __getUpdateIsLatestSql = (
          value: 0 | 1,
          type?: 'by_uploader' | 'in_subreddit'
        ) => {
          let f: string;
          let w: string;
          let q: (string | number | bigint)[];
          switch (type) {
            case 'by_uploader':
              f = 'is_post_latest_by_uploader';
              w = 'uploader = ? AND';
              q = [username, ...mediaIds];
              break;
            case 'in_subreddit':
              f = 'is_post_latest_in_subreddit';
              w = 'subreddit_id = ? AND';
              q = [subredditId, ...mediaIds];
              break;
            default:
              f = 'is_post_latest';
              w = '';
              q = mediaIds;
          }
          const sql = `
            UPDATE post_media
            SET ${f} = ${value}
            WHERE
              ${w}
              media_id IN (${mediaIdPlaceholders})
              AND ${value === 1 ? 'NOT' : ''} EXISTS (${__getExistCondition(type)});
          `;
          return {
            sql,
            params: q
          };
        };

        const __updateIsLatest = (type?: 'by_uploader' | 'in_subreddit') => {
          const { sql: sql0, params: params0 } = __getUpdateIsLatestSql(
            0,
            type
          );
          const { sql: sql1, params: params1 } = __getUpdateIsLatestSql(
            1,
            type
          );
          this.db.prepare(sql0).run(...params0);
          this.db.prepare(sql1).run(...params1);
        };

        __updateIsLatest();
        __updateIsLatest('by_uploader');
        __updateIsLatest('in_subreddit');
      } catch (error) {
        this.log(
          'error',
          `Failed to refresh media stats in DB for ${JSON.stringify(mediaIds)}:`,
          error
        );
      }
    }
  };
}
