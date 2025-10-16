import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type Page,
  type SearchPostCommentResultsPage,
  type PostCommentsSection
} from '../../../web/types/Page';
import { BrowseURLs } from './BrowseURLs';
import { CardBuilder } from './CardBuilder';

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
        next = BrowseURLs.getPostCommentsURL({
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
            url: BrowseURLs.getPostCommentsURL({
              postId,
              sortBy: 'latest',
              offset: 0
            }),
            isCurrent: sortBy === 'latest'
          },
          {
            text: 'Oldest',
            url: BrowseURLs.getPostCommentsURL({
              postId,
              sortBy: 'oldest',
              offset: 0
            }),
            isCurrent: sortBy === 'oldest'
          },
          {
            text: 'Top',
            url: BrowseURLs.getPostCommentsURL({
              postId,
              sortBy: 'top',
              offset: 0
            }),
            isCurrent: sortBy === 'top'
          }
        ];
      }
      res.json({
        comments: comments.map((comment) =>
          CardBuilder.createPostCommentCard({ post, comment, sortBy })
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
        next = BrowseURLs.getPostCommentsURL({
          postId,
          sortBy,
          offset: offset + replies.length,
          parentId: commentId
        });
      }
      res.json({
        comments: replies.map((comment) =>
          CardBuilder.createPostCommentCard({
            post,
            comment,
            isReply: true,
            sortBy
          })
        ),
        next
      } satisfies PostCommentsSection);
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
      const comments = data.map<PageElements.Card<'WrappedPostComment'>>(
        ({ comment, post }) => {
          return {
            id: `post-comment-${comment.id}`,
            type: 'WrappedPostComment',
            class: 'search-post-comment-result',
            kicker: [
              {
                runs: [
                  {
                    icon:
                      BrowseURLs.getSubredditIconURL(post.subreddit) ||
                      undefined,
                    text: `r/${post.subreddit.name}`,
                    url: BrowseURLs.getSubredditOverviewURL(post.subreddit)
                  }
                ]
              }
            ],
            title: [
              {
                runs: [
                  {
                    text: post.title,
                    url: BrowseURLs.getPostURL(post)
                  }
                ]
              }
            ],
            body: {
              content: CardBuilder.createPostCommentCard({
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
  };
}
