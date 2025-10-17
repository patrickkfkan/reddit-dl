import { type DownloadableImage } from './Common';
import { type Subreddit } from './Subreddit';

export interface User {
  username: string;
  wasFetchedFromAPI: boolean;
  isSuspended: boolean;
  url: string;
  title: string;
  description: string;
  avatar: DownloadableImage | null;
  banner: DownloadableImage | null;
  icon: DownloadableImage | null;
  karma: number;
}

export interface UserWithCounts {
  user: User;
  counts: {
    post: number;
    media: number;
    savedPost: number;
    savedComment: number;
  };
}

export type Subscription =
  | {
      type: 'subreddit';
      subreddit: Subreddit;
    }
  | {
      type: 'user';
      username: string;
    };
