import { useCallback } from 'react';
import { UserListPage } from '../types/Page';
import { type ContainerProps, Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';

interface UserListPageProps extends ContainerProps {
  page?: UserListPage;
}

function UserListPage({ page, ...containerProps }: UserListPageProps) {
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

  return (
    <RenderedPage
      fetchPageURL="/api/users/page"
      searchParams={{
        n: settings.listItemsPerPage
      }}
      renderContent={renderContent}
      {...containerProps}
    />
  );
}

export default UserListPage;
