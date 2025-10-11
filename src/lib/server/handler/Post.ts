import { type WebRequestHandlerConstructor } from '.';
import { type Request, type Response } from 'express';
import { type Post, PostType } from '../../entities/Post';
import { DELETED_USER, SITE_URL } from '../../utils/Constants';
import { type Subreddit } from '../../entities/Subreddit';
import { type User } from '../../entities/User';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type PostListPage,
  type PostPage,
  type PostsContainingMediaPage,
  type SearchContext
} from '../../../web/types/Page';
import { type DBGetPostsParams } from '../../db/Post';
import { sanitizeHTML, utcSecondsToDate } from '../../utils/Misc';
import { load as cheerioLoad } from 'cheerio';
import { validateURL } from '../../utils/URL';
import path from 'path';

export type PostPageListDomain = 'subreddit' | 'user' | 'all';

export type PostPageRequestDomain =
  | 'post'
  | 'subreddit'
  | 'user'
  | 'user_saved'
  | 'all';

export type PostPageRequestParams = {
  req: Request;
  res: Response;
} & (
  | {
      domain: 'post';
      postId: string;
    }
  | {
      domain: 'subreddit';
      subredditName: string;
    }
  | {
      domain: 'user';
      username: string;
    }
  | {
      domain: 'user_saved';
      username: string;
    }
  | {
      domain: 'all';
    }
);

export type PostPageGetListParams = {
  subredditName?: string;
  author?: string;
  limit: number;
  offset: number;
} & (
  | {
      search?: undefined;
      sortBy: 'latest' | 'oldest' | 'top';
    }
  | {
      search: string;
      sortBy: 'best_match' | 'latest' | 'oldest' | 'top';
    }
);

export type GetPostListPageParams = {
  req: Request;
} & (
  | {
      domain: 'subreddit';
      subredditName: string;
    }
  | {
      domain: 'user';
      username: string;
    }
  | {
      domain: 'user_saved';
      username: string;
    }
  | {
      domain: 'all';
    }
);

export type PostPageList = {
  subreddit?: Subreddit;
  user?: User;
  posts: PageElements.Card<'Post'>[];
  total: number;
};

export function PostPageWebRequestHandlerMixin<
  TBase extends WebRequestHandlerConstructor
