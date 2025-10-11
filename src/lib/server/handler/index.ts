import { type Request } from 'express';
import { type DBInstance } from '../../db';
import { type Subreddit } from '../../entities/Subreddit';
import { type User } from '../../entities/User';
import { type LogLevel } from '../../utils/logging';
import type Logger from '../../utils/logging/Logger';
import { commonLog } from '../../utils/logging/Logger';
import { MediaWebRequestHandlerMixin } from './Media';
import { PostPageWebRequestHandlerMixin } from './Post';
import { TargetPageWebRequestHandlerMixin } from './Target';
import { EOL } from 'os';
import markdownit from 'markdown-it';
import { OverviewPageWebRequestHandlerMixin } from './Overview';
import {
  type PostComment,
  type Post,
  type PostType
} from '../../entities/Post';
import { SubredditPageWebRequestHandlerMixin } from './Subreddit';
import { UserPageWebRequestHandlerMixin } from './User';
import { type PageElements } from '../../../web/types/PageElements';
import { SITE_URL } from '../../utils/Constants';
import { SettingsWebRequestHandlerMixin } from './Settings';
import { SearchPageWebRequestHandlerMixin } from './Search';
import { sanitizeHTML } from '../../utils/Misc';
import { PostCommentWebRequestHandlerMixin } from './PostComment';

export interface PaginationParams {
  limit: number;
  offset: number;
}

export type SearchAndSortByParams<T extends string[]> =
  | {
      search: undefined;
      sortBy: T[number];
    }
  | {
      search: string;
      sortBy: 'best_match' | T[number];
    };

const DEFAULT_ITEMS_PER_PAGE = 20;
const PAGE_NAV_MAX_LINKS = 10;

export type WebRequestHandlerConstructor = new (
  ...args: any[]
) => WebRequestHandlerBase;

export type CommonWebRequestHandlerConstructor = new (
  ...args: any[]
) => InstanceType<typeof CommonWebRequestHandler>;

export type CoreTargetWebRequestHandlerConstructor = new (
  ...args: any[]
) => InstanceType<typeof CoreTargetWebRequestHandler>;

export type WebRequestHandlerInstance = InstanceType<typeof WebRequestHandler>;

export class WebRequestHandlerBase {
  name = 'WebRequestHandler';

  protected static instance: WebRequestHandlerInstance | null = null;
  protected db: DBInstance;
  protected dataDir: string;
  protected logger?: Logger | null;

  constructor(db: DBInstance, dataDir: string, logger?: Logger | null) {
    this.db = db;
    this.dataDir = dataDir;
    this.logger = logger;
  }

  protected getMediaURL(type: 'image' | 'video', file?: string | null) {
    if (!file) {
      return null;
    }
    const params = new URLSearchParams({
      file
    });
    return `/${type}?${params.toString()}`;
  }

  protected getStaticImageURL(file: string) {
    return `/assets/images/${file}`;
  }

  protected getSubredditIconURL(subreddit: Subreddit) {
    return this.getMediaURL('image', subreddit.icon?.downloaded?.path);
  }

  protected getUserIconURL(user: User) {
    return this.getMediaURL(
      'image',
      user.avatar?.downloaded?.path || user.icon?.downloaded?.path
    );
  }

  protected getUserOverviewURL(user: User) {
    return `/u/${user.username}`;
  }

  protected getUserSubmittedURL(user: User) {
    return `/u/${user.username}/submitted`;
  }

  protected getUserSavedURL(user: User) {
    return `/u/${user.username}/saved`;
  }

  protected getUserMediaURL(user: User) {
    return `/u/${user.username}/media`;
  }

  protected getSubredditOverviewURL(subreddit: Subreddit) {
    return `/r/${subreddit.name}`;
  }

  protected getSubredditPostsURL(subreddit: Subreddit) {
    return `/r/${subreddit.name}/posts`;
  }

  protected getSubredditMediaURL(subreddit: Subreddit) {
    return `/r/${subreddit.name}/media`;
  }

  getLatestSavedTargetURL() {
    try {
      const targets = this.db.getTargets({
        // Cast to any to allow filtering by specific type without changing signature
        type: 'user_saved' as any,
        sortBy: 'mostRecentlyRun',
        limit: 1,
        offset: 0
      });
      const target = targets[0];
      if (target && target.type === 'user_saved') {
        return this.getUserSavedURL(target.user);
      }
    } catch (_e) {
      // ignore errors
    }
    return null;
  }

  protected getPostURL(post: Post<PostType>) {
    return `/post/${post.id}`;
  }

  protected getRedditURL(
    target: Post<PostType> | Subreddit | User | PostComment
  ) {
    return target.url ? new URL(target.url, SITE_URL).toString() : null;
  }

