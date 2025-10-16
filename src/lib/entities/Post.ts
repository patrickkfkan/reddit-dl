import { type Downloaded, type DownloadableImage } from './Common';
import { type Subreddit } from './Subreddit';
import { type User } from './User';

export enum PostType {
  IMAGE = 'image',
  GALLERY = 'gallery',
  HOSTED_VIDEO = 'hosted:video',
  RICH_VIDEO = 'rich:video',
  SELF = 'self',
  LINK = 'link',
  CROSS_POST = 'cross_post',
  UNKNOWN = 'unknown'
}

export type Post<T extends PostType> = {
  id: string;
  url: string;
  type: T;
  rawType: string;
  subreddit: Subreddit;
  author: User;
  createdUTC: number;
  removedBy: string | null;
  title: string;
  content: {
    text: string;
    html: string;
    embeddedMedia: (PostMedia<PostType.IMAGE> & { id: string })[] | null;
  } & (T extends PostType.LINK ?
    {
      externalURL: string;
    }
  : {});
  media: PostMedia<T> | null;
  upvotes: number;
  downvotes: number;
  commentCount: {
    all: number;
    topLevel: number;
  };
  comments: PostComment[];
} & (T extends PostType.CROSS_POST ?
  {
    crossPost: Post<PostType> | null;
  }
: {});

export type PostMedia<T extends PostType> =
  T extends PostType.IMAGE ?
    {
      image: DownloadableImage;
      thumbnail: DownloadableImage | null;
    }
  : T extends PostType.GALLERY ?
    ({
      image: DownloadableImage;
      thumbnail: DownloadableImage | null;
    } | null)[]
  : T extends PostType.RICH_VIDEO ?
    {
      // RedGifs uses this type
      provider: string;
      thumbnail: DownloadableImage | null;
      content: {
        url: string;
        extractedSrc?: string;
        downloaded?: Downloaded | null;
        embedHTML?: string;
      };
    }
  : T extends PostType.HOSTED_VIDEO ?
    {
      src: {
        hls: string | null;
        dash: string | null;
        fallback: string | null;
        downloaded?: Downloaded | null;
      };
      thumbnail: DownloadableImage | null;
    }
  : null;

export interface PostComment {
  id: string;
  url: string;
  author: string;
  createdUTC: number;
  content: {
    text: string;
    html: string;
  };
  upvotes: number;
  downvotes: number;
  replyCount: number;
  replies: PostComment[];
}

export interface PostCommentWithPost {
  comment: PostComment;
  post: Post<PostType>;
}

export interface SavedPostComment extends PostComment {
  postInfo: {
    id: string;
    url: string;
    title: string;
  } | null;
}

export type PostBasicInfo = Pick<
  Post<PostType>,
  'id' | 'url' | 'title' | 'author' | 'subreddit'
>;
