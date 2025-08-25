import { useCallback } from 'react';
import { SearchPostCommentResultsPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';

interface SearchPostCommentResultsPageProps extends ContainerProps {
  page: SearchPostCommentResultsPage;
}

function SearchPostCommentResultsPage({
  page,
  ...containerProps
}: SearchPostCommentResultsPageProps) {
  const renderContent = useCallback((page: SearchPostCommentResultsPage) => {
    return (
      <Stack gap={3}>
        {page.comments.map((comment) => (
          <ContentCard key={`content-card-${comment.id}`} data={comment} />
        ))}
      </Stack>
    );
  }, []);

  return (
    <RenderedPage
      page={page}
      renderContent={renderContent}
      {...containerProps}
    />
  );
}

export default SearchPostCommentResultsPage;
