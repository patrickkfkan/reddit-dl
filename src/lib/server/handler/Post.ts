import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type Subreddit } from '../../entities/Subreddit';
import { type User } from '../../entities/User';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type PostListPage,
  type PostPage,
  type PostsContainingMediaPage,
  type SearchContext
} from '../../../web/types/Page';
import { type DBGetPostsParams } from '../../db/Post';
import { CardBuilder } from './CardBuilder';

export type PostPageListDomain = 'subreddit' | 'user' | 'all';

export type PostPageRequestDomain = 'post' | 'subreddit' | 'user' | 'all';

export type PostPageRequestParams = {
  req: Request;
  res: Response;
} & (
  | {
      domain: 'post';
      postId: string;
    }
  | {
      domain: 'subreddit';
      subredditName: string;
    }
  | {
      domain: 'user';
      username: string;
    }
  | {
      domain: 'all';
    }
);

export type PostPageGetListParams = {
  subredditName?: string;
  author?: string;
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

export type GetPostListPageParams = {
  req: Request;
} & (
  | {
      domain: 'subreddit';
      subredditName: string;
    }
  | {
      domain: 'user';
      username: string;
    }
  | {
      domain: 'all';
    }
);

export type PostPageList = {
  subreddit?: Subreddit;
  user?: User;
  posts: PageElements.Card<'Post'>[];
  total: number;
};

export function PostPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class PostPageWebRequestHandler extends Base {
    handlePostPageRequest(params: PostPageRequestParams) {
      const { domain, res } = params;
      switch (domain) {
        case 'post': {
          const postId = params.postId;
          const post = this.db.getPost(postId);
          if (!post) {
            throw Error(`Post "${postId}" not found in DB`);
          }
          const banner = this.getSubredditBanner(post.subreddit);
          res.json({
            banner,
            post: CardBuilder.createPostCard(post, true, false, false),
            searchContext: {
              target: 'all'
            },
            commentsURL:
              post.commentCount.topLevel > 0 ?
                `/api/post_comments?post_id=${postId}&o=0&s=latest`
              : null
          } satisfies PostPage);
          break;
        }
        case 'subreddit':
        case 'user':
        case 'all': {
          res.json(
            this.getPostListPage({
              ...params
            })
          );
          break;
        }
      }
    }

    protected getPostListPage(params: GetPostListPageParams): PostListPage {
      const { domain, req } = params;
      const { limit, offset } = this.getPaginationParams(req);
      let banner: PageElements.Banner | null;
      let postList: PostPageList;
      const ssb = this.getSearchAndSortByParams(
        req,
        ['latest', 'oldest', 'top'] as const,
        'latest'
      );
      let searchContext: SearchContext;

      if (domain === 'subreddit') {
        const _postList = (postList = this.getPostList({
          subredditName: params.subredditName,
          ...ssb,
          limit,
          offset
        }));
        banner =
          _postList.subreddit ?
            this.getSubredditBanner(_postList.subreddit)
          : null;
        searchContext = {
          target: 'in_subreddit',
          subredditName: params.subredditName
        };
      } else if (domain === 'user') {
        const _postList = (postList = this.getPostList({
          author: params.username,
          ...ssb,
          limit,
          offset
        }));
        banner = _postList.user ? this.getUserBanner(_postList.user) : null;
        searchContext = {
          target: 'by_user',
          username: params.username
        };
      } else {
        // All
        postList = this.getPostList({
          ...ssb,
          limit,
          offset
        });
        banner = null;
        searchContext = {
          target: 'all'
        };
      }

      const { posts, total } = postList;

      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      let sortOptions: PageElements.SortOptions | undefined = undefined;
      if (total > 1) {
        sortOptions = [
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
        if (ssb.search) {
          sortOptions.unshift({
            text: 'Best match',
            url: this.modifyRequestURL(req, { p: null, s: 'best_match' }),
            isCurrent: ssb.sortBy === 'best_match'
          });
        }
      }

      return {
        title: 'Posts',
        banner,
        posts,
        nav: pageNav,
        showingText: this.getShowingText(limit, offset, total, 'post', 'posts'),
        sortOptions,
        searchContext
      };
    }

    protected getPostList(params: PostPageGetListParams): PostPageList {
      const { subredditName, author, search, sortBy, limit, offset } = params;
      const subreddit =
        subredditName ? this.db.getSubredditByName(subredditName) : null;
      const user = author ? this.db.getUser(author) : null;
      if (subredditName && !subreddit) {
        throw Error(`Subreddit info for "${subredditName}" not found in DB`);
      }
      if (author && !user) {
        throw Error(`User info for "${author}" not found in DB`);
      }
      const posts = this.db.getPosts({
        subredditId: subreddit?.id,
        author,
        search,
        sortBy,
        limit,
        offset
      } as DBGetPostsParams);
      let total: number;
      try {
        total = this.db.getPostCount(search, author, subreddit?.id) ?? -1;
        if (total < 0) {
          this.log(
            'warn',
            `Failed to get post count (${JSON.stringify({ search, author, subredditId: subreddit?.id }, null, 2)})"`
          );
        }
      } catch (error) {
        this.log(
          'error',
          `Failed to get post count (${JSON.stringify({ search, author, subredditId: subreddit?.id }, null, 2)})"`,
          error
        );
        total = -1;
      }
      const showAuthor = !author;
      const showSubreddit = !subreddit;
      const items = posts.map<PageElements.Card<'Post'>>((post) =>
        CardBuilder.createPostCard(post, showAuthor, showSubreddit, true)
      );
      return {
        subreddit,
        user,
        posts: items,
        total
      } as PostPageList;
    }

    handlePostsContainingMediaPageRequest(
      mediaId: number,
      req: Request,
      res: Response
    ) {
      const posts = this.db.getPostsContainingMedia(mediaId);
      const { showSubreddit = 'true', showAuthor = 'true' } = req.query;
      res.json({
        posts: posts.map<PageElements.Card<'Post'>>((post) =>
          CardBuilder.createPostCard(
            post,
            showAuthor === 'true',
            showSubreddit === 'true',
            false
          )
        ),
        searchContext: {
          target: 'all'
        }
      } satisfies PostsContainingMediaPage);
    }
  };
}
