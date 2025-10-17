import { useCallback } from 'react';
import { UserListPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';
import { useParams } from 'react-router';

interface UserListPageProps extends ContainerProps {
  page?: UserListPage;
}

function UserListPage({ page, ...containerProps }: UserListPageProps) {
  const params = useParams();
  const { settings } = useBrowseSettings();

  const renderContent = useCallback((page: UserListPage) => {
    return (
      <Stack gap={3}>
        {page.users.map((user) => (
          <ContentCard key={`content-card-${user.id}`} data={user} />
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
  if (params.followedBy) {
    fetchPageURL = `/api/u/${params.followedBy}/following`;
  } else {
    fetchPageURL = `/api/users/page`;
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

export default UserListPage;
