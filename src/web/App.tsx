import 'material-icons/iconfont/material-icons.css';
import 'material-icons/iconfont/outlined.css';
import './assets/styles/App.scss';
import { Routes, Route, useLocation } from 'react-router';
import UserListPage from './pages/UserListPage';
import SubredditListPage from './pages/SubredditListPage';
import PostListPage from './pages/PostListPage';
import OverviewPage from './pages/OverviewPage';
import PostPage from './pages/PostPage';
import MediaListPage from './pages/MediaListPage';
import { GlobalModalsProvider } from './contexts/GlobalModalsProvider';
import { BrowseSettingsProvider } from './contexts/BrowseSettingsProvider';
import Theme from './components/Theme';
import { useEffect, useState } from 'react';
import MainLayout from './pages/MainLayout';
import SearchResultsPage from './pages/SearchResultsPage';
import TargetResultsPage from './pages/TargetResultsPage';
import SavedItemListPage from './pages/SavedItemListPage';

function App() {
  const [themeInitialized, setThemeInitialized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location]);

  return (
    <BrowseSettingsProvider>
      <Theme onInit={() => setThemeInitialized(true)} />
      <GlobalModalsProvider>
        {themeInitialized && (
          <>
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<TargetResultsPage />} />
                <Route path="subreddits" element={<SubredditListPage />} />
                <Route path="users" element={<UserListPage />} />
                <Route path="posts" element={<PostListPage />} />
                <Route path="r/:subredditName" element={<OverviewPage />} />
                <Route path="u/:username" element={<OverviewPage />} />
                <Route
                  path="r/:subredditName/posts"
                  element={<PostListPage />}
                />
                <Route
                  path="u/:username/submitted"
                  element={<PostListPage />}
                />
                <Route
                  path="u/:username/saved"
                  element={<SavedItemListPage />}
                />
                <Route
                  path="u/:joinedBy/joined"
                  element={<SubredditListPage />}
                />
                <Route
                  path="u/:followedBy/following"
                  element={<UserListPage />}
                />
                <Route path="post/:postId" element={<PostPage />} />
                <Route path="media" element={<MediaListPage />} />
                <Route
                  path="r/:subredditName/media"
                  element={<MediaListPage />}
                />
                <Route path="u/:username/media" element={<MediaListPage />} />
                <Route
                  path="r/:subredditName/search"
                  element={<SearchResultsPage />}
                />
                <Route
                  path="u/:username/search"
                  element={<SearchResultsPage />}
                />
                <Route path="search" element={<SearchResultsPage />} />
              </Route>
            </Routes>
          </>
        )}
      </GlobalModalsProvider>
    </BrowseSettingsProvider>
  );
}

export default App;
