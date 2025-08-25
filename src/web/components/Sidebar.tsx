import '../assets/styles/Sidebar.scss';
import { useCallback } from 'react';
import { Card } from 'react-bootstrap';
import Header from './Header';

interface SidebarProps {
  onClose?: () => void;
}

function Sidebar(props: SidebarProps) {
  const { onClose } = props;

  const handleLinkClick = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const handleCloseButtonClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (onClose) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <Card className="sidebar p-0">
      <Header
        direction="vertical"
        responsive={false}
        features={{ searchBox: false }}
        onLinkClick={handleLinkClick}
      />
      <a
        href="#"
        className="close-sidebar material-icons"
        onClick={handleCloseButtonClick}
      >
        close
      </a>
    </Card>
  );
}

export default Sidebar;
