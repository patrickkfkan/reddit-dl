import { type DownloadableImage } from './Common';

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
  };
}
