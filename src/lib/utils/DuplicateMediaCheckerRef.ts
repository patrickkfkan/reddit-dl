import { type Post, type PostType } from '../entities/Post';
import { type Subreddit } from '../entities/Subreddit';
import { type User } from '../entities/User';
import FSHelper from './FSHelper';

export type DuplicateMediaCheckerRefParams = (
  | {
      refType: 'sha256sum';
      file: string;
    }
  | {
      refType: 'url';
      url: string;
    }
) &
  (
    | {
        domain: 'postMedia' | 'postMediaThumbnail';
        post: Post<PostType>;
      }
    | {
        domain: 'userProfile';
        user: User;
      }
    | {
        domain: 'subredditInfo';
        subreddit: Subreddit;
      }
  );

export async function getDuplicateMediaCheckerRef(
  params: DuplicateMediaCheckerRefParams
) {
  let prefix;
  switch (params.domain) {
    case 'postMedia':
      prefix = `u:${params.post.author.username}:postMedia`;
      break;
    case 'postMediaThumbnail':
      prefix = `u:${params.post.author.username}:postMediaThumbnail`;
      break;
    case 'userProfile':
      prefix = `u:${params.user.username}:profile`;
      break;
    case 'subredditInfo':
      prefix = `r:${params.subreddit.id}:info`;
      break;
  }
  switch (params.refType) {
    case 'sha256sum': {
      return `${prefix}:${await FSHelper.getSha256Sum(params.file)}`;
    }
    case 'url': {
      return `${prefix}:${params.url}`;
    }
  }
}
