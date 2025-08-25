import { useCallback } from 'react';
import { SubredditListPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';

interface SubredditListPageProps extends ContainerProps {
  page?: SubredditListPage;
}

function SubredditListPage({
  page,
  ...containerProps
}: SubredditListPageProps) {
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

  return (
    <RenderedPage
      fetchPageURL="/api/subreddits/page"
      searchParams={{
        n: settings.listItemsPerPage
      }}
      renderContent={renderContent}
      {...containerProps}
    />
  );
}

export default SubredditListPage;
