import { type Post, type PostComment, type PostType } from '../entities/Post';
import { type User } from '../entities/User';
import { Abortable, isAbortError } from '../utils/Abortable';
import ObjectHelper from '../utils/ObjectHelper';
import { type PostAPIConstructor } from './Post';

const MAX_LIMIT = 100;

export interface FetchSavedItemsParams {
  user: User;
  after?: string;
  limit?: number;
}

export interface FetchSavedItemsResult {
  items: (
    | { type: 'post'; post: Post<PostType> }
    | { type: 'postComment'; comment: PostComment; postId: string | null }
  )[];
  after: string | null;
  errorCount: number;
}

export function SavedItemAPIMixin<TBase extends PostAPIConstructor>(
  Base: TBase
) {
  return class SavedItemAPI extends Base {
    async fetchSavedItems(
      params: FetchSavedItemsParams
    ): Promise<FetchSavedItemsResult> {
      const { user, after, limit = MAX_LIMIT } = params;
      try {
        const { json: data } = await this.defaultLimiter.schedule(() =>
          this.fetcher.fetchAPI({
            endpoint: `/user/${user.username}/saved.json`,
            params: {
              raw_json: '1',
              sr_detail: '1',
              limit: String(limit),
              after: after || null
            }
          })
        );
        const children = ObjectHelper.getProperty(data, 'data.children');
        if (!Array.isArray(children)) {
          throw new TypeError('data.children is not an array');
        }
        const mappedPostResults = await Promise.all(
          children.map((child) =>
            Abortable.wrap(async () => {
              const kind = ObjectHelper.getProperty(child, 'kind');
              if (kind === 't1') {
                // t1: comment
                const linkId = ObjectHelper.getProperty(child, 'data.link_id');
                const postId =
                  typeof linkId === 'string' ?
                    linkId.startsWith('t3_') ?
                      linkId.substring(3)
                    : linkId
                  : null;
                const stats = { count: 0, errorCount: 0 };
                const comment = (
                  await this.parser.parsePostComment(
                    postId,
                    [child],
                    stats,
                    (postId, more, stats) =>
                      this.fetchMorePostComments(postId, more, stats),
                    false
                  )
                )[0];
                return {
                  item: {
                    type: 'postComment' as const,
                    comment: comment,
                    postId
                  },
                  errorCount: stats.errorCount
                };
              }
              // Post
              const { post, errorCount } =
                this.config.fetchPostAuthors ?
                  await this.parser.parsePost(
                    child,
                    null,
                    null,
                    true,
                    (postId) => this.fetchPostComments(postId),
                    (username) => this.fetchUser(username)
                  )
                : await this.parser.parsePost(
                    child,
                    null,
                    null,
                    false,
                    (postId) => this.fetchPostComments(postId)
                  );
              return {
                item: {
                  type: 'post' as const,
                  post
                },
                errorCount
              };
            })
          )
        );
        const errorCount = mappedPostResults.reduce<number>(
          (result, { errorCount }) => result + errorCount,
          0
        );
        const items = mappedPostResults.reduce<FetchSavedItemsResult['items']>(
          (result, { item }) => {
            switch (item.type) {
              case 'post': {
                if (item.post) {
                  result.push({
                    type: 'post',
                    post: item.post
                  });
                }
                break;
              }
              case 'postComment': {
                if (item.comment) {
                  result.push({
                    type: 'postComment',
                    comment: item.comment,
                    postId: item.postId
                  });
                }
              }
            }
            return result;
          },
          []
        );
        const dataAfter = ObjectHelper.getProperty(data, 'data.after') || null;

        return {
          items: items satisfies FetchSavedItemsResult['items'],
          errorCount,
          after: dataAfter
        };
      } catch (error) {
        if (!isAbortError(error)) {
          this.log(
            'error',
            `Failed to fetch saved items for user ${user.username}:`,
            error
          );
        }
        throw error;
      }
    }
  };
}
