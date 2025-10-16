import { load as cheerioLoad } from 'cheerio';
import { type PageElements } from '../../../web/types/PageElements';
import {
  type Post,
  type PostBasicInfo,
  type PostComment,
  PostType
} from '../../entities/Post';
import { DELETED_USER, SITE_URL } from '../../utils/Constants';
import { sanitizeHTML, utcSecondsToDate } from '../../utils/Misc';
import { validateURL } from '../../utils/URL';
import path from 'path';
import { BrowseURLs } from './BrowseURLs';

export interface CreatePostCommentCardParams {
  post: Post<PostType> | PostBasicInfo | null;
  comment: PostComment;
  isReply?: boolean;
  isSearchResult?: boolean;
  sortBy?: 'latest' | 'oldest' | 'top';
  wrapped?: boolean;
}

export class CardBuilder {
  static createPostCard(
    post: Post<PostType>,
    includeAuthor: boolean,
    includeSubreddit: boolean,
    useShowMore: boolean
  ): PageElements.Card<'Post'> {
    const title = {
      text: post.title,
      url: BrowseURLs.getPostURL(post)
    };
    const author =
      includeAuthor ?
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
          const src = BrowseURLs.getMediaURL(
            'image',
            _post.media.image.downloaded?.path
          );
          const thumbnail =
            src ?
              BrowseURLs.getMediaURL(
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
            const src = BrowseURLs.getMediaURL(
              'image',
              _media.image.downloaded?.path
            );
            const thumbnail =
              src ?
                BrowseURLs.getMediaURL(
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
          const src = BrowseURLs.getMediaURL(
            'video',
            _post.media.src.downloaded?.path
          );
          const thumbnail =
            src ?
              BrowseURLs.getMediaURL(
                'image',
                _post.media.thumbnail?.downloaded?.path
              ) || BrowseURLs.getStaticImageURL('video.png')
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
          const src = BrowseURLs.getMediaURL(
            'video',
            _post.media.content.downloaded?.path
          );
          const thumbnail =
            src ?
              BrowseURLs.getMediaURL(
                'image',
                _post.media.thumbnail?.downloaded?.path
              ) || BrowseURLs.getStaticImageURL('video.png')
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
          url: BrowseURLs.getRedditURL(post) || undefined,
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
            url: BrowseURLs.getPostURL(post)
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
        postBody.nestedPost = this.createPostCard(
          _post.crossPost,
          true,
          true,
          useShowMore
        );
      }
    }

    return item;
  }

  static #insertEmbeddedContentMedia(post: Post<PostType>) {
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
            const mediaURL = BrowseURLs.getMediaURL(
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

  static createPostCommentCard(
    params: CreatePostCommentCardParams & { wrapped?: false }
  ): PageElements.Card<'PostComment'>;
  static createPostCommentCard(
    params: CreatePostCommentCardParams & { wrapped: true }
  ): PageElements.Card<'WrappedPostComment'>;
  static createPostCommentCard(
    params: CreatePostCommentCardParams
  ):
    | PageElements.Card<'PostComment'>
    | PageElements.Card<'WrappedPostComment'> {
    if (params.wrapped && params.post) {
      const { comment, post } = params;
      return {
        id: `post-comment-${comment.id}`,
        type: 'WrappedPostComment',
        class: 'search-post-comment-result',
        kicker: [
          {
            runs: [
              {
                icon:
                  BrowseURLs.getSubredditIconURL(post.subreddit) || undefined,
                text: `r/${post.subreddit.name}`,
                url: BrowseURLs.getSubredditOverviewURL(post.subreddit)
              }
            ]
          }
        ],
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
        body: {
          content: CardBuilder.createPostCommentCard({
            ...params,
            wrapped: false
          })
        }
      };
    }
    const {
      post,
      comment,
      isReply = false,
      isSearchResult = false,
      sortBy
    } = params;
    const isOP =
      comment.author !== DELETED_USER.username &&
      post &&
      comment.author === post.author.username;
    const author = {
      class: isOP ? 'op' : undefined,
      text:
        comment.author !== DELETED_USER.username ?
          `u/${comment.author}`
        : comment.author
    };
    const created =
      comment.createdUTC >= 0 ?
        utcSecondsToDate(comment.createdUTC).toLocaleString()
      : '';
    const subtitleParts: PageElements.TextRunGroup[] = [
      { runs: [author] },
      { runs: [{ text: created }] },
      {
        runs: [
          {
            class: 'score',
            text: 'thumbs_up_down'
          },
          {
            text: String(comment.upvotes - comment.downvotes)
          }
        ]
      },
      {
        runs: [
          {
            class: 'external-link',
            text: 'exit_to_app',
            url: BrowseURLs.getRedditURL(comment) || undefined,
            isExternalURL: true
          }
        ]
      }
    ];
    const replies = comment.replies.map((reply) =>
      this.createPostCommentCard({
        post,
        comment: reply,
        isReply: true,
        isSearchResult,
        sortBy
      })
    );
    let nextReplies: string | null = null;
    if (
      !isSearchResult &&
      comment.replyCount > 0 &&
      replies.length < comment.replyCount
    ) {
      nextReplies =
        post &&
        BrowseURLs.getPostCommentsURL({
          postId: post.id,
          parentId: comment.id,
          sortBy,
          offset: replies.length
        });
    }
    const item: PageElements.Card<'PostComment'> = {
      id: `post-comment-${comment.id}`,
      type: 'PostComment',
      class: `post-comment ${isReply ? 'reply' : ''} ${isSearchResult ? 'search-result' : ''}`,
      subtitle: subtitleParts,
      body: {
        content: {
          commentId: comment.id,
          text: sanitizeHTML(comment.content.html),
          replies: {
            comments: replies,
            next: nextReplies
          }
        }
      }
    };

    return item;
  }
}
