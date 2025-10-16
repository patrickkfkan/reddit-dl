import { useCallback } from 'react';
import { OverviewPage } from '../types/Page';
import { Stack } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { NavLink, useParams } from 'react-router';
import MediaGallery from '../components/MediaGallery';

function OverviewPage() {
  const params = useParams();

  const renderContent = useCallback((page: OverviewPage) => {
    return (
      <>
        {page.recentPosts.items.length > 0 ?
          <>
            <div className="mb-5">
              <div className="d-flex mb-2 align-items-baseline">
                <div className="flex-fill">
                  <h4 className="m-0">Recent posts</h4>
                </div>
                <Stack direction="horizontal" gap={1}>
                  <span>Total: {page.recentPosts.total}</span>
                  <span>&#124;</span>
                  <NavLink to={page.recentPosts.viewAllURL}>View all</NavLink>
                </Stack>
              </div>
              <Stack gap={3}>
                {page.recentPosts.items.map((post) => (
                  <ContentCard key={`content-card-${post.id}`} data={post} />
                ))}
              </Stack>
            </div>
          </>
        : null}
        {page.recentMedia.gallery.items.length > 0 ?
          <>
            <div className="mb-5">
              <div className="d-flex mb-2 align-items-baseline">
                <div className="flex-fill">
                  <h4 className="m-0">Recent media</h4>
                </div>
                <Stack direction="horizontal" gap={1}>
                  <span>Total: {page.recentMedia.total}</span>
                  <span>&#124;</span>
                  <NavLink to={page.recentMedia.viewAllURL}>View all</NavLink>
                </Stack>
              </div>
              {<MediaGallery data={page.recentMedia.gallery} />}
            </div>
          </>
        : null}
        {page.recentSavedItems && page.recentSavedItems.items.length > 0 ?
          <>
            <div className="mb-5">
              <div className="d-flex mb-2 align-items-baseline">
                <div className="flex-fill">
                  <h4 className="m-0">Recent saves</h4>
                </div>
                <Stack direction="horizontal" gap={1}>
                  <span>Total: {page.recentSavedItems.total}</span>
                  <span>&#124;</span>
                  <NavLink to={page.recentSavedItems.viewAllURL}>
                    View all
                  </NavLink>
                </Stack>
              </div>
              <Stack gap={3}>
                {page.recentSavedItems.items.map((item) => (
                  <ContentCard
                    key={`content-card-${item.type}-${item.id}`}
                    data={item}
                  />
                ))}
              </Stack>
            </div>
          </>
        : null}
      </>
    );
  }, []);

  let fetchPageURL: string;
  if (params.subredditName) {
    fetchPageURL = `/api/r/${params.subredditName}/overview`;
  } else if (params.username) {
    fetchPageURL = `/api/u/${params.username}/overview`;
  } else {
    return null;
  }

  return (
    <RenderedPage fetchPageURL={fetchPageURL} renderContent={renderContent} />
  );
}

export default OverviewPage;
