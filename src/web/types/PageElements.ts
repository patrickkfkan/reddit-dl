import { type PostCommentsSection } from './Page';

export namespace PageElements {
  export type TextRunGroup = {
    class?: string;
    runs: TextRun[];
  };

  export interface TextRun {
    class?: string;
    icon?: string;
    text: string;
    url?: string;
    isExternalURL?: boolean;
  }

  export interface Banner {
    icon: string | null;
    title: {
      text: string;
      url: string | null;
    };
    externalURL: string | null;
    caption: string;
    shortDescription: string;
    description: string;
  }

  export type CardType =
    | 'String'
    | 'Post'
    | 'PostComment'
    | 'MediaItemTooltip'
    | 'WrappedPostComment';

  export type CardBodyContent<T extends CardType> =
    T extends 'String' ? CardBodyContent.String
    : T extends 'Post' ? CardBodyContent.Post
    : T extends 'PostComment' ? CardBodyContent.PostComment
    : T extends 'MediaItemTooltip' ? CardBodyContent.MediaItemtooltip
    : T extends 'WrappedPostComment' ? CardBodyContent.WrappedPostComment
    : never;

  export interface Card<T extends CardType> {
    id: string;
    type: T;
    class?: string;
    kicker?: TextRunGroup[];
    title?: TextRunGroup[];
    subtitle?: TextRunGroup[];
    body?: {
      class?: string;
      content: CardBodyContent<T>;
    };
    footer?: TextRunGroup[];
  }

  export type AnyCard =
    | Card<'String'>
    | Card<'Post'>
    | Card<'PostComment'>
    | Card<'MediaItemTooltip'>
    | Card<'WrappedPostComment'>;

  export interface MediaGallery {
    class?: string;
    id: string;
    items: MediaGalleryItem[];
  }

  export namespace CardBodyContent {
    export type String = string;

    export interface MediaItemtooltip {
      moreContainingPosts: number;
      containingPostsURL: string;
    }

    export interface Post {
      postId: string;
      text: string;
      hasEmbeddedContentMedia: boolean;
      useShowMore: boolean;
      gallery?: PageElements.MediaGallery;
      embedHTML?: string;
      nestedPost?: PageElements.Card<'Post'>;
    }

    export interface PostComment {
      commentId: string;
      text: string;
      replies?: PostCommentsSection;
    }

    export type WrappedPostComment = PageElements.Card<'PostComment'>;
  }

  export interface MediaGalleryItem {
    mediaId: string;
    type: 'image' | 'video';
    src: string | null;
    thumbnail: string | null;
    title: string;
    class?: string;
    tooltip?: PageElements.Card<'MediaItemTooltip'>;
  }

  export type SortOptions = {
    text: string;
    url: string;
    isCurrent: boolean;
  }[];

  export interface NavLink {
    pageNumber: number;
    url: string;
    isCurrent: boolean;
  }

  export interface Nav {
    // Sections should be rendered with "..." in-between
    sections: Array<NavLink[]>;
    previous: string | null;
    next: string | null;
    totalPages: number;
  }
}