  protected getPaginationParams(
    req: Request,
    defaultItemsPerPage = DEFAULT_ITEMS_PER_PAGE
  ): PaginationParams {
    const { p, n = defaultItemsPerPage, o } = req.query;
    if (p && o) {
      throw Error('Cannot use both "p" and "o" params at the same time');
    }
    const itemsPerPage = Number(n);
    if (isNaN(itemsPerPage)) {
      throw TypeError('Invalid param "n"');
    }
    if (itemsPerPage <= 0) {
      throw Error(`Invalid value "${itemsPerPage}" for param "n"`);
    }
    let offset: number | null = null;
    if (o) {
      offset = Number(o);
      if (isNaN(offset)) {
        throw TypeError('Invalid param "o"');
      }
      if (offset < 0) {
        throw Error(`Invalid value "${offset}" for param "o"`);
      }
    }
    if (offset === null) {
      const page = Number(p ?? 1);
      if (isNaN(page)) {
        throw TypeError('Invalid param "p"');
      }
      if (page <= 0) {
        throw Error(`Invalid value "${page}" for param "p"`);
      }
      offset = (page - 1) * itemsPerPage;
    }
    return {
      limit: itemsPerPage,
      offset
    };
  }

  protected getSearchAndSortByParams<T extends string[]>(
    req: Request,
    baseSortBys: T,
    defaultBaseSortBy: T[number]
  ): SearchAndSortByParams<T> {
    const { s, q: search } = req.query;
    if (!search) {
      const sortBy = (s ?? defaultBaseSortBy) as string;
      if (!baseSortBys.includes(sortBy)) {
        throw Error(`Invalid value "${sortBy}" for param "s"`);
      }
      return {
        search: undefined,
        sortBy
      };
    }
    // Has search
    const sortBy = (s ?? 'best_match') as string;
    if (!baseSortBys.includes(sortBy) && sortBy !== 'best_match') {
      throw Error(`Invalid value "${sortBy}" for params "s"`);
    }
    return {
      search: search as string,
      sortBy
    };
  }

