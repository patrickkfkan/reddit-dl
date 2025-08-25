import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type TargetResultsPage,
  type TargetResultsTab,
  type TargetListPage
} from '../../../web/types/Page';
import { type ResolvedTarget } from '../../entities/Target';

export interface GetTargetListPageParams {
  type?: ResolvedTarget['type'] | 'all';
  req: Request;
}

export function TargetPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class TargetPageWebRequestHandler extends Base {
    handleTargetPageRequest(req: Request, res: Response) {
      const counts: Record<ResolvedTarget['type'] | 'all', number | null> = {
        all: this.db.getTargetCount(),
        subreddit_posts: this.db.getTargetCount('subreddit_posts'),
        user_submitted: this.db.getTargetCount('user_submitted'),
        post: this.db.getTargetCount('post')
      };
      if (!counts.all) {
        res.json({
          title: 'Targets',
          showingText: 'No targets found.',
          tabs: [],
          searchContext: {
            target: 'all'
          }
        } satisfies TargetResultsPage);
        return;
      }

      const currentTabName = (req.query.tab ?? 'all') as string;

      if (!this.#validateTabName(currentTabName)) {
        throw Error(`Unknown value "${currentTabName}" for param "tab"`);
      }

      const tabs: TargetResultsPage['tabs'] = [
        this.#createTargetResultsTab(
          req,
          'all',
          'All',
          currentTabName === 'all'
        )
      ];
      if (counts.subreddit_posts && counts.subreddit_posts > 0) {
        tabs.push(
          this.#createTargetResultsTab(
            req,
            'subreddit_posts',
            'Subreddit',
            currentTabName === 'subreddit_posts'
          )
        );
      }
      if (counts.user_submitted && counts.user_submitted > 0) {
        tabs.push(
          this.#createTargetResultsTab(
            req,
            'user_submitted',
            'User',
            currentTabName === 'user_submitted'
          )
        );
      }
      if (counts.post && counts.post > 0) {
        tabs.push(
          this.#createTargetResultsTab(
            req,
            'post',
            'Post',
            currentTabName === 'post'
          )
        );
      }

      if (tabs.length === 2) {
        tabs.splice(1);
      }

      res.json({
        title: 'Targets',
        tabs,
        searchContext: {
          target: 'all'
        }
      } satisfies TargetResultsPage);
    }

    #validateTabName(value: string): value is TargetResultsTab['name'] {
      return ['all', 'user_submitted', 'subreddit_posts', 'post'].includes(
        value
      );
    }

    #createTargetResultsTab(
      req: Request,
      targetType: ResolvedTarget['type'] | 'all',
      title: string,
      isCurrent: boolean
    ): TargetResultsTab {
      const referer = this.getReferer(req);
      const pathname = referer.pathname;
      const qs = new URLSearchParams({
        tab: targetType
      }).toString();
      const url = `${pathname}?${qs}`;
      if (isCurrent) {
        const page = this.getTargetListPage({ type: targetType, req });
        delete page.title;
        return {
          name: targetType || 'all',
          title,
          isCurrent: true,
          page,
          url
        };
      } else {
        return {
          name: targetType,
          title,
          isCurrent: false,
          url
        };
      }
    }

    protected getTargetListPage(
      params: GetTargetListPageParams
    ): TargetListPage {
      const { type, req } = params;
      const { limit, offset } = this.getPaginationParams(req);
      const { s: sortBy = 'mostRecentlyRun' } = req.query;
      if (sortBy !== 'mostRecentlyRun' && sortBy !== 'leastRecentlyRun') {
        throw Error(`Unknown value "${sortBy as string}" for param "s"`);
      }
      const normalizedType = type === 'all' ? undefined : type;
      const targets = this.db.getTargets({
        type: normalizedType,
        sortBy,
        limit,
        offset
      });
      const listItems: PageElements.Card<'String'>[] = [];
      const userSubmittedTargets = targets.filter(
        (target) => target.type === 'user_submitted'
      );
      const subredditPostsTargets = targets.filter(
        (target) => target.type === 'subreddit_posts'
      );
      const countsForUser =
        userSubmittedTargets.length > 0 ?
          this.db.getCountsForUser(
            userSubmittedTargets.map((t) => t.user.username)
          )
        : {};
      const countsForSubreddit =
        subredditPostsTargets.length > 0 ?
          this.db.getCountsForSubreddit(
            subredditPostsTargets.map((t) => t.subreddit.id)
          )
        : {};
      for (const target of targets) {
        let targetId: string;
        let targetTypeName: string;
        let title: PageElements.TextRun;
        const footerLinks: {
          title?: string;
          anchorText: string;
          url: string;
        }[] = [];
        switch (target.type) {
          case 'user_submitted': {
            targetId = `user.submitted:${target.user.username}`;
            targetTypeName = 'User';
            const counts = countsForUser[target.user.username] || {};
            if (counts.post) {
              footerLinks.push({
                title: 'Posts:',
                anchorText: String(counts.post),
                url: this.getUserSubmittedURL(target.user)
              });
            }
            if (counts.media) {
              footerLinks.push({
                title: 'Media:',
                anchorText: String(counts.media),
                url: this.getUserMediaURL(target.user)
              });
            }
            title = {
              icon: this.getUserIconURL(target.user) || undefined,
              text: target.rawValue,
              url: this.getUserOverviewURL(target.user)
            };
            break;
          }
          case 'subreddit_posts': {
            targetId = `subreddit.posts:${target.subreddit.id}`;
            targetTypeName = 'Subreddit';
            const counts = countsForSubreddit[target.subreddit.id] || {};
            if (counts.post) {
              footerLinks.push({
                title: 'Posts:',
                anchorText: String(counts.post),
                url: this.getSubredditPostsURL(target.subreddit)
              });
            }
            if (counts.media) {
              footerLinks.push({
                title: 'Media:',
                anchorText: String(counts.media),
                url: this.getSubredditMediaURL(target.subreddit)
              });
            }
            title = {
              icon: this.getSubredditIconURL(target.subreddit) || undefined,
              text: target.rawValue,
              url: this.getSubredditOverviewURL(target.subreddit)
            };
            break;
          }
          case 'post': {
            targetId = `post:${target.post.id}`;
            targetTypeName = 'Post';
            title = {
              text: target.post.title,
              url: this.getPostURL(target.post)
            };
            footerLinks.push({
              anchorText: 'View post',
              url: this.getPostURL(target.post)
            });
            break;
          }
        }
        listItems.push({
          id: `target-${targetId}`,
          type: 'String',
          class: 'target',
          kicker: [
            {
              runs: [
                {
                  class: 'target-type',
                  text: targetTypeName
                }
              ]
            }
          ],
          title: [
            {
              runs: [title]
            }
          ],
          subtitle: [
            {
              runs: [
                {
                  text: `Last run: ${new Date(target.runTimestamp).toLocaleString()}`
                }
              ]
            }
          ],
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
        });
      }

      const total = this.db.getTargetCount(normalizedType) ?? -1;
      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      const sortOptions: PageElements.SortOptions | undefined =
        total > 1 ?
          [
            {
              text: 'Most recently run',
              url: this.modifyRequestURL(req, {
                p: null,
                s: 'mostRecentlyRun'
              }),
              isCurrent: sortBy === 'mostRecentlyRun'
            },
            {
              text: 'Least recently run',
              url: this.modifyRequestURL(req, {
                p: null,
                s: 'leastRecentlyRun'
              }),
              isCurrent: sortBy === 'leastRecentlyRun'
            }
          ]
        : undefined;

      return {
        title: 'Targets',
        targets: listItems,
        showingText: this.getShowingText(
          limit,
          offset,
          total,
          'target',
          'targets'
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
