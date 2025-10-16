import { useCallback } from 'react';
import { SavedItemListPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useParams } from 'react-router';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';

interface SavedItemListPageProps extends ContainerProps {
  page?: SavedItemListPage;
}

function SavedItemListPage({
  page,
  ...containerProps
}: SavedItemListPageProps) {
  const params = useParams();
  const { settings } = useBrowseSettings();

  const renderContent = useCallback((page: SavedItemListPage) => {
    return (
      <Stack gap={3}>
        {page.items.map((item) => (
          <ContentCard
            key={`content-card-${item.type}-${item.id}`}
            data={item}
          />
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

  const fetchPageURL = `/api/u/${params.username}/saved`;

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

export default SavedItemListPage;
