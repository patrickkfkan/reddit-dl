import { type Response } from 'express';
import { type CoreTargetWebRequestHandlerConstructor } from '.';
import { type MediaPageList } from './Media';
import { type PostPageList } from './Post';
import { type PageElements } from '../../../web/types/PageElements';
import { type OverviewPage, type SearchContext } from '../../../web/types/Page';
import { BrowseURLs } from './BrowseURLs';
import { type SavedItemPageList } from './SavedItem';
import { type UserPageList } from './User';
import { type SubredditPageList } from './Subreddit';

export function OverviewPageWebRequestHandlerMixin<
  TBase extends CoreTargetWebRequestHandlerConstructor
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
      let savedItemList: SavedItemPageList | undefined = undefined;
      let joinedList: SubredditPageList | undefined = undefined;
      let followingList: UserPageList | undefined = undefined;
      let viewAllURL: {
        posts: string;
        media: string;
        saved?: string;
        joined?: string;
        following?: string;
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
            posts: BrowseURLs.getSubredditPostsURL(subreddit),
            media: BrowseURLs.getSubredditMediaURL(subreddit)
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
          savedItemList = this.getSavedItemList({
            username: target,
            sortBy: 'mostRecentlySaved',
            limit: 5,
            offset: 0
          });
          joinedList = this.getSubredditList({
            joinedBy: target,
            sortBy: 'a-z',
            limit: 5,
            offset: 0
          });
          followingList = this.getUserList({
            followedBy: target,
            sortBy: 'a-z',
            limit: 5,
            offset: 0
          });
          banner = this.getUserBanner(user);
          viewAllURL = {
            posts: BrowseURLs.getUserSubmittedURL(user),
            media: BrowseURLs.getUserMediaURL(user),
            saved: BrowseURLs.getSavedItemsURL(user),
            joined: BrowseURLs.getJoinedSubredditsURL(user),
            following: BrowseURLs.getFollowingURL(user)
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
        recentSavedItems:
          savedItemList && viewAllURL.saved ?
            {
              items: savedItemList.items,
              total: savedItemList.total,
              viewAllURL: viewAllURL.saved
            }
          : undefined,
        joinedSubreddits:
          joinedList && viewAllURL.joined ?
            {
              items: joinedList.items,
              total: joinedList.total,
              viewAllURL: viewAllURL.joined
            }
          : undefined,
        following:
          followingList && viewAllURL.following ?
            {
              items: followingList.items,
              total: followingList.total,
              viewAllURL: viewAllURL.following
            }
          : undefined,
        searchContext
      } satisfies OverviewPage);
    }
  };
}
