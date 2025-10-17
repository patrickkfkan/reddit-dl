import {
  type PostBasicInfo,
  type Post,
  type PostComment,
  type PostType
} from '../../entities/Post';
import { type Subreddit } from '../../entities/Subreddit';
import { type User } from '../../entities/User';
import { SITE_URL } from '../../utils/Constants';

export class BrowseURLs {
  static getMediaURL(type: 'image' | 'video', file?: string | null) {
    if (!file) {
      return null;
    }
    const params = new URLSearchParams({
      file
    });
    return `/${type}?${params.toString()}`;
  }

  static getStaticImageURL(file: string) {
    return `/assets/images/${file}`;
  }

  static getSubredditIconURL(subreddit: Subreddit) {
    return this.getMediaURL('image', subreddit.icon?.downloaded?.path);
  }

  static getUserIconURL(user: User) {
    return this.getMediaURL(
      'image',
      user.avatar?.downloaded?.path || user.icon?.downloaded?.path
    );
  }

  static getUserOverviewURL(user: User) {
    return `/u/${user.username}`;
  }

  static getUserSubmittedURL(user: User) {
    return `/u/${user.username}/submitted`;
  }

  static getUserMediaURL(user: User) {
    return `/u/${user.username}/media`;
  }

  static getSubredditOverviewURL(subreddit: Subreddit) {
    return `/r/${subreddit.name}`;
  }

  static getSubredditPostsURL(subreddit: Subreddit) {
    return `/r/${subreddit.name}/posts`;
  }

  static getSubredditMediaURL(subreddit: Subreddit) {
    return `/r/${subreddit.name}/media`;
  }

  static getPostURL(post: Post<PostType> | PostBasicInfo) {
    return `/post/${post.id}`;
  }

  static getRedditURL(target: Post<PostType> | Subreddit | User | PostComment) {
    return target.url ? new URL(target.url, SITE_URL).toString() : null;
  }

  static getPostCommentsURL(params: {
    postId: string;
    parentId?: string;
    sortBy?: 'latest' | 'oldest' | 'top';
    limit?: number;
    offset?: number;
  }) {
    const { postId, sortBy, limit, offset } = params;
    const query: Record<string, string> = {
      post_id: postId
    };
    if (sortBy) {
      query['s'] = sortBy;
    }
    if (limit && limit > 0) {
      query['n'] = String(limit);
    }
    if (offset && offset >= 0) {
      query['o'] = String(offset);
    }
    if (params.parentId) {
      query['comment_id'] = params.parentId;
      return `/api/post_comment_replies?${new URLSearchParams(query).toString()}`;
    } else {
      return `/api/post_comments?${new URLSearchParams(query).toString()}`;
    }
  }

  static getSavedItemsURL(user: User) {
    return `/u/${user.username}/saved`;
  }

  static getJoinedSubredditsURL(joinedBy: User) {
    return `/u/${joinedBy.username}/joined`;
  }

  static getFollowingURL(followedBy: User) {
    return `/u/${followedBy.username}/following`;
  }
}
