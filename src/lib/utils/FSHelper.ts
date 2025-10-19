import dateFormat from 'dateformat';
import { FILE_DATE_TIME_FORMAT } from './Constants';
import { utcSecondsToDate } from './Misc';
import fs from 'fs-extra';
import { type Post, type PostType } from '../entities/Post';
import sanitize from 'sanitize-filename';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { type User } from '../entities/User';
import { type Subreddit } from '../entities/Subreddit';
import { type DownloadModeConfig } from '../DownloaderOptions';
import path from 'path';

export default class FSHelper {
  #config: DownloadModeConfig;

  constructor(config: DownloadModeConfig) {
    this.#config = config;
  }

  async getDBFilePath() {
    const dbDir = await this.mkdirForDB();
    return path.resolve(dbDir, 'reddit-dl.sqlite');
  }

  async mkdirForDB() {
    const dbDir = FSHelper.getDBDir(this.#config.dataDir);
    await this.#mkdirIfNotExists(dbDir);
    return dbDir;
  }

  async mkdirForPostMedia(post: Post<PostType>) {
    const userDir = await this.mkdirForUser(post.author);
    const mediaDir = path.resolve(userDir, 'post_media');
    await this.#mkdirIfNotExists(mediaDir);
    return mediaDir;
  }

  async mkdirForPostMediaThumbnails(post: Post<PostType>) {
    const userDir = await this.mkdirForUser(post.author);
    const thumbnailsDir = path.resolve(userDir, 'post_media_thumbnails');
    await this.#mkdirIfNotExists(thumbnailsDir);
    return thumbnailsDir;
  }

  async mkdirForUserProfileMedia(user: User) {
    const userDir = await this.mkdirForUser(user);
    const profileDir = path.resolve(userDir, 'profile_media');
    await this.#mkdirIfNotExists(profileDir);
    return profileDir;
  }

  async mkdirForUser(user: User) {
    const userDir = path.resolve(
      this.#config.dataDir,
      'users',
      sanitize(user.username)
    );
    await this.#mkdirIfNotExists(userDir);
    return userDir;
  }

  async mkdirForSubredditInfoMedia(subreddit: Subreddit) {
    const subredditDir = path.resolve(
      this.#config.dataDir,
      'subreddits',
      sanitize(subreddit.name),
      'info_media'
    );
    await this.#mkdirIfNotExists(subredditDir);
    return subredditDir;
  }

  async #mkdirIfNotExists(dir: string) {
    if (!fs.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  static getFilenameForPost(
    post: Post<PostType>,
    options?: {
      prefix?: string;
      suffix?: string;
      ext?: string;
    }
  ) {
    const dateString = dateFormat(
      utcSecondsToDate(post.createdUTC),
      FILE_DATE_TIME_FORMAT
    );
    const p = (post.url.endsWith('/') ? post.url.slice(0, -1) : post.url)
      .split('/')
      .pop();
    const p2 = p ? p.replaceAll('_', '-') : '';
    const base = sanitize(`${dateString}_${post.id}${p2 ? `_${p2}` : ''}`);
    return this.getSanitizedFilename(base, options);
  }

  static getSanitizedFilename(
    name: string,
    options?: {
      prefix?: string;
      suffix?: string;
      ext?: string;
    }
  ) {
    const prefix = options?.prefix ? sanitize(options.prefix) : '';
    const suffix = options?.suffix ? sanitize(options.suffix) : '';
    const ext = options?.ext ? sanitize(options.ext) : '';
    let base = sanitize(name);
    const baseLength = Buffer.byteLength(base);
    const prefixLength = Buffer.byteLength(prefix);
    const suffixLength = Buffer.byteLength(suffix);
    const extLength = Buffer.byteLength(ext);
    if (baseLength + prefixLength + suffixLength + extLength > 255) {
      base = this.#truncateUtf8Bytes(
        base,
        255 - prefixLength - suffixLength - extLength
      );
    }
    return `${prefix}${base}${suffix}${ext}`;
  }

  static #truncateUtf8Bytes(str: string, maxBytes = 255) {
    const buf = Buffer.from(str, 'utf8');
    if (buf.length <= maxBytes) return str;

    // Slice and decode safely
    let end = maxBytes;
    while (end > 0 && (buf[end] & 0b11000000) === 0b10000000) {
      // We're in the middle of a multibyte character
      end--;
    }

    return buf.subarray(0, end).toString('utf8');
  }

  static getSha256Sum(file: string) {
    const hash = createHash('sha256');
    return new Promise<string>((resolve, reject) => {
      const stream = createReadStream(file);
      stream.on('error', reject);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  static isSubPath(childPath: string, parentPath: string) {
    const relative = path.relative(parentPath, childPath);
    return (
      !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    );
  }

  static getDBDir(dataDir: string) {
    return path.resolve(dataDir, 'db');
  }
}
