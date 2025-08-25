import { type DownloadableImage } from './Common';

export interface Subreddit {
  id: string;
  url: string;
  name: string;
  title: string;
  description: string;
  shortDescription: string;
  header: DownloadableImage | null;
  icon: DownloadableImage | null;
  banner: DownloadableImage | null;
}

export interface SubredditWithCounts {
  subreddit: Subreddit;
  counts: {
    post: number;
    media: number;
  };
}