>(Base: TBase) {
  return class PostPageWebRequestHandler extends Base {
    handlePostPageRequest(params: PostPageRequestParams) {
      const { domain, res } = params;
      switch (domain) {
        case 'post': {
          const postId = params.postId;
          const post = this.db.getPost(postId);
          if (!post) {
            throw Error(`Post "${postId}" not found in DB`);
          }
          const banner = this.getSubredditBanner(post.subreddit);
          res.json({
            banner,
            post: this.#createPostCard(post, true, false, false),
            searchContext: {
              target: 'all'
            },
            commentsURL:
              post.commentCount.topLevel > 0 ?
                `/api/post_comments?post_id=${postId}&o=0&s=latest`
              : null
          } satisfies PostPage);
          break;
        }
        case 'subreddit':
        case 'user':
        case 'user_saved':
        case 'all': {
          res.json(
            this.getPostListPage({
              ...params
            })
          );
          break;
        }
      }
    }

    protected getPostListPage(params: GetPostListPageParams): PostListPage {
      const { domain, req } = params;
      const { limit, offset } = this.getPaginationParams(req);
      let banner: PageElements.Banner | null;
      let postList: PostPageList;
      const ssb = this.getSearchAndSortByParams(
        req,
        ['latest', 'oldest', 'top'] as const,
        'latest'
      );
      let searchContext: SearchContext;

      if (domain === 'subreddit') {
        const _postList = (postList = this.getPostList({
          subredditName: params.subredditName,
          ...ssb,
          limit,
          offset
        }));
        banner =
          _postList.subreddit ?
            this.getSubredditBanner(_postList.subreddit)
          : null;
        searchContext = {
          target: 'in_subreddit',
          subredditName: params.subredditName
        };
      } else if (domain === 'user') {
        const _postList = (postList = this.getPostList({
          author: params.username,
          ...ssb,
          limit,
          offset
        }));
        banner = _postList.user ? this.getUserBanner(_postList.user) : null;
        searchContext = {
          target: 'by_user',
          username: params.username
        };
      } else if (domain === 'user_saved') {
        const targetId = `user.saved:${params.username}`;
        const user = this.db.getUser(params.username);
        const posts = this.db.getPostsByTarget({
          targetId,
          ...ssb,
          limit,
          offset
        });
        const items = posts.map<PageElements.Card<'Post'>>((post) =>
          this.#createPostCard(post, true, true, true)
        );
        const total = this.db.getPostCountByTarget(ssb.search, targetId) ?? -1;
        postList = {
          user: user || undefined,
          posts: items,
          total
        } as PostPageList;
        banner = user ? this.getUserBanner(user) : null;
        // Use global search context for saved listings
        searchContext = {
          target: 'all'
        };
      } else {
        // All
        postList = this.getPostList({
          ...ssb,
          limit,
          offset
        });
        banner = null;
        searchContext = {
          target: 'all'
        };
      }

      const { posts, total } = postList;

      const pageNav = total > 0 ? this.getPageNav(req, total, limit) : null;

      let sortOptions: PageElements.SortOptions | undefined = undefined;
      if (total > 1) {
        sortOptions = [
          {
            text: 'Latest',
            url: this.modifyRequestURL(req, { p: null, s: 'latest' }),
            isCurrent: ssb.sortBy === 'latest'
          },
          {
            text: 'Oldest',
            url: this.modifyRequestURL(req, { p: null, s: 'oldest' }),
            isCurrent: ssb.sortBy === 'oldest'
          },
          {
            text: 'Top',
            url: this.modifyRequestURL(req, { p: null, s: 'top' }),
            isCurrent: ssb.sortBy === 'top'
          }
        ];
        if (ssb.search) {
          sortOptions.unshift({
            text: 'Best match',
            url: this.modifyRequestURL(req, { p: null, s: 'best_match' }),
            isCurrent: ssb.sortBy === 'best_match'
          });
        }
      }

      return {
        title: 'Posts',
        banner,
        posts,
        nav: pageNav,
        showingText: this.getShowingText(limit, offset, total, 'post', 'posts'),
        sortOptions,
        searchContext
      };
    }

    protected getPostList(params: PostPageGetListParams): PostPageList {
      const { subredditName, author, search, sortBy, limit, offset } = params;
      const subreddit =
        subredditName ? this.db.getSubredditByName(subredditName) : null;
      const user = author ? this.db.getUser(author) : null;
      if (subredditName && !subreddit) {
        throw Error(`Subreddit info for "${subredditName}" not found in DB`);
      }
      if (author && !user) {
        throw Error(`User info for "${author}" not found in DB`);
      }
      const posts = this.db.getPosts({
        subredditId: subreddit?.id,
        author,
        search,
        sortBy,
        limit,
        offset
      } as DBGetPostsParams);
      let total: number;
      try {
        total = this.db.getPostCount(search, author, subreddit?.id) ?? -1;
        if (total < 0) {
          this.log(
            'warn',
            `Failed to get post count (${JSON.stringify({ search, author, subredditId: subreddit?.id }, null, 2)})"`
          );
        }
      } catch (error) {
        this.log(
          'error',
          `Failed to get post count (${JSON.stringify({ search, author, subredditId: subreddit?.id }, null, 2)})"`,
          error
        );
        total = -1;
      }
      const showAuthor = !author;
      const showSubreddit = !subreddit;
      const items = posts.map<PageElements.Card<'Post'>>((post) =>
        this.#createPostCard(post, showAuthor, showSubreddit, true)
      );
      return {
        subreddit,
        user,
        posts: items,
        total
      } as PostPageList;
    }

    handlePostsContainingMediaPageRequest(
      mediaId: number,
      req: Request,
      res: Response
    ) {
      const posts = this.db.getPostsContainingMedia(mediaId);
      const { showSubreddit = 'true', showAuthor = 'true' } = req.query;
      res.json({
        posts: posts.map<PageElements.Card<'Post'>>((post) =>
          this.#createPostCard(
            post,
            showAuthor === 'true',
            showSubreddit === 'true',
            false
          )
        ),
        searchContext: {
          target: 'all'
        }
      } satisfies PostsContainingMediaPage);
    }

    #createPostCard(
      post: Post<PostType>,
      includeAuthor: boolean,
      includeSubreddit: boolean,
      useShowMore: boolean
    ): PageElements.Card<'Post'> {
      const title = {
        text: post.title,
        url: this.getPostURL(post)
      };
      const author =
        includeAuthor ?
          {
            icon: this.getUserIconURL(post.author) || undefined,
            text:
              post.author.username !== DELETED_USER.username ?
                `u/${post.author.username}`
              : post.author.username,
            url: this.getUserOverviewURL(post.author)
          }
        : undefined;
      const subreddit =
        includeSubreddit ?
          {
            icon: this.getSubredditIconURL(post.subreddit) || undefined,
            text: `r/${post.subreddit.name}`,
            url: this.getSubredditOverviewURL(post.subreddit)
          }
        : undefined;
      const created =
        post.createdUTC >= 0 ?
          utcSecondsToDate(post.createdUTC).toLocaleString()
        : '';
      const { count: embeddedContentMediaInsertCount, html: contentHTML } =
        this.#insertEmbeddedContentMedia(post);
      const hasEmbeddedContentMedia = embeddedContentMediaInsertCount > 0;
      const content = sanitizeHTML(contentHTML);
      const media: PageElements.MediaGalleryItem[] = [];
      let embedHTML: string | undefined = undefined;
      switch (post.type) {
        case PostType.IMAGE: {
          const _post = post as Post<PostType.IMAGE>;
          if (_post.media?.image) {
            const src = this.getMediaURL(
              'image',
              _post.media.image.downloaded?.path
            );
            const thumbnail =
              src ?
                this.getMediaURL(
                  'image',
                  _post.media.thumbnail?.downloaded?.path
                ) || src
              : null;
            media.push({
              type: 'image',
              src,
              thumbnail,
              title: post.title,
              mediaId: `${post.id}_0`
            });
          }
          break;
        }
        case PostType.GALLERY: {
          const _post = post as Post<PostType.GALLERY>;
          _post.media?.forEach((_media, index) => {
            if (_media?.image) {
              const src = this.getMediaURL(
                'image',
                _media.image.downloaded?.path
              );
              const thumbnail =
                src ?
                  this.getMediaURL(
                    'image',
                    _media.thumbnail?.downloaded?.path
                  ) || src
                : null;
              media.push({
                type: 'image',
                src,
                thumbnail,
                title: post.title,
                mediaId: `${post.id}_${index}`
              });
            }
          });
          break;
        }
        case PostType.HOSTED_VIDEO: {
          const _post = post as Post<PostType.HOSTED_VIDEO>;
          if (_post.media?.src) {
            const src = this.getMediaURL(
              'video',
              _post.media.src.downloaded?.path
            );
            const thumbnail =
              src ?
                this.getMediaURL(
                  'image',
                  _post.media.thumbnail?.downloaded?.path
                ) || this.getStaticImageURL('video.png')
              : null;
            media.push({
              type: 'video',
              src,
              thumbnail,
              title: post.title,
              mediaId: `${post.id}_0`
            });
          }
          break;
        }
        case PostType.RICH_VIDEO: {
          const _post = post as Post<PostType.RICH_VIDEO>;
          if (_post.media?.content) {
            const src = this.getMediaURL(
              'video',
              _post.media.content.downloaded?.path
            );
            const thumbnail =
              src ?
                this.getMediaURL(
                  'image',
                  _post.media.thumbnail?.downloaded?.path
                ) || this.getStaticImageURL('video.png')
              : null;
            media.push({
              type: 'video',
              src,
              thumbnail,
              title: post.title,
              mediaId: `${post.id}_0`
            });
            if (!src) {
              embedHTML = _post.media.content.embedHTML;
            }
          }
          break;
        }
        default:
      }

      const subtitleParts: PageElements.TextRunGroup[] = [];
      if (author) {
        subtitleParts.push({
          runs: [author]
        });
      }
      if (created) {
        subtitleParts.push({
          runs: [{ text: created }]
        });
      }
      subtitleParts.push({
        runs: [
          {
            class: 'external-link',
            text: 'exit_to_app',
            url: this.getRedditURL(post) || undefined,
            isExternalURL: true
          }
        ]
      });

      const postBody: PageElements.CardBodyContent.Post = {
        postId: post.id,
        text: content,
        hasEmbeddedContentMedia,
        gallery:
          media.length > 0 ?
            {
              id: post.id,
              items: media
            }
          : undefined,
        embedHTML,
        useShowMore
      };

      const footer: PageElements.Card<any>['footer'] = [
        {
          runs: [
            {
              class: 'score',
              text: 'thumbs_up_down'
            },
            {
              text: String(post.upvotes - post.downvotes)
            }
          ]
        }
      ];
      if (post.commentCount.all > 0) {
        footer.push({
          runs: [
            {
              class: 'comments',
              text: 'mode_comment'
            },
            {
              text: String(post.commentCount.all),
              url: this.getPostURL(post)
            }
          ]
        });
      }

      const item: PageElements.Card<'Post'> = {
        id: `post-${post.id}`,
        type: 'Post',
        class: 'post',
        kicker:
          subreddit ?
            [
              {
                runs: [subreddit]
              }
            ]
          : undefined,
        title: [
          {
            runs: [title]
          }
        ],
        subtitle: subtitleParts,
        body: {
          content: postBody
        },
        footer
      };

      if (post.type === PostType.CROSS_POST) {
        const _post = post as Post<PostType.CROSS_POST>;
        if (_post.crossPost) {
          postBody.nestedPost = this.#createPostCard(
            _post.crossPost,
            true,
            true,
            useShowMore
          );
        }
      }

      return item;
    }

    #insertEmbeddedContentMedia(post: Post<PostType>) {
      const embedded = post.content.embeddedMedia;
      if (!embedded) {
        return {
          count: 0,
          html: post.content.html
        };
      }
      let insertedCount = 0;
      const $ = cheerioLoad(post.content.html);
      $('a').each((_i, _el) => {
        const el = $(_el);
        const href = el.attr('href');
        if (href) {
          const url = validateURL(href, SITE_URL);
          if (url) {
            const id = path.parse(url).name;
            const m = embedded.find((e) => e.id === id);
            if (m?.image.downloaded?.path) {
              const mediaURL = this.getMediaURL(
                'image',
                m.image.downloaded.path
              );
              const caption = el.text();
              const imgEl = $('<img>').attr('src', mediaURL);
              if (caption) {
                imgEl.attr('alt', caption);
              }
              const aEl = $('<a>')
                .attr('href', mediaURL)
                .attr('class', 'embedded-content-media')
                .append(imgEl);
              const wrapperEl = $('<div>')
                .attr('class', 'embedded-content-media-wrapper')
                .append(aEl);
              if (caption) {
                wrapperEl.append(
                  $('<span>').attr('class', 'caption').append(caption)
                );
              }
              el.replaceWith(wrapperEl);
              insertedCount++;
            }
          }
        }
      });
      return {
        count: insertedCount,
        html: insertedCount > 0 ? $.html() : post.content.html
      };
    }
  };
}
