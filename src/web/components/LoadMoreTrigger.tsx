import { useEffect, useRef } from 'react';

interface LoadMoreTriggerProps {
  onVisible: () => void;
}

const LoadMoreTrigger = ({ onVisible }: LoadMoreTriggerProps) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible();
        }
      },
      { threshold: 1.0 }
    );

    if (ref.current) observer.observe(ref.current);

    return () => observer.disconnect();
  }, [onVisible]);

  return <div ref={ref} style={{ height: '1px' }} />;
};

export default LoadMoreTrigger;
