import { useCallback, useRef, useState } from 'react';
import { Overlay, Popover } from 'react-bootstrap';

interface HoverPopoverProps
  extends Omit<
    React.HTMLAttributes<HTMLDivElement>,
    'content' | 'onMouseEnter' | 'onMouseLeave'
  > {
  children: React.ReactNode;
  content: React.ReactNode;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

function HoverPopover({
  children,
  content,
  placement,
  ...divProps
}: HoverPopoverProps) {
  const [show, setShow] = useState(false);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout>(null);

  const handleEnter = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
      return;
    }
    setShow(true);
  }, []);

  const handleLeave = useCallback(() => {
    if (hideTimerRef.current) {
      return;
    }
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setShow(false);
    }, 100);
  }, []);

  return (
    <>
      <div
        ref={targetRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        {...divProps}
      >
        {children}
      </div>

      <Overlay
        target={targetRef.current}
        show={show}
        placement={placement}
        flip
      >
        {(props) => (
          <Popover {...props}>
            <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
              {content}
            </div>
          </Popover>
        )}
      </Overlay>
    </>
  );
}

export default HoverPopover;
