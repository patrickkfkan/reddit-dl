import { type User } from '../entities/User';

export const PROJECT_URL = 'https://github.com/patrickkfkan/reddit-dl';
export const SITE_URL = 'https://www.reddit.com';
export const OAUTH_URL = 'https://oauth.reddit.com';
export const PREVIEW_IMAGE_URL = 'https://preview.redd.it';
export const IMAGE_URL = 'https://i.redd.it';
export const FILE_DATE_TIME_FORMAT = 'yyyy-mm-dd_HH-MM-ss';

export const DB_MEDIA_TYPE = {
  IMAGE: 0,
  VIDEO: 1
};

export const DELETED_USER: User = {
  username: '[deleted]',
  wasFetchedFromAPI: false,
  isSuspended: false,
  url: '',
  title: '',
  description: '',
  avatar: null,
  banner: null,
  icon: null,
  karma: 0
};

export const DEFAULT_LIMITER_NAME = 'default';
export const DEFAULT_WEB_SERVER_PORT = 3000;
