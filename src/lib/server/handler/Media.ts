import path from 'path';
import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import fs from 'fs';
import { type DBPostMedia } from '../../db/Media';
import { DELETED_USER } from '../../utils/Constants';
import { type Subreddit } from '../../entities/Subreddit';
import { type User } from '../../entities/User';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type SearchContext,
  type MediaListPage
} from '../../../web/types/Page';
import { utcSecondsToDate } from '../../utils/Misc';
import { BrowseURLs } from './BrowseURLs';
import FSHelper from '../../utils/FSHelper';

export type MediaPageListDomain = 'subreddit' | 'user' | 'all';

export type MediaPageRequestDomain = 'subreddit' | 'user' | 'all';

export type MediaPageRequestParams<T extends MediaPageRequestDomain> =
  T extends 'subreddit' ?
    {
      domain: T;
      subredditName: string;
      req: Request;
      res: Response;
    }
  : T extends 'user' ?
    {
      domain: T;
      username: string;
      req: Request;
      res: Response;
    }
  : T extends 'all' ?
    {
      domain: T;
      req: Request;
      res: Response;
    }
  : never;

export type MediaPageGetListParams<T extends MediaPageListDomain> =
  T extends 'subreddit' ?
    {
      domain: T;
      subredditName: string;
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }
  : T extends 'user' ?
    {
      domain: T;
      username: string;
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }
  : T extends 'all' ?
    {
      domain: T;
      sortBy: 'latest' | 'oldest';
      limit: number;
      offset: number;
    }
  : never;

export type MediaPageList<T extends MediaPageListDomain> =
  T extends 'subreddit' ?
    {
      subreddit: Subreddit;
      gallery: PageElements.MediaGallery;
      total: number;
    }
  : T extends 'user' ?
    {
      user: User;
      gallery: PageElements.MediaGallery;
      total: number;
    }
  : T extends 'all' ?
    {
      gallery: PageElements.MediaGallery;
      total: number;
    }
  : never;

const DEFAULT_ITEMS_PER_PAGE = 100;

