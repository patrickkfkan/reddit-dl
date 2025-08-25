import { useCallback } from 'react';
import { useGlobalModals } from '../contexts/GlobalModalsProvider';
import { type PageElements } from '../types/PageElements';

interface MediaItemTooltipCardBodyProps {
  data: PageElements.CardBodyContent.MediaItemtooltip;
}

function MediaItemTooltipCardBody({ data }: MediaItemTooltipCardBodyProps) {
  const { showPostsContainingMediaModal } = useGlobalModals();

  const handleMoreClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const url = e.currentTarget.dataset.url;
      if (url) {
        showPostsContainingMediaModal(url);
      }
    },
    [showPostsContainingMediaModal]
  );

  if (data.moreContainingPosts > 0) {
    return (
      <div className="more">
        ...also appears in{' '}
        <a
          href="#"
          className="show-containing-posts"
          data-url={data.containingPostsURL}
          onClick={handleMoreClick}
        >
          {data.moreContainingPosts} other{' '}
          {data.moreContainingPosts === 1 ? 'post' : 'posts'}
        </a>
      </div>
    );
  }
}

export default MediaItemTooltipCardBody;
