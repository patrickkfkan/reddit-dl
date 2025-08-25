import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type PageElements } from '../../../web/types/PageElements';
import { type SubredditListPage } from '../../../web/types/Page';

export function SubredditPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class SubredditPageWebRequestHandler extends Base {
    handleSubredditPageRequest(req: Request, res: Response) {
      res.json(this.getSubredditListPage(req));
    }

    protected getSubredditListPage(req: Request): SubredditListPage {
      const { limit, offset } = this.getPaginationParams(req);
      const ssb = this.getSearchAndSortByParams(
        req,
        ['a-z', 'z-a', 'most_posts', 'most_media'] as const,
        'a-z'
      );
      const data = this.db.getSubreddits({
        ...ssb,
        limit,
        offset
      });
      const listItems = data.map<PageElements.Card<'String'>>(
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
              url: this.getSubredditPostsURL(subreddit)
            });
          }
          if (counts?.media) {
            footerLinks.push({
              title: 'Media:',
              anchorText: `${counts.media}`,
              url: this.getSubredditMediaURL(subreddit)
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
                    icon: this.getSubredditIconURL(subreddit) || undefined,
                    text: `r/${subreddit.name}`,
                    url: this.getSubredditOverviewURL(subreddit)
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

      const total = this.db.getSubredditCount(ssb.search) ?? -1;
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
        title: 'Subreddits',
        subreddits: listItems,
        showingText: this.getShowingText(
          limit,
          offset,
          total,
          'subreddit',
          'subreddits'
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
