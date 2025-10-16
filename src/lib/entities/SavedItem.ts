import {
  type PostBasicInfo,
  type Post,
  type PostComment,
  type PostType
} from './Post';

export interface SavedPostComment {
  type: 'postComment';
  data: PostComment;
  postInfo: PostBasicInfo | null;
}

export interface SavedPost {
  type: 'post';
  data: Post<PostType>;
}

export type SavedItemType = 'post' | 'postComment';

export type SavedItem<T extends SavedItemType> = (T extends 'post' ? SavedPost
: T extends 'postComment' ? SavedPostComment
: never) & {
  index: number;
};
