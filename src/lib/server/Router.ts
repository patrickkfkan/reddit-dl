import express, { type Router } from 'express';
import { type WebRequestHandlerInstance } from './handler';
import path from 'path';

class WebRequestRouter {
  #handler: WebRequestHandlerInstance;
  #router: Router;

  constructor(handler: WebRequestHandlerInstance) {
    this.#handler = handler;
    this.#router = express.Router();
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.#router.get('/api/targets/page', (req, res) =>
      this.#handler.handleTargetPageRequest(req, res)
    );

    this.#router.get('/api/subreddits/page', (req, res) =>
      this.#handler.handleSubredditPageRequest(req, res)
    );

    this.#router.get('/api/users/page', (req, res) =>
      this.#handler.handleUserPageRequest(req, res)
    );

    this.#router.get('/api/posts/page', (req, res) =>
      this.#handler.handlePostPageRequest({
        domain: 'all',
        req,
        res
      })
    );

    this.#router.get('/api/media/page', (req, res) =>
      this.#handler.handleMediaPageRequest({
        domain: 'all',
        req,
        res
      })
    );

    this.#router.get('/api/search/page', (req, res) =>
      this.#handler.handleSearchPageRequest({
        req,
        res
      })
    );

    this.#router.get('/api/r/:subredditName/:view', (req, res) => {
      const view = req.params.view;
      if (
        view !== 'posts' &&
        view !== 'media' &&
        view !== 'overview' &&
        view !== 'search'
      ) {
        throw Error(`Unknown value "${view}" for param "view"`);
      }
      switch (view) {
        case 'overview':
          return this.#handler.handleOverviewPageRequest(
            'subreddit',
            req.params.subredditName,
            res
          );
        case 'posts':
          return this.#handler.handlePostPageRequest({
            domain: 'subreddit',
            subredditName: req.params.subredditName,
            req,
            res
          });
        case 'media':
          return this.#handler.handleMediaPageRequest({
            domain: 'subreddit',
            subredditName: req.params.subredditName,
            req,
            res
          });
        case 'search':
          return this.#handler.handleSearchPageRequest({
            subredditName: req.params.subredditName,
            req,
            res
          });
      }
    });

    this.#router.get('/api/u/:username/:view', (req, res) => {
      const view = req.params.view;
      if (
        view !== 'submitted' &&
        view !== 'media' &&
        view !== 'overview' &&
        view !== 'search' &&
        view !== 'saved'
      ) {
        throw Error(`Unknown value "${view}" for param "view"`);
      }
      switch (view) {
        case 'overview':
          return this.#handler.handleOverviewPageRequest(
            'user',
            req.params.username,
            res
          );
        case 'submitted':
          return this.#handler.handlePostPageRequest({
            domain: 'user',
            username: req.params.username,
            req,
            res
          });
        case 'media':
          return this.#handler.handleMediaPageRequest({
            domain: 'user',
            username: req.params.username,
            req,
            res
          });
        case 'search':
          return this.#handler.handleSearchPageRequest({
            username: req.params.username,
            req,
            res
          });
        case 'saved':
          return this.#handler.handleSavedItemPageRequest({
            username: req.params.username,
            req,
            res
          });
      }
    });

    this.#router.get('/api/post/:postId', (req, res) =>
      this.#handler.handlePostPageRequest({
        domain: 'post',
        postId: req.params.postId,
        req,
        res
      })
    );

    this.#router.get('/api/post_comments', (req, res) =>
      this.#handler.handlePostCommentsSectionRequest(req, res)
    );

    this.#router.get('/api/post_comment_replies', (req, res) =>
      this.#handler.handlePostCommentRepliesRequest(req, res)
    );

    this.#router.get('/api/media/:mediaId/containing_posts', (req, res) => {
      const mediaId = Number(req.params.mediaId);
      if (isNaN(mediaId)) {
        throw new TypeError('Invalid media Id');
      }
      return this.#handler.handlePostsContainingMediaPageRequest(
        mediaId,
        req,
        res
      );
    });

    this.#router.get('/api/settings/browse/options', (req, res) =>
      this.#handler.handleBrowseSettingOptionsRequest(req, res)
    );

    this.#router.get('/api/settings/browse', (req, res) =>
      this.#handler.handleGetBrowseSettingsRequest(req, res)
    );

    this.#router.post('/api/settings/browse', (req, res) =>
      this.#handler.handleSaveBrowseSettingsRequest(req, res)
    );

    this.#router.get('/api/about', (req, res) =>
      this.#handler.handleAboutRequest(req, res)
    );

    this.#router.get('/image', (req, res) =>
      this.#handler.handleMediaRequest('image', req, res)
    );

    this.#router.get('/video', (req, res) =>
      this.#handler.handleMediaRequest('video', req, res)
    );

    this.#router.get(/(.*)/, (_req, res) => {
      res.sendFile(path.resolve(__dirname, '../../web/index.html'), {
        dotfiles: 'allow'
      });
    });
  }

  get router() {
    return this.#router;
  }
}

export function getWebRequestRouter(handler: WebRequestHandlerInstance) {
  return new WebRequestRouter(handler).router;
}
