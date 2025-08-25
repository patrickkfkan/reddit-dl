import { type Post, type PostType } from './Post';
import { type Subreddit } from './Subreddit';
import { type User } from './User';

export type ResolvedTarget = {
  rawValue: string;
  runTimestamp: number;
} & (
  | {
      type: 'user_submitted';
      user: User;
    }
  | {
      type: 'subreddit_posts';
      subreddit: Subreddit;
    }
  | {
      type: 'post';
      post: Post<PostType>;
    }
);