  protected getPageNav(
    req: Request,
    totalItems: number,
    itemsPerPage: number
  ): PageElements.Nav {
    const { limit, offset: currentOffset } = this.getPaginationParams(
      req,
      itemsPerPage
    );
    const referer = this.getReferer(req);
    const pathname = referer.pathname;
    const baseParams = referer.searchParams;
    const totalPages = Math.ceil(totalItems / limit);
    const sections: PageElements.Nav['sections'] = [];
    const currentPage = Math.floor(currentOffset / limit) + 1;
    // All pages numbers can be displayed
    // So if PAGE_NAV_MAX_LINKS = 10, then we would expect:
    // 1 2 3 4 5 6 7 8 9 10
    if (totalPages <= PAGE_NAV_MAX_LINKS) {
      sections.push(
        this.#getPageNavLinks(1, totalPages, currentPage, pathname, baseParams)
      );
    }
    // Current page is in first section
    // PAGE_NAV_MAX_LINKS - 1 to account for the last link
    // So if PAGE_NAV_MAX_LINKS = 10 and total pages is 23, then we would expect:
    // 1 2 3 4 5 6 8 9 ... 23
    else if (currentPage < PAGE_NAV_MAX_LINKS - 1) {
      sections.push(
        this.#getPageNavLinks(
          1,
          PAGE_NAV_MAX_LINKS - 1,
          currentPage,
          pathname,
          baseParams
        )
      );
      sections.push(
        this.#getPageNavLinks(
          totalPages,
          totalPages,
          currentPage,
          pathname,
          baseParams
        )
      );
    }
    // Current page is in last section
    // PAGE_NAV_MAX_LINKS + 2 to account for the first link
    // So if PAGE_NAV_MAX_LINKS = 10 and total pages is 23, then we would expect:
    // 1...15 16 17 18 19 20 21 22 23
    else if (currentPage >= totalPages - PAGE_NAV_MAX_LINKS + 2) {
      sections.push(
        this.#getPageNavLinks(1, 1, currentPage, pathname, baseParams)
      );
      sections.push(
        this.#getPageNavLinks(
          totalPages - PAGE_NAV_MAX_LINKS + 2,
          totalPages,
          currentPage,
          pathname,
          baseParams
        )
      );
    }
    // Current page is in middle section
    // If PAGE_NAV_MAX_LINKS = 10, total pages is 83 and current is 25, then we would expect:
    // 1 ... 23 24 25 26 27 28 29 30 ... 83
    else {
      sections.push(
        this.#getPageNavLinks(1, 1, currentPage, pathname, baseParams)
      );
      let currentSection =
        Math.floor(currentPage / (PAGE_NAV_MAX_LINKS - 2)) + 1;
      // Each section has PAGE_NAV_MAX_LINKS - 2 links
      // Extra -1 so that starting page becomes the last page of the previous section
      let currentSectionStartingPage =
        2 + (currentSection - 1) * (PAGE_NAV_MAX_LINKS - 3);
      let currentSectionEndingPage =
        currentSectionStartingPage + PAGE_NAV_MAX_LINKS - 3;
      // Sometimes currentSection is one less actual
      if (currentPage >= currentSectionEndingPage) {
        currentSection++;
        currentSectionStartingPage += PAGE_NAV_MAX_LINKS - 3;
        currentSectionEndingPage += PAGE_NAV_MAX_LINKS - 3;
      }
      // Check if we have run into the situation where currentSectionEndingPage is
      // the second last page. If so, just include the last page into the section, because it
      // would be wierd to have something like: 1 ... 23 24 25 26 27 28 29 30 ... 31
      if (currentSectionEndingPage === totalPages - 1) {
        sections.push(
          this.#getPageNavLinks(
            currentSectionStartingPage,
            totalPages,
            currentPage,
            pathname,
            baseParams
          )
        );
      } else {
        sections.push(
          this.#getPageNavLinks(
            currentSectionStartingPage,
            currentSectionEndingPage,
            currentPage,
            pathname,
            baseParams
          )
        );
        sections.push(
          this.#getPageNavLinks(
            totalPages,
            totalPages,
            currentPage,
            pathname,
            baseParams
          )
        );
      }
    }
    const previous =
      currentPage > 1 ?
        this.#getPageNavLinks(
          currentPage - 1,
          currentPage - 1,
          currentPage,
          pathname,
          baseParams
        )[0].url
      : null;
    const next =
      currentPage < totalPages ?
        this.#getPageNavLinks(
          currentPage + 1,
          currentPage + 1,
          currentPage,
          pathname,
          baseParams
        )[0].url
      : null;
    return {
      sections,
      previous,
      next,
      totalPages
    };
  }

  #getPageNavLinks(
    fromPage: number,
    toPage: number,
    currentPage: number,
    pathname: string,
    baseParams: URLSearchParams
  ): PageElements.NavLink[] {
    const links: PageElements.NavLink[] = [];
    for (let page = fromPage; page <= toPage; page++) {
      baseParams.set('p', String(page));
      links.push({
        pageNumber: page,
        isCurrent: page === currentPage,
        url: `${pathname}?${baseParams.toString()}`
      });
    }
    return links;
  }

  getReferer(req: Request) {
    const referer = req.get('Referer');
    if (!referer) {
      throw Error('Referer missing from request');
    }
    return new URL(referer);
  }

  protected modifyRequestURL(
    req: Request,
    searchParams: Record<string, string | null>
  ) {
    const referer = this.getReferer(req);
    const pathname = referer.pathname;
    const params = referer.searchParams;
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    return `${pathname}?${params.toString()}`;
  }

  protected getShowingText(
    limit: number,
    offset: number,
    total: number,
    itemNameSingular: string,
    itemNamePlural: string
  ) {
    let text;
    if (total === 0) {
      text = `No ${itemNamePlural} found`;
    }
    if (total > limit) {
      const start = offset + 1;
      const end = Math.min(offset + limit, total);
      text = `Showing ${start} - ${end} of ${total} ${itemNamePlural}`;
    } else {
      text = `Total ${total} ${total === 1 ? itemNameSingular : itemNamePlural}`;
    }
    return text;
  }

  protected getSubredditBanner(subreddit: Subreddit): PageElements.Banner {
    return {
      icon: this.getSubredditIconURL(subreddit),
      title: {
        text: `r/${subreddit.name}`,
        url: this.getSubredditOverviewURL(subreddit)
      },
      externalURL: this.getRedditURL(subreddit),
      caption: subreddit.title !== subreddit.name ? subreddit.title : '',
      shortDescription: subreddit.shortDescription,
      description: this.convertRedditTextifiedToHTML(subreddit.description)
    };
  }

  protected getUserBanner(user: User): PageElements.Banner {
    return {
      icon: this.getUserIconURL(user),
      title: {
        text: `u/${user.username}`,
        url: this.getUserOverviewURL(user)
      },
      externalURL: this.getRedditURL(user),
      caption: user.title !== user.username ? user.title : '',
      shortDescription: user.description,
      description: ''
    };
  }

  protected convertRedditTextifiedToHTML(value: string) {
    const markdown = value.replaceAll('\\n', EOL);
    return sanitizeHTML(markdownit().render(markdown));
  }

  protected log(level: LogLevel, ...msg: any[]) {
    commonLog(this.logger, level, this.name, ...msg);
  }
}

const CommonWebRequestHandler = PostCommentWebRequestHandlerMixin(
  PostPageWebRequestHandlerMixin(
    MediaWebRequestHandlerMixin(WebRequestHandlerBase)
  )
);

const CoreTargetWebRequestHandler = UserPageWebRequestHandlerMixin(
  SubredditPageWebRequestHandlerMixin(
    TargetPageWebRequestHandlerMixin(CommonWebRequestHandler)
  )
);

const WebRequestHandler = SettingsWebRequestHandlerMixin(
  SearchPageWebRequestHandlerMixin(
    OverviewPageWebRequestHandlerMixin(CoreTargetWebRequestHandler)
  )
);

export default WebRequestHandler;
