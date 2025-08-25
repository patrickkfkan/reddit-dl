import { useCallback } from 'react';
import { TargetResultsPage } from '../types/Page';
import { Nav } from 'react-bootstrap';
import RenderedPage from '../components/RenderedPage';
import { useNavigate } from 'react-router';
import { useBrowseSettings } from '../contexts/BrowseSettingsProvider';
import TargetListPage from './TargetListPage';

function TargetResultsPage() {
  const { settings } = useBrowseSettings();
  const navigate = useNavigate();

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

  const renderContent = useCallback((page: TargetResultsPage) => {
    const currentTab = page.tabs.find((tab) => tab.isCurrent);
    const tabs =
      page.tabs.length > 1 ?
        <Nav variant="pills" className="mb-4">
          {page.tabs.map((tab) => (
            <Nav.Item key={`nav-tab-targets-${tab.name}`}>
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
      : null;
    return (
      <>
        {tabs}
        {currentTab && (
          <TargetListPage page={currentTab.page} className="px-0" />
        )}
      </>
    );
  }, []);

  return (
    <RenderedPage
      fetchPageURL="/api/targets/page"
      searchParams={{
        n: settings.listItemsPerPage
      }}
      renderContent={renderContent}
    />
  );
}

export default TargetResultsPage;
