import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type Post, type PostComment, type PostType } from '../../entities/Post';
import { DELETED_USER } from '../../utils/Constants';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type Page,
  type SearchPostCommentResultsPage,
  type PostCommentsSection
} from '../../../web/types/Page';
import { sanitizeHTML, utcSecondsToDate } from '../../utils/Misc';

export function PostCommentWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class PostCommentWebRequestHandler extends Base {
    handlePostCommentsSectionRequest(req: Request, res: Response) {
      const postId = req.query['post_id'] as string | undefined;
      if (!postId) {
        throw Error('Missing value for param "post_id"');
      }
      const { limit, offset } = this.getPaginationParams(req, 50);
      const sortBy = this.getSearchAndSortByParams(
        req,
        ['latest', 'oldest', 'top'] as const,
        'latest'
      ).sortBy as 'latest' | 'oldest' | 'top';
      const post = this.db.getPost(postId);
      if (!post) {
        throw Error(`Post "${postId}" not found in DB`);
      }
      const comments = this.db.getTopLevelPostComments({
        postId,
        replyCount: 10,
        sortBy,
        limit,
        offset
      });
      let next: string | null = null;
      if (
        post.commentCount.topLevel > 0 &&
        offset + comments.length < post.commentCount.topLevel
      ) {
        next = this.#getPostCommentsURL({
          postId,
          sortBy,
          offset: offset + comments.length
        });
      }
      let sortOptions: PageElements.SortOptions | undefined = undefined;
      if (offset === 0) {
        sortOptions = [
          {
            text: 'Latest',
            url: this.#getPostCommentsURL({
              postId,
              sortBy: 'latest',
              offset: 0
            }),
            isCurrent: sortBy === 'latest'
          },
          {
            text: 'Oldest',
            url: this.#getPostCommentsURL({
              postId,
              sortBy: 'oldest',
              offset: 0
            }),
            isCurrent: sortBy === 'oldest'
          },
          {
            text: 'Top',
            url: this.#getPostCommentsURL({ postId, sortBy: 'top', offset: 0 }),
            isCurrent: sortBy === 'top'
          }
        ];
      }
      res.json({
        comments: comments.map((comment) =>
          this.#createPostCommentCard({ post, comment, sortBy })
        ),
        next,
        sortOptions
      } satisfies PostCommentsSection);
    }

    handlePostCommentRepliesRequest(req: Request, res: Response) {
      const postId = req.query['post_id'] as string | undefined;
      const commentId = req.query['comment_id'] as string | undefined;
      if (!postId) {
        throw Error('Missing value for param "post_id"');
      }
      if (!commentId) {
        throw Error('Missing value for param "comment_id"');
      }
      const { limit, offset } = this.getPaginationParams(req, 50);
      const sortBy = this.getSearchAndSortByParams(
        req,
        ['latest', 'oldest', 'top'] as const,
        'latest'
      ).sortBy as 'latest' | 'oldest' | 'top';
      const post = this.db.getPost(postId);
      if (!post) {
        throw Error(`Post "${postId}" not found in DB`);
      }
      const comment = this.db.getPostComment(commentId);
      const replies = this.db.getPostCommentReplies({
        parentIds: [commentId],
        replyCount: 10,
        sortBy,
        limit,
        offset
      })[commentId];

      let next: string | null = null;
      if (replies.length > 0 && offset + replies.length < comment.replyCount) {
        next = this.#getPostCommentsURL({
          postId,
          sortBy,
          offset: offset + replies.length,
          parentId: commentId
        });
      }
      res.json({
        comments: replies.map((comment) =>
          this.#createPostCommentCard({ post, comment, isReply: true, sortBy })
        ),
        next
      } satisfies PostCommentsSection);
    }

    #createPostCommentCard(params: {
      post: Post<PostType>;
      comment: PostComment;
      isReply?: boolean;
      isSearchResult?: boolean;
      sortBy?: 'latest' | 'oldest' | 'top';
    }): PageElements.Card<'PostComment'> {
      const {
        post,
        comment,
        isReply = false,
        isSearchResult = false,
        sortBy
      } = params;
      const isOP =
        comment.author !== DELETED_USER.username &&
        comment.author === post.author.username;
      const author = {
        class: isOP ? 'op' : undefined,
        text:
          comment.author !== DELETED_USER.username ?
            `u/${comment.author}`
          : comment.author
      };
      const created =
        comment.createdUTC >= 0 ?
          utcSecondsToDate(comment.createdUTC).toLocaleString()
        : '';
      const subtitleParts: PageElements.TextRunGroup[] = [
        { runs: [author] },
        { runs: [{ text: created }] },
        {
          runs: [
            {
              class: 'score',
              text: 'thumbs_up_down'
            },
            {
              text: String(comment.upvotes - comment.downvotes)
            }
          ]
        },
        {
          runs: [
            {
              class: 'external-link',
              text: 'exit_to_app',
              url: this.getRedditURL(comment) || undefined,
              isExternalURL: true
            }
          ]
        }
      ];
      const replies = comment.replies.map((reply) =>
        this.#createPostCommentCard({
          post,
          comment: reply,
          isReply: true,
          isSearchResult,
          sortBy
        })
      );
      let nextReplies: string | null = null;
      if (
        !isSearchResult &&
        comment.replyCount > 0 &&
        replies.length < comment.replyCount
      ) {
        nextReplies = this.#getPostCommentsURL({
          postId: post.id,
          parentId: comment.id,
          sortBy,
          offset: replies.length
        });
      }
      const item: PageElements.Card<'PostComment'> = {
        id: `post-comment-${comment.id}`,
        type: 'PostComment',
        class: `post-comment ${isReply ? 'reply' : ''} ${isSearchResult ? 'search-result' : ''}`,
        subtitle: subtitleParts,
        body: {
          content: {
            commentId: comment.id,
            text: sanitizeHTML(comment.content.html),
            replies: {
              comments: replies,
              next: nextReplies
            }
          }
        }
      };

      return item;
    }

    getSearchPostCommentResultsPage(params: {
      subredditName?: string;
      author?: string;
      req: Request;
    }): SearchPostCommentResultsPage {
      const { subredditName, author, req } = params;
      const { limit, offset } = this.getPaginationParams(req);
      const ssb = this.getSearchAndSortByParams(
        req,
        ['latest', 'oldest', 'top'] as const,
        'latest'
      );
      if (!ssb.search) {
        throw Error('Missing param "q"');
      }
      const subreddit =
        subredditName ? this.db.getSubredditByName(subredditName) : null;
      const user = author ? this.db.getUser(author) : null;
      let banner: Page['banner'] = null;
      if (subredditName) {
        if (!subreddit) {
          throw Error(`Subreddit info for "${subredditName}" not found in DB`);
        }
        banner = this.getSubredditBanner(subreddit);
      }
      if (author) {
        if (!user) {
          throw Error(`User info for "${author}" not found in DB`);
        }
        banner = this.getUserBanner(user);
      }
      const data = this.db.searchPostComments({
        subredditId: subreddit?.id,
        author,
        ...ssb,
        limit,
        offset
      });
      const comments = data.map<PageElements.Card<'SearchPostCommentResult'>>(
        ({ comment, post }) => {
          return {
            id: `post-comment-${comment.id}`,
            type: 'SearchPostCommentResult',
            class: 'search-post-comment-result',
            kicker: [
              {
                runs: [
                  {
                    icon: this.getSubredditIconURL(post.subreddit) || undefined,
                    text: `r/${post.subreddit.name}`,
                    url: this.getSubredditOverviewURL(post.subreddit)
                  }
                ]
              }
            ],
            title: [
              {
                runs: [
                  {
                    text: post.title,
                    url: this.getPostURL(post)
                  }
                ]
              }
            ],
            body: {
              content: this.#createPostCommentCard({
                post,
                comment,
                isSearchResult: true
              })
            }
          };
        }
      );

      const total = this.db.getPostCommentSearchResultCount(ssb.search) ?? -1;
      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      let sortOptions: PageElements.SortOptions | undefined = undefined;
      if (total > 1) {
        sortOptions = [
          {
            text: 'Best match',
            url: this.modifyRequestURL(req, { p: null, s: 'best_match' }),
            isCurrent: ssb.sortBy === 'best_match'
          },
          {
            text: 'Latest',
            url: this.modifyRequestURL(req, { p: null, s: 'latest' }),
            isCurrent: ssb.sortBy === 'latest'
          },
          {
            text: 'Oldest',
            url: this.modifyRequestURL(req, { p: null, s: 'oldest' }),
            isCurrent: ssb.sortBy === 'oldest'
          },
          {
            text: 'Top',
            url: this.modifyRequestURL(req, { p: null, s: 'top' }),
            isCurrent: ssb.sortBy === 'top'
          }
        ];
      }

      return {
        title: 'Comments',
        banner,
        comments,
        showingText: this.getShowingText(
          limit,
          offset,
          total,
          'comment',
          'comments'
        ),
        sortOptions,
        nav: pageNav,
        searchContext: {
          target: 'all'
        }
      };
    }

    #getPostCommentsURL(params: {
      postId: string;
      parentId?: string;
      sortBy?: 'latest' | 'oldest' | 'top';
      limit?: number;
      offset?: number;
    }) {
      const { postId, sortBy, limit, offset } = params;
      const query: Record<string, string> = {
        post_id: postId
      };
      if (sortBy) {
        query['s'] = sortBy;
      }
      if (limit && limit > 0) {
        query['n'] = String(limit);
      }
      if (offset && offset >= 0) {
        query['o'] = String(offset);
      }
      if (params.parentId) {
        query['comment_id'] = params.parentId;
        return `/api/post_comment_replies?${new URLSearchParams(query).toString()}`;
      } else {
        return `/api/post_comments?${new URLSearchParams(query).toString()}`;
      }
    }
  };
}
