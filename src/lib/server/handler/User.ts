import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type PageElements } from '../../../web/types/PageElements';
import { type SearchContext, type UserListPage } from '../../../web/types/Page';
import { BrowseURLs } from './BrowseURLs';
import { type DBGetUsersParams } from '../../db/User';
import { type User } from '../../entities/User';

export interface UserPageRequestParams {
  req: Request;
  res: Response;
  followedBy?: string;
}

export interface GetUserListPageParams {
  req: Request;
  followedBy?: string;
}

export type UserPageGetListParams = {
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

export interface UserPageList {
  followedBy: User | null;
  items: UserListPage['users'];
  total: number;
}

export function UserPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class UserPageWebRequestHandler extends Base {
    handleUserPageRequest(params: UserPageRequestParams) {
      const { res, req, followedBy } = params;
      res.json(this.getUserListPage({ req, followedBy }));
    }

    protected getUserListPage(params: GetUserListPageParams): UserListPage {
      const { req, followedBy } = params;
      const { limit, offset } = this.getPaginationParams(req);
      const ssb = this.getSearchAndSortByParams(
        req,
        ['a-z', 'z-a', 'most_posts', 'most_media', 'karma'] as const,
        'a-z'
      );

      const {
        followedBy: user,
        items: users,
        total
      } = this.getUserList({
        followedBy,
        ...ssb,
        limit,
        offset
      });

      const banner = user ? this.getUserBanner(user) : undefined;
      const title = followedBy ? 'Following' : 'Users';
      const searchContext: SearchContext =
        followedBy ?
          {
            target: 'by_user',
            username: followedBy
          }
        : {
            target: 'all'
          };
      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      let sortOptions: PageElements.SortOptions | undefined = undefined;
      if (total > 1) {
        sortOptions = [
          {
            text: 'A-Z',
            url: this.modifyRequestURL(req, { p: null, s: 'a-z' }),
            isCurrent: ssb.sortBy === 'a-z'
          },
          {
            text: 'Z-A',
            url: this.modifyRequestURL(req, { p: null, s: 'z-a' }),
            isCurrent: ssb.sortBy === 'z-a'
          },
          {
            text: 'Most posts',
            url: this.modifyRequestURL(req, { p: null, s: 'most_posts' }),
            isCurrent: ssb.sortBy === 'most_posts'
          },
          {
            text: 'Most media',
            url: this.modifyRequestURL(req, { p: null, s: 'most_media' }),
            isCurrent: ssb.sortBy === 'most_media'
          },
          {
            text: 'Karma',
            url: this.modifyRequestURL(req, { p: null, s: 'karma' }),
            isCurrent: ssb.sortBy === 'karma'
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
        banner,
        title,
        users,
        showingText: this.getShowingText(limit, offset, total, 'user', 'users'),
        sortOptions,
        nav: pageNav,
        searchContext
      };
    }

    protected getUserList(params: UserPageGetListParams): UserPageList {
      const { followedBy, search, sortBy, limit, offset } = params;
      let user: User | null = null;
      if (followedBy) {
        user = this.db.getUser(followedBy);
        if (!user) {
          throw Error(`User info for "${followedBy}" not found in DB`);
        }
      }
      const data = this.db.getUsers({
        search,
        sortBy,
        followedBy,
        limit,
        offset
      } as DBGetUsersParams);

      const total = this.db.getUserCount(search, followedBy) ?? -1;

      const items = data.map<PageElements.Card<'String'>>(
        ({ user, counts }) => {
          const footerLinks: {
            title?: string;
            anchorText: string;
            url: string;
          }[] = [];
          if (counts?.post) {
            footerLinks.push({
              title: 'Posts:',
              anchorText: `${counts.post}`,
              url: BrowseURLs.getUserSubmittedURL(user)
            });
          }
          if (counts?.media) {
            footerLinks.push({
              title: 'Media:',
              anchorText: `${counts.media}`,
              url: BrowseURLs.getUserMediaURL(user)
            });
          }
          if (counts.savedPost + counts.savedComment > 0) {
            footerLinks.push({
              title: 'Saved items:',
              anchorText: String(counts.savedPost + counts.savedComment),
              url: BrowseURLs.getSavedItemsURL(user)
            });
          }
          return {
            id: `user-${user.username}`,
            type: 'String',
            class: 'user',
            title: [
              {
                runs: [
                  {
                    icon: BrowseURLs.getUserIconURL(user) || undefined,
                    text: `u/${user.username}`,
                    url: BrowseURLs.getUserOverviewURL(user)
                  }
                ]
              }
            ],
            body: user.description ? { content: user.description } : undefined,
            footer: footerLinks.map<PageElements.TextRunGroup>(
              ({ title, anchorText, url }) => {
                const runs: PageElements.TextRun[] = [];
                if (title) {
                  runs.push({ text: title });
                }
                runs.push({
                  text: anchorText,
                  url
                });
                return { runs };
              }
            )
          };
        }
      );

      return {
        followedBy: user,
        items,
        total
      };
    }
  };
}
