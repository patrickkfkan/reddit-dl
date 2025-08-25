import { Outlet } from 'react-router';
import Header from '../components/Header';
import { SearchProvider } from '../contexts/SearchProvider';
import { Stack } from 'react-bootstrap';
import SidebarTrigger from '../components/SidebarTrigger';

function MainLayout() {
  return (
    <SearchProvider>
      <Stack direction="horizontal" className="sticky-top bg-body">
        <Stack
          direction="horizontal"
          className="container p-0 w-auto d-lg-none py-2"
        >
          <SidebarTrigger />
        </Stack>
        <Header />
      </Stack>
      <Outlet />
    </SearchProvider>
  );
}

export default MainLayout;
