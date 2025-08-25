import { useEffect, useState } from 'react';
import { PostCommentsSection } from '../types/Page';
import { Spinner, Stack } from 'react-bootstrap';
import ContentCard from './ContentCard';
import LoadMoreTrigger from './LoadMoreTrigger';
import SortOptions from './SortOptions';

interface PostCommentsSectionProps {
  url: string;
}

function PostCommentsSection({ url: initialURL }: PostCommentsSectionProps) {
  const [url, setURL] = useState(initialURL);
  const [data, setData] = useState<PostCommentsSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMoreTriggered, setLoadMoreTriggered] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    void (async () => {
      const _url = new URL(url, window.location.href);
      try {
        setLoadMoreTriggered(false);
        setLoading(true);
        const data = (await (
          await fetch(_url, { signal: abortController.signal })
        ).json()) as PostCommentsSection;
        setData(data);
        setLoading(false);
      } catch (error) {
        setData(null);
        setLoading(false);
        if (!abortController.signal.aborted) {
          console.error(error);
        }
      }
    })();

    return () => abortController.abort();
  }, [url]);

  if (loading) {
    return (
      <div className="d-flex w-100 p-2 justify-content-center align-items-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!data || data.comments.length === 0) {
    return null;
  }

  return (
    <>
      {data.sortOptions && (
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h4 className="p-0 m-0">Comments</h4>
          <SortOptions
            data={data.sortOptions}
            onChange={(newURL) => setURL(newURL)}
          />
        </div>
      )}
      <Stack gap={3}>
        {data.comments.map((comment) => (
          <ContentCard key={`content-card-${comment.id}`} data={comment} />
        ))}
      </Stack>
      {data.next && !loadMoreTriggered && (
        <LoadMoreTrigger onVisible={() => setLoadMoreTriggered(true)} />
      )}
      {data.next && loadMoreTriggered && (
        <PostCommentsSection url={data.next} />
      )}
    </>
  );
}

export default PostCommentsSection;
