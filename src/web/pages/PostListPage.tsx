import { useCallback } from 'react';
import { PostListPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useLocation, useParams } from 'react-router';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';

interface PostListPageProps extends ContainerProps {
  page?: PostListPage;
}

function PostListPage({ page, ...containerProps }: PostListPageProps) {
  const params = useParams();
  const location = useLocation();
  const { settings } = useBrowseSettings();

  const renderContent = useCallback((page: PostListPage) => {
    return (
      <Stack gap={3}>
        {page.posts.map((post) => (
          <ContentCard key={`content-card-${post.id}`} data={post} />
        ))}
      </Stack>
    );
  }, []);

  if (page) {
    return (
      <RenderedPage
        page={page}
        renderContent={renderContent}
        {...containerProps}
      />
    );
  }

  let fetchPageURL: string;
  if (params.subredditName) {
    fetchPageURL = `/api/r/${params.subredditName}/posts`;
  } else if (params.username) {
    const isSaved = location.pathname.endsWith('/saved');
    fetchPageURL = `/api/u/${params.username}/${isSaved ? 'saved' : 'submitted'}`;
  } else {
    fetchPageURL = '/api/posts/page';
  }

  return (
    <RenderedPage
      fetchPageURL={fetchPageURL}
      searchParams={{
        n: settings.listItemsPerPage
      }}
      renderContent={renderContent}
      {...containerProps}
    />
  );
}

export default PostListPage;
