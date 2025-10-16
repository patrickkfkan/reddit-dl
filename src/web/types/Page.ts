import { type ResolvedTarget } from '../../lib/entities/Target';
import { type SavedItemPageList } from '../../lib/server/handler/SavedItem';
import { type PageElements } from './PageElements';

export type SearchContext =
  | {
      target: 'by_user';
      username: string;
    }
  | {
      target: 'in_subreddit';
      subredditName: string;
    }
  | {
      target: 'all';
    };

export interface PageBase {
  title?: string;
  banner?: PageElements.Banner | null;
  nav?: PageElements.Nav | null;
  showingText?: string;
  sortOptions?: PageElements.SortOptions;
  searchContext: SearchContext;
}

export interface MediaListPage extends PageBase {
  gallery: PageElements.MediaGallery;
}

export interface OverviewPage extends PageBase {
  recentPosts: {
    items: PageElements.Card<'Post'>[];
    total: number;
    viewAllURL: string;
  };
  recentMedia: {
    gallery: PageElements.MediaGallery;
    total: number;
    viewAllURL: string;
  };
  recentSavedItems?: {
    items: SavedItemPageList['items'];
    total: number;
    viewAllURL: string;
  };
}

export interface PostListPage extends PageBase {
  posts: PageElements.Card<'Post'>[];
}

export interface PostPage extends PageBase {
  post: PageElements.Card<'Post'>;
  commentsURL: string | null;
}

export interface PostsContainingMediaPage extends PageBase {
  posts: PageElements.Card<'Post'>[];
}

export interface SubredditListPage extends PageBase {
  subreddits: PageElements.Card<'String'>[];
}

export interface TargetListPage extends PageBase {
  targets: PageElements.Card<'String'>[];
}

export interface UserListPage extends PageBase {
  users: PageElements.Card<'String'>[];
}

export interface SavedItemListPage extends PageBase {
  items: (
    | PageElements.Card<'Post'>
    | PageElements.Card<'WrappedPostComment'>
  )[];
}

export interface PostCommentsSection {
  comments: PageElements.Card<'PostComment'>[];
  next: string | null;
  sortOptions?: PageElements.SortOptions;
}

export type TargetResultsTab = {
  name: ResolvedTarget['type'] | 'all';
  title: string;
  url: string;
} & (
  | {
      isCurrent: true;
      page: TargetListPage;
    }
  | {
      isCurrent: false;
      page?: undefined;
    }
);

export interface TargetResultsPage extends PageBase {
  tabs: TargetResultsTab[];
}

export interface SearchPostCommentResultsPage extends PageBase {
  comments: PageElements.Card<'WrappedPostComment'>[];
}

export type SearchResultsTab = {
  name: 'posts' | 'subreddits' | 'users' | 'post_comments' | 'saved_items';
  title: string;
  url: string;
} & (
  | {
      name: 'posts';
      isCurrent: true;
      page: PostListPage;
    }
  | {
      name: 'subreddits';
      isCurrent: true;
      page: SubredditListPage;
    }
  | {
      name: 'users';
      isCurrent: true;
      page: UserListPage;
    }
  | {
      name: 'post_comments';
      isCurrent: true;
      page: SearchPostCommentResultsPage;
    }
  | {
      name: 'saved_items';
      isCurrent: true;
      page: SavedItemListPage;
    }
  | {
      isCurrent: false;
    }
);

export interface SearchResultsPage extends PageBase {
  tabs: SearchResultsTab[];
}

export type Page =
  | MediaListPage
  | OverviewPage
  | PostListPage
  | PostPage
  | PostsContainingMediaPage
  | SubredditListPage
  | TargetResultsPage
  | TargetListPage
  | UserListPage
  | SearchPostCommentResultsPage
  | SearchResultsPage
  | SavedItemListPage;
