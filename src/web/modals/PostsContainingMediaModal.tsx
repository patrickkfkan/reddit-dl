import '../assets/styles/PostsContainingMediaModal.scss';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Spinner, Stack } from 'react-bootstrap';
import { type PostsContainingMediaPage } from '../types/Page';
import ContentCard from '../components/ContentCard';

interface PostsContainingMediaModalProps {
  url: string | null;
  show: boolean;
  onClose: () => void;
}

function PostsContainingMediaModal({
  url,
  show,
  onClose
}: PostsContainingMediaModalProps) {
  const [page, setPage] = useState<PostsContainingMediaPage | null>(null);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    setPage(null);
    if (!url) {
      return;
    }
    const abortController = new AbortController();
    void (async () => {
      try {
        setPage(
          await (await fetch(url, { signal: abortController.signal })).json()
        );
      } catch (error) {
        if (!abortController.signal.aborted) {
          throw error;
        }
      }
    })();

    return () => abortController.abort();
  }, [url]);

  const body = useMemo(() => {
    if (!page) {
      return (
        <div className="d-flex w-100 p-4 justify-content-center align-items-center">
          <Spinner />
        </div>
      );
    }
    if (page.posts.length > 0) {
      return (
        <Stack gap={4}>
          {page.posts.map((post) => (
            <ContentCard
              key={`content-card-${post.id}`}
              data={{ ...post, body: undefined, footer: undefined }}
              onKickerLinkClick={close}
              onTitleLinkClick={close}
              onSubtitleLinkClick={close}
            />
          ))}
        </Stack>
      );
    }
    return (
      <div className="d-flex w-100 p-4 justify-content-center align-items-center">
        No posts found
      </div>
    );
  }, [page]);

  return (
    <Modal
      className="posts-containing-media-modal"
      show={show}
      onHide={close}
      centered
      scrollable
    >
      <Modal.Header closeButton />
      <Modal.Body className="pb-4">{body}</Modal.Body>
    </Modal>
  );
}

export default PostsContainingMediaModal;