export function MediaWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class MediaWebRequestHandler extends Base {
    #dbDir: string;

    constructor(...args: any[]) {
      super(...args);
      this.#dbDir = FSHelper.getDBDir(this.dataDir);
    }

    handleMediaRequest(type: 'image' | 'video', req: Request, res: Response) {
      const file = req.query.file;
      if (!file) {
        throw Error('Missing param "file"');
      }
      if (typeof file !== 'string') {
        throw TypeError('Invalid param "file"');
      }
      const mediaFilePath = path.resolve(this.dataDir, file);

      if (
        !FSHelper.isSubPath(mediaFilePath, this.dataDir) ||
        FSHelper.isSubPath(mediaFilePath, this.#dbDir)
      ) {
        res.status(403).send('Forbidden');
        return;
      }

      if (!fs.existsSync(mediaFilePath)) {
        res.status(404).send('Media not found');
        return;
      }
      switch (type) {
        case 'image':
          res.sendFile(mediaFilePath, {
            dotfiles: 'allow'
          });
          break;
        case 'video': {
          const range = req.headers.range;
          if (!range) {
            res.sendFile(mediaFilePath, {
              headers: { 'Content-Type': 'video/mp4' },
              dotfiles: 'allow'
            });
            return;
          }
          const fileSize = fs.statSync(mediaFilePath).size;
          const chunkSize = 10 ** 6; // 1MB chunks
          const start = Number(range.replace(/\D/g, ''));
          const end = Math.min(start + chunkSize, fileSize - 1);

          const headers = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': 'video/mp4'
          };

          res.writeHead(206, headers);
          const stream = fs.createReadStream(mediaFilePath, { start, end });
          stream.pipe(res);
          break;
        }
      }
    }

    handleMediaPageRequest<T extends MediaPageRequestDomain>(
      params: MediaPageRequestParams<T>
    ) {
      const { domain, req, res } = params;
      const { limit, offset } = this.getPaginationParams(
        req,
        DEFAULT_ITEMS_PER_PAGE
      );
      const { s: sortBy = 'latest' } = req.query;
      if (sortBy !== 'latest' && sortBy !== 'oldest') {
        throw Error(`Unknown value "${sortBy as string}" for param "s"`);
      }

      let banner: PageElements.Banner | null;
      let mediaList: MediaPageList<any>;
      let searchContext: SearchContext;

      switch (domain) {
        case 'subreddit': {
          const _mediaList = (mediaList = this.getMediaList({
            domain: 'subreddit',
            subredditName: params.subredditName,
            sortBy,
            limit,
            offset
          }));
          banner = this.getSubredditBanner(_mediaList.subreddit);
          searchContext = {
            target: 'in_subreddit',
            subredditName: params.subredditName
          };
          break;
        }
        case 'user': {
          const _mediaList = (mediaList = this.getMediaList({
            domain: 'user',
            username: params.username,
            sortBy,
            limit,
            offset
          }));
          banner = this.getUserBanner(_mediaList.user);
          searchContext = {
            target: 'by_user',
            username: params.username
          };
          break;
        }
        case 'all': {
          mediaList = this.getMediaList({
            domain: 'all',
            sortBy,
            limit,
            offset
          });
          banner = null;
          searchContext = {
            target: 'all'
          };
          break;
        }
      }

      const { gallery, total } = mediaList;

      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      const sortOptions: PageElements.SortOptions | undefined =
        total > 1 ?
          [
            {
              text: 'Latest',
              url: this.modifyRequestURL(req, { p: null, s: 'latest' }),
              isCurrent: sortBy === 'latest'
            },
            {
              text: 'Oldest',
              url: this.modifyRequestURL(req, { p: null, s: 'oldest' }),
              isCurrent: sortBy === 'oldest'
            }
          ]
        : undefined;

      res.json({
        title: 'Media',
        banner,
        gallery,
        nav: pageNav,
        showingText: this.getShowingText(
          limit,
          offset,
          total,
          'media item',
          'media items'
        ),
        sortOptions,
        searchContext
      } satisfies MediaListPage);
    }

    protected getMediaList<T extends MediaPageListDomain>(
      params: MediaPageGetListParams<T>
    ): MediaPageList<T> {
      const { domain, sortBy, limit, offset } = params;
      switch (domain) {
        case 'subreddit': {
          const subredditName = params.subredditName;
          const subreddit = this.db.getSubredditByName(subredditName);
          if (!subreddit) {
            throw Error(
              `Subreddit info for "${subredditName}" not found in DB`
            );
          }
          const mediaItems = this.db.getPostMedia({
            by: 'subreddit',
            subredditId: subreddit.id,
            sortBy,
            limit,
            offset
          });
          let total: number;
          try {
            total = this.db.getCountsForSubreddit(subreddit.id)?.media ?? -1;
            if (total < 0) {
              this.log(
                'warn',
                `Failed to get media count by subreddit "${subreddit.id}"`
              );
            }
          } catch (error) {
            this.log(
              'error',
              `Failed to get media count by subreddit "${subreddit.id}":`,
              error
            );
            total = -1;
          }
          return {
            subreddit,
            gallery: {
              id: subreddit.id,
              items: mediaItems.map<PageElements.MediaGalleryItem>(
                (mediaItem) =>
                  this.#createMediaGalleryItem(mediaItem, true, false)
              )
            },
            total
          } as MediaPageList<T>;
        }
        case 'user': {
          const username = params.username;
          const user = this.db.getUser(username);
          if (!user) {
            throw Error(`User profile for "${username}" not found in DB`);
          }
          const mediaItems = this.db.getPostMedia({
            by: 'user',
            username,
            sortBy,
            limit,
            offset
          });
          let total: number;
          try {
            total = this.db.getCountsForUser(username)?.media ?? -1;
            if (total < 0) {
              this.log(
                'warn',
                `Failed to get media count by user "${username}"`
              );
            }
          } catch (error) {
            this.log(
              'error',
              `Failed to get media count by user "${username}":`,
              error
            );
            total = -1;
          }
          return {
            user,
            gallery: {
              id: username,
              items: mediaItems.map<PageElements.MediaGalleryItem>(
                (mediaItem) =>
                  this.#createMediaGalleryItem(mediaItem, false, true)
              )
            },
            total
          } as MediaPageList<T>;
        }
        case 'all': {
          const mediaItems = this.db.getPostMedia({
            sortBy,
            limit,
            offset
          });
          let total: number;
          try {
            total = this.db.getPostMediaCount() ?? -1;
            if (total < 0) {
              this.log('warn', `Failed to get media count`);
            }
          } catch (error) {
            this.log('error', `Failed to get media count:`, error);
            total = -1;
          }
          return {
            gallery: {
              id: 'all',
              items: mediaItems.map<PageElements.MediaGalleryItem>(
                (mediaItem) =>
                  this.#createMediaGalleryItem(mediaItem, true, true)
              )
            },
            total
          } as MediaPageList<T>;
        }
      }
    }

    #createMediaGalleryItem(
      media: DBPostMedia,
      includeUploader: boolean,
      includeSubreddit: boolean
    ): PageElements.MediaGalleryItem {
      const post = media.firstContainingPost;
      const author =
        includeUploader ?
          {
            icon: BrowseURLs.getUserIconURL(post.author) || undefined,
            text:
              post.author.username !== DELETED_USER.username ?
                `u/${post.author.username}`
              : post.author.username,
            url: BrowseURLs.getUserOverviewURL(post.author)
          }
        : undefined;
      const subreddit =
        includeSubreddit ?
          {
            icon: BrowseURLs.getSubredditIconURL(post.subreddit) || undefined,
            text: `r/${post.subreddit.name}`,
            url: BrowseURLs.getSubredditOverviewURL(post.subreddit)
          }
        : undefined;
      const uploaded =
        post.createdUTC >= 0 ?
          utcSecondsToDate(post.createdUTC).toLocaleString()
        : '';

      const src = BrowseURLs.getMediaURL(media.type, media.downloadPath);

      const kicker: PageElements.TextRunGroup[] = [];
      if (uploaded) {
        kicker.push({ runs: [{ text: uploaded }] });
      }
      if (subreddit) {
        kicker.push({ runs: [subreddit] });
      }

      const containingPostsURL =
        media.containingPostCount > 1 ?
          `/api/media/${media.id}/containing_posts?showSubreddit=${includeSubreddit}&showAuthor=${includeUploader}`
        : null;

      const item: PageElements.MediaGalleryItem = {
        mediaId: String(media.id),
        type: media.type,
        src,
        thumbnail:
          src ?
            BrowseURLs.getMediaURL('image', media.thumbnailDownloadPath) ||
            (media.type === 'image' ?
              src
            : BrowseURLs.getStaticImageURL('video.png'))
          : null,
        title: post.title,
        tooltip: {
          id: `media-item-tooltip-${media.id}`,
          type: 'MediaItemTooltip',
          class: 'media-item-tooltip',
          kicker,
          title: [
            {
              runs: [
                {
                  text: post.title,
                  url: BrowseURLs.getPostURL(post)
                }
              ]
            }
          ],
          subtitle: author ? [{ runs: [author] }] : undefined,
          body:
            containingPostsURL ?
              {
                content: {
                  moreContainingPosts: media.containingPostCount - 1,
                  containingPostsURL
                }
              }
            : undefined
        }
      };

      return item;
    }
  };
}
