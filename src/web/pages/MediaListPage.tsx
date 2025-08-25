import { useCallback } from 'react';
import { MediaListPage } from '../types/Page';
import RenderedPage from '../components/RenderedPage';
import MediaGallery from '../components/MediaGallery';
import { useParams } from 'react-router';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';

function MediaListPage() {
  const params = useParams();
  const { settings } = useBrowseSettings();

  const renderContent = useCallback((page: MediaListPage) => {
    return <MediaGallery data={page.gallery} spacing={1} />;
  }, []);

  let fetchPageURL: string;
  if (params.subredditName) {
    fetchPageURL = `/api/r/${params.subredditName}/media`;
  } else if (params.username) {
    fetchPageURL = `/api/u/${params.username}/media`;
  } else {
    fetchPageURL = '/api/media/page';
  }

  return (
    <RenderedPage
      fetchPageURL={fetchPageURL}
      searchParams={{
        n: settings.galleryItemsPerPage
      }}
      renderContent={renderContent}
    />
  );
}

export default MediaListPage;
