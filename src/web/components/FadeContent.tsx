import '../assets/styles/FadeContent.scss';
import { useState, useRef, useEffect, useCallback } from 'react';

interface FadeContentProps {
  children: React.ReactNode;
  maxHeight?: number;
}

const FadeContent = ({ children, maxHeight = 200 }: FadeContentProps) => {
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      const isOverflowing = contentRef.current.scrollHeight > maxHeight;
      setShowToggle(isOverflowing);
      if (!isOverflowing) {
        setExpanded(true);
      }
    }
  }, [children, maxHeight]);

  const handleToggleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      setExpanded(!expanded);
    },
    [expanded]
  );

  return (
    <div className="fade-wrapper">
      <div
        className={`fade-content ${expanded ? 'expanded' : ''}`}
        style={{ maxHeight: expanded ? 'none' : `${maxHeight}px` }}
        ref={contentRef}
      >
        {children}
        {!expanded && <div className="fade-overlay" />}
      </div>
      {showToggle && (
        <div className="d-flex w-100 justify-content-center">
          <a
            href="#"
            className="fade-toggle"
            onClick={handleToggleClick}
            dangerouslySetInnerHTML={{
              __html: expanded ? '&#9650; Show less' : '&#9660; Show more'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default FadeContent;
