import { useCallback } from 'react';
import { SubredditListPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';
import { useParams } from 'react-router';

interface SubredditListPageProps extends ContainerProps {
  page?: SubredditListPage;
}

function SubredditListPage({
  page,
  ...containerProps
}: SubredditListPageProps) {
  const params = useParams();
  const { settings } = useBrowseSettings();

  const renderContent = useCallback((page: SubredditListPage) => {
    return (
      <Stack gap={3}>
        {page.subreddits.map((subreddit) => (
          <ContentCard key={`content-card-${subreddit.id}`} data={subreddit} />
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
  if (params.joinedBy) {
    fetchPageURL = `/api/u/${params.joinedBy}/joined`;
  } else {
    fetchPageURL = `/api/subreddits/page`;
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

export default SubredditListPage;
