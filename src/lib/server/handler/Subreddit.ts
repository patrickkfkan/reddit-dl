import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type SearchContext,
  type SubredditListPage
} from '../../../web/types/Page';
import { BrowseURLs } from './BrowseURLs';
import { type User } from '../../entities/User';
import { type DBGetSubredditsParams } from '../../db/Subreddit';

export interface SubredditPageRequestParams {
  req: Request;
  res: Response;
  joinedBy?: string;
}

export interface GetSubredditListPageParams {
  req: Request;
  joinedBy?: string;
}

export type SubredditPageGetListParams = {
  joinedBy?: string;
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

export interface SubredditPageList {
  joinedBy: User | null;
  items: SubredditListPage['subreddits'];
  total: number;
}

export function SubredditPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class SubredditPageWebRequestHandler extends Base {
    handleSubredditPageRequest(params: SubredditPageRequestParams) {
      const { res, req, joinedBy } = params;
      res.json(this.getSubredditListPage({ req, joinedBy }));
    }

    protected getSubredditListPage(
      params: GetSubredditListPageParams
    ): SubredditListPage {
      const { req, joinedBy } = params;
      const { limit, offset } = this.getPaginationParams(req);
      const ssb = this.getSearchAndSortByParams(
        req,
        ['a-z', 'z-a', 'most_posts', 'most_media'] as const,
        'a-z'
      );

      const {
        joinedBy: user,
        items: subreddits,
        total
      } = this.getSubredditList({
        joinedBy,
        ...ssb,
        limit,
        offset
      });

      const banner = user ? this.getUserBanner(user) : undefined;
      const title = joinedBy ? 'Joined subreddits' : 'Subreddits';
      const searchContext: SearchContext =
        joinedBy ?
          {
            target: 'by_user',
            username: joinedBy
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
        subreddits,
        showingText: this.getShowingText(
          limit,
          offset,
          total,
          'subreddit',
          'subreddits'
        ),
        sortOptions,
        nav: pageNav,
        searchContext
      };
    }

    protected getSubredditList(
      params: SubredditPageGetListParams
    ): SubredditPageList {
      const { joinedBy, search, sortBy, limit, offset } = params;
      let user: User | null = null;
      if (joinedBy) {
        user = this.db.getUser(joinedBy);
        if (!user) {
          throw Error(`User info for "${joinedBy}" not found in DB`);
        }
      }
      const data = this.db.getSubreddits({
        search,
        sortBy,
        joinedBy,
        limit,
        offset
      } as DBGetSubredditsParams);

      const total = this.db.getSubredditCount(search, joinedBy) ?? -1;

      const items = data.map<PageElements.Card<'String'>>(
        ({ subreddit, counts }) => {
          const footerLinks: {
            title?: string;
            anchorText: string;
            url: string;
          }[] = [];
          if (counts?.post) {
            footerLinks.push({
              title: 'Posts:',
              anchorText: `${counts.post}`,
              url: BrowseURLs.getSubredditPostsURL(subreddit)
            });
          }
          if (counts?.media) {
            footerLinks.push({
              title: 'Media:',
              anchorText: `${counts.media}`,
              url: BrowseURLs.getSubredditMediaURL(subreddit)
            });
          }
          return {
            id: `subreddit-${subreddit.id}`,
            type: 'String',
            class: 'subreddit',
            title: [
              {
                runs: [
                  {
                    icon:
                      BrowseURLs.getSubredditIconURL(subreddit) || undefined,
                    text: `r/${subreddit.name}`,
                    url: BrowseURLs.getSubredditOverviewURL(subreddit)
                  }
                ]
              }
            ],
            body:
              subreddit.shortDescription ?
                { content: subreddit.shortDescription }
              : undefined,
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
        joinedBy: user,
        items,
        total
      };
    }
  };
}
