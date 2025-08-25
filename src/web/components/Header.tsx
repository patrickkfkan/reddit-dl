import { useCallback, useEffect, useState } from 'react';
import GithubIcon from '../assets/images/brands-github.svg?react';
import '../assets/styles/Header.scss';
import { Container, Stack } from 'react-bootstrap';
import { useGlobalModals } from '../contexts/GlobalModalsProvider';
import { NavLink } from 'react-router';
import SearchInputBox from './SearchInputBox';
import { type PackageInfo } from '../../lib/utils/PackageInfo';

interface HeaderProps {
  direction?: 'horizontal' | 'vertical';
  responsive?: boolean;
  features?: {
    mainLinks?: boolean;
    searchBox?: boolean;
    secondaryLinks?: boolean;
  };
  onLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function Header({
  direction = 'horizontal',
  responsive = true,
  features,
  onLinkClick
}: HeaderProps) {
  const { showBrowseSettingsModal } = useGlobalModals();
  const [packageInfo, setPackageInfo] = useState<PackageInfo | null>(null);

  const showMainLinks = features?.mainLinks ?? true;
  const showSearchBox = features?.searchBox ?? true;
  const showSecondaryLinks = features?.secondaryLinks ?? true;

  useEffect(() => {
    void (async () => {
      const abortController = new AbortController();
      try {
        setPackageInfo(
          await (
            await fetch('/api/about', { signal: abortController.signal })
          ).json()
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        throw error;
      }

      return () => abortController.abort();
    })();
  }, []);

  const handleSettingsClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      showBrowseSettingsModal();
      if (onLinkClick) {
        onLinkClick(e);
      }
    },
    [onLinkClick]
  );

  return (
    <Container fluid className="header">
      <Stack direction={direction} gap={3}>
        <Stack
          direction={direction}
          className={`menu-bar ${responsive ? 'd-none d-lg-flex' : ''}`}
          gap={3}
        >
          <div className="brand text-nowrap">reddit-dl</div>
          {showMainLinks && (
            <>
              <NavLink className="menu-link" to="/" onClick={onLinkClick}>
                Targets
              </NavLink>
              <NavLink
                className="menu-link"
                to="/subreddits"
                onClick={onLinkClick}
              >
                Subreddits
              </NavLink>
              <NavLink className="menu-link" to="/users" onClick={onLinkClick}>
                Users
              </NavLink>
              <NavLink className="menu-link" to="/posts" onClick={onLinkClick}>
                Posts
              </NavLink>
              <NavLink className="menu-link" to="/media" onClick={onLinkClick}>
                Media
              </NavLink>
            </>
          )}
        </Stack>
        {showSearchBox && (
          <div className="flex-fill">
            <SearchInputBox />
          </div>
        )}
        {showSecondaryLinks && (
          <Stack
            direction={direction}
            className={`menu-bar ${direction === 'horizontal' ? 'justify-content-end' : ''} ${responsive ? 'd-none d-lg-flex' : ''}`}
            gap={3}
          >
            <a
              href="#"
              className="menu-link d-flex align-items-center"
              onClick={handleSettingsClick}
            >
              <span className="material-icons me-2">settings</span>
              <span
                className={`${direction === 'horizontal' ? ' me-2' : ''} ${responsive ? 'd-none d-xl-block' : ''}`}
              >
                Settings
              </span>
            </a>
            {packageInfo?.repository && (
              <a
                href={packageInfo.repository}
                className="project-link menu-link d-flex align-items-center"
                target="__blank"
                onClick={onLinkClick}
              >
                <GithubIcon className="project-icon me-2" />
                <span
                  className={`text-nowrap ${responsive ? 'd-none d-xl-block' : ''}`}
                >
                  Project Homepage
                </span>
              </a>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

export default Header;
