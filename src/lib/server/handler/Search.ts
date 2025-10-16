import { type Request, type Response } from 'express';
import { type CoreTargetWebRequestHandlerConstructor } from '.';
import {
  type SearchResultsPage,
  type SearchResultsTab
} from '../../../web/types/Page';

export function SearchPageWebRequestHandlerMixin<
  TBase extends CoreTargetWebRequestHandlerConstructor
>(Base: TBase) {
  return class SearchPageWebRequestHandler extends Base {
    handleSearchPageRequest(params: {
      username?: string;
      subredditName?: string;
      req: Request;
      res: Response;
    }) {
      const { username, subredditName, req, res } = params;
      const search = req.query.q as string | undefined;
      let currentTabName = req.query.tab as string | undefined;

      if (!search) {
        throw Error('Missing value for param "q"');
      }

      const subreddit =
        subredditName ? this.db.getSubredditByName(subredditName) : undefined;
      if (subredditName && !subreddit) {
        throw Error(`Subreddit info for "${subredditName}" not found in DB`);
      }

      const user = username ? this.db.getUser(username) : null;
      if (username && !user) {
        throw Error(`User info for "${username}" not found in DB`);
      }

      const counts = {
        post: this.db.getPostCount(search, username, subreddit?.id),
        subreddit:
          !subredditName && !username ?
            this.db.getSubredditCount(search)
          : null,
        user: !subredditName && !username ? this.db.getUserCount(search) : null,
        comments: this.db.getPostCommentSearchResultCount(
          search,
          username,
          subreddit?.id
        ),
        savedItems:
          username ? this.db.getSavedItemCount(username, search) : null
      };

      if (!currentTabName) {
        currentTabName =
          counts.post && counts.post > 0 ? 'posts'
          : counts.subreddit && counts.subreddit > 0 ? 'subreddits'
          : counts.user && counts.user > 0 ? 'users'
          : counts.comments && counts.comments > 0 ? 'post_comments'
          : counts.savedItems && counts.savedItems > 0 ? 'saved_items'
          : undefined;
      }

      if (!currentTabName) {
        res.json({
          title: `Search results for "${search}"`,
          banner:
            subreddit ? this.getSubredditBanner(subreddit)
            : user ? this.getUserBanner(user)
            : null,
          showingText: `No results found.`,
          tabs: [],
          searchContext:
            subredditName ?
              {
                target: 'in_subreddit',
                subredditName: subredditName
              }
            : username ?
              {
                target: 'by_user',
                username
              }
            : {
                target: 'all'
              }
        } satisfies SearchResultsPage);
        return;
      }

      const tabs: SearchResultsPage['tabs'] = [];
      if (counts.post && counts.post > 0) {
        tabs.push(
          this.#createSearchResultsTab(
            req,
            search,
            'posts',
            'Posts',
            currentTabName === 'posts',
            () =>
              subredditName ?
                this.getPostListPage({
                  domain: 'subreddit',
                  subredditName,
                  req
                })
              : username ?
                this.getPostListPage({
                  domain: 'user',
                  username,
                  req
                })
              : this.getPostListPage({
                  domain: 'all',
                  req
                })
          )
        );
      }
      if (counts.subreddit && counts.subreddit > 0) {
        tabs.push(
          this.#createSearchResultsTab(
            req,
            search,
            'subreddits',
            'Subreddits',
            currentTabName === 'subreddits',
            () => this.getSubredditListPage(req)
          )
        );
      }
      if (counts.user && counts.user > 0) {
        tabs.push(
          this.#createSearchResultsTab(
            req,
            search,
            'users',
            'Users',
            currentTabName === 'users',
            () => this.getUserListPage(req)
          )
        );
      }
      if (counts.comments && counts.comments > 0) {
        tabs.push(
          this.#createSearchResultsTab(
            req,
            search,
            'post_comments',
            'Comments',
            currentTabName === 'post_comments',
            () =>
              this.getSearchPostCommentResultsPage({
                subredditName,
                author: username,
                req
              })
          )
        );
      }
      if (username && counts.savedItems && counts.savedItems > 0) {
        tabs.push(
          this.#createSearchResultsTab(
            req,
            search,
            'saved_items',
            'Saved',
            currentTabName === 'saved_items',
            () =>
              this.getSavedItemListPage({
                req,
                username
              })
          )
        );
      }

      const currentTab = tabs.find((tab) => tab.isCurrent);
      const banner = currentTab?.page.banner;
      const searchContext = currentTab?.page.searchContext || {
        target: 'all'
      };
      if (currentTab) {
        delete currentTab.page.banner;
      }

      res.json({
        banner,
        title: `Search results for "${search}"`,
        tabs,
        searchContext
      } satisfies SearchResultsPage);
    }

    #createSearchResultsTab<T extends SearchResultsTab['name']>(
      req: Request,
      query: string,
      tabName: T,
      title: string,
      isCurrent: boolean,
      getPage: () => (SearchResultsTab & { name: T; isCurrent: true })['page']
    ): SearchResultsTab {
      const referer = this.getReferer(req);
      const pathname = referer.pathname;
      const qs = new URLSearchParams({
        q: query,
        tab: tabName
      }).toString();
      const url = `${pathname}?${qs}`;
      if (isCurrent) {
        const page = getPage();
        delete page.title;
        return {
          name: tabName,
          title,
          isCurrent: true,
          page,
          url
        } as SearchResultsTab;
      } else {
        return {
          name: tabName,
          title,
          isCurrent: false,
          url
        };
      }
    }
  };
}
