import { useCallback, useEffect, useState } from 'react';
import { SearchResultsPage } from '../types/Page';
import { Nav } from 'react-bootstrap';
import RenderedPage from '../components/RenderedPage';
import { useNavigate, useParams } from 'react-router';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';
import PostListPage from './PostListPage';
import SubredditListPage from './SubredditListPage';
import UserListPage from './UserListPage';
import SearchPostCommentResultsPage from './SearchPostCommentResultsPage';
import SavedItemListPage from './SavedItemListPage';

function SearchResultsPage() {
  const { settings } = useBrowseSettings();
  const navigate = useNavigate();
  const params = useParams();
  const [fetchPageURL, setFetchPageURL] = useState('');

  useEffect(() => {
    if (params.subredditName) {
      setFetchPageURL(`/api/r/${params.subredditName}/search`);
    } else if (params.username) {
      setFetchPageURL(`/api/u/${params.username}/search`);
    } else {
      setFetchPageURL('/api/search/page');
    }
  }, [params]);

  const handleTabChange = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (e.currentTarget.dataset.current === '1') {
        return;
      }
      const url = e.currentTarget.dataset.url as string;
      void navigate(url);
    },
    [navigate]
  );

  const renderContent = useCallback((page: SearchResultsPage) => {
    const currentTab = page.tabs.find((tab) => tab.isCurrent);
    return (
      <>
        <Nav variant="pills" className="mb-4">
          {page.tabs.map((tab) => (
            <Nav.Item key={`nav-tab-search-${tab.name}`}>
              <Nav.Link
                active={tab.isCurrent}
                href={tab.url}
                data-url={tab.url}
                data-current={tab.isCurrent ? '1' : '0'}
                onClick={handleTabChange}
              >
                {tab.title}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
        {currentTab && currentTab.name === 'posts' && (
          <PostListPage page={currentTab.page} className="px-0" />
        )}
        {currentTab && currentTab.name === 'subreddits' && (
          <SubredditListPage page={currentTab.page} className="px-0" />
        )}
        {currentTab && currentTab.name === 'users' && (
          <UserListPage page={currentTab.page} className="px-0" />
        )}
        {currentTab && currentTab.name === 'post_comments' && (
          <SearchPostCommentResultsPage
            page={currentTab.page}
            className="px-0"
          />
        )}
        {currentTab && currentTab.name === 'saved_items' && (
          <SavedItemListPage page={currentTab.page} className="px-0" />
        )}
      </>
    );
  }, []);

  if (!fetchPageURL) {
    return null;
  }

  return (
    <RenderedPage
      fetchPageURL={fetchPageURL}
      searchParams={{
        n: settings.listItemsPerPage
      }}
      renderContent={renderContent}
    />
  );
}

export default SearchResultsPage;
