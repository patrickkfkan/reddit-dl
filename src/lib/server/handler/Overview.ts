import { type Response } from 'express';
import { type CommonWebRequestHandlerConstructor } from '.';
import { type MediaPageList } from './Media';
import { type PostPageList } from './Post';
import { type PageElements } from '../../../web/types/PageElements';
import { type OverviewPage, type SearchContext } from '../../../web/types/Page';

export function OverviewPageWebRequestHandlerMixin<
  TBase extends CommonWebRequestHandlerConstructor
>(Base: TBase) {
  return class OverviewPageWebRequestHandler extends Base {
    handleOverviewPageRequest(
      domain: 'subreddit',
      subredditName: string,
      res: Response
    ): void;
    handleOverviewPageRequest(
      domain: 'user',
      username: string,
      res: Response
    ): void;
    handleOverviewPageRequest(
      domain: 'user' | 'subreddit',
      target: string,
      res: Response
    ) {
      let banner: PageElements.Banner;
      let postList: PostPageList;
      let mediaList: MediaPageList<any>;
      let viewAllURL: {
        posts: string;
        media: string;
      };
      let searchContext: SearchContext;

      switch (domain) {
        case 'subreddit': {
          postList = this.getPostList({
            subredditName: target,
            sortBy: 'latest',
            limit: 5,
            offset: 0
          });
          const _mediaList = (mediaList = this.getMediaList({
            domain: 'subreddit',
            subredditName: target,
            sortBy: 'latest',
            limit: 24,
            offset: 0
          }));
          const subreddit = _mediaList.subreddit;
          banner = this.getSubredditBanner(subreddit);
          viewAllURL = {
            posts: this.getSubredditPostsURL(subreddit),
            media: this.getSubredditMediaURL(subreddit)
          };
          searchContext = {
            target: 'in_subreddit',
            subredditName: target
          };
          break;
        }
        case 'user': {
          postList = this.getPostList({
            author: target,
            sortBy: 'latest',
            limit: 5,
            offset: 0
          });
          const _mediaList = (mediaList = this.getMediaList({
            domain: 'user',
            username: target,
            sortBy: 'latest',
            limit: 24,
            offset: 0
          }));
          const user = _mediaList.user;
          banner = this.getUserBanner(user);
          viewAllURL = {
            posts: this.getUserSubmittedURL(user),
            media: this.getUserMediaURL(user)
          };
          searchContext = {
            target: 'by_user',
            username: target
          };
          break;
        }
      }

      res.json({
        banner,
        recentPosts: {
          items: postList.posts,
          total: postList.total,
          viewAllURL: viewAllURL.posts
        },
        recentMedia: {
          gallery: mediaList.gallery,
          total: mediaList.total,
          viewAllURL: viewAllURL.media
        },
        searchContext
      } satisfies OverviewPage);
    }
  };
}
