import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type User } from '../../entities/User';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type SavedItemListPage,
  type SearchContext
} from '../../../web/types/Page';
import { CardBuilder } from './CardBuilder';
import { type DBGetSavedItemsParams } from '../../db/SavedItem';

export type SavedItemPageRequestParams = {
  req: Request;
  res: Response;
  username: string;
};

export type GetSavedItemListPageParams = {
  req: Request;
  username: string;
};

export type SavedItemPageList = {
  user: User;
  items: SavedItemListPage['items'];
  total: number;
};

export type SavedItemPageGetListParams = {
  username: string;
  limit: number;
  offset: number;
} & (
  | {
      search?: undefined;
      sortBy: 'mostRecentlySaved' | 'leastRecentlySaved';
    }
  | {
      search: string;
      sortBy: 'best_match' | 'mostRecentlySaved' | 'leastRecentlySaved';
    }
);

export function SavedItemPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class SavedItemPageWebRequestHandler extends Base {
    handleSavedItemPageRequest(params: SavedItemPageRequestParams) {
      const { username, req, res } = params;
      res.json(
        this.getSavedItemListPage({
          req,
          username
        })
      );
    }

    protected getSavedItemListPage(
      params: GetSavedItemListPageParams
    ): SavedItemListPage {
      const { req, username } = params;
      const { limit, offset } = this.getPaginationParams(req);
      let itemList: SavedItemPageList;
      const ssb = this.getSearchAndSortByParams(
        req,
        ['mostRecentlySaved', 'leastRecentlySaved'] as const,
        'mostRecentlySaved'
      );

      const _itemList = (itemList = this.getSavedItemList({
        username,
        ...ssb,
        limit,
        offset
      }));
      const banner = _itemList.user ? this.getUserBanner(_itemList.user) : null;
      const searchContext: SearchContext = {
        target: 'by_user',
        username
      };

      const { items, total } = itemList;

      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      let sortOptions: PageElements.SortOptions | undefined = undefined;
      if (total > 1) {
        sortOptions = [
          {
            text: 'Most recently saved',
            url: this.modifyRequestURL(req, {
              p: null,
              s: 'mostRecentlySaved'
            }),
            isCurrent: ssb.sortBy === 'mostRecentlySaved'
          },
          {
            text: 'Least recently saved',
            url: this.modifyRequestURL(req, {
              p: null,
              s: 'leastRecentlySaved'
            }),
            isCurrent: ssb.sortBy === 'leastRecentlySaved'
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
        title: 'Saved',
        banner,
        items,
        nav: pageNav,
        showingText: this.getShowingText(limit, offset, total, 'item', 'items'),
        sortOptions,
        searchContext
      };
    }

    protected getSavedItemList(
      params: SavedItemPageGetListParams
    ): SavedItemPageList {
      const { username, search, sortBy, limit, offset } = params;
      const user = this.db.getUser(username);
      if (!user) {
        throw Error(`User info for "${username}" not found in DB`);
      }
      const savedItems = this.db.getSavedItems({
        savedBy: username,
        search,
        sortBy,
        limit,
        offset
      } as DBGetSavedItemsParams);
      let total: number;
      try {
        total = this.db.getSavedItemCount(username, search) ?? -1;
        if (total < 0) {
          this.log(
            'warn',
            `Failed to get saved_item count (${JSON.stringify({ username }, null, 2)})"`
          );
        }
      } catch (error) {
        this.log(
          'error',
          `Failed to get saved_item count (${JSON.stringify({ username }, null, 2)})"`,
          error
        );
        total = -1;
      }
      const items = savedItems.map((item) => {
        switch (item.type) {
          case 'post':
            return CardBuilder.createPostCard(item.data, true, true, true);
          case 'postComment':
            return CardBuilder.createPostCommentCard({
              post: item.postInfo,
              comment: item.data,
              isSearchResult: true,
              wrapped: true
            });
        }
      });
      return {
        user,
        items,
        total
      };
    }
  };
}
