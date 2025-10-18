import { type Post, type PostType } from './Post';
import { type Subreddit } from './Subreddit';
import { type User } from './User';

export type ResolvedTarget = {
  runTimestamp: number;
} & (
  | {
      type: 'user_submitted';
      rawValue: string;
      user: User;
    }
  | {
      type: 'subreddit_posts';
      rawValue: string;
      subreddit: Subreddit;
    }
  | {
      type: 'post';
      rawValue: string;
      post: Post<PostType>;
    }
  | {
      type: 'me';
      rawValue: ('my/saved' | 'my/joined' | 'my/following')[];
      me: User;
    }
);
