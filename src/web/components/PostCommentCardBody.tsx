import { Spinner } from 'react-bootstrap';
import { type PostCommentsSection } from '../types/Page';
import { type PageElements } from '../types/PageElements';
import ContentCard from './ContentCard';
import { useEffect, useMemo, useState } from 'react';

interface PostCommentCardBodyProps {
  data: PageElements.CardBodyContent.PostComment;
}

interface LoadedReplies {
  comments: PageElements.Card<'PostComment'>[];
  next: string | null;
}

function PostCommentCardBody({ data }: PostCommentCardBodyProps) {
  const [loadedReplies, setLoadedReplies] = useState<LoadedReplies>(
    data.replies ?
      {
        comments: data.replies.comments,
        next: data.replies.next || null
      }
    : {
        comments: [],
        next: null
      }
  );
  const [loadMoreRepliesURL, setLoadMoreRepliesURL] = useState<string | null>(
    null
  );
  const [loadingMoreReplies, setLoadingMoreReplies] = useState(false);

  useEffect(() => {
    if (!loadMoreRepliesURL) {
      return;
    }
    const abortController = new AbortController();
    void (async () => {
      const url = new URL(loadMoreRepliesURL, window.location.href);
      try {
        setLoadingMoreReplies(true);
        const data = (await (
          await fetch(url, { signal: abortController.signal })
        ).json()) as PostCommentsSection;
        setLoadedReplies((prev) => ({
          comments: [...prev.comments, ...data.comments],
          next: data.next
        }));
        setLoadingMoreReplies(false);
      } catch (error) {
        setLoadingMoreReplies(false);
        if (!abortController.signal.aborted) {
          console.error(error);
        }
      }
    })();

    return () => abortController.abort();
  }, [loadMoreRepliesURL]);

  const loadMoreTrigger = useMemo(() => {
    if (!loadedReplies.next) {
      return null;
    }
    if (loadingMoreReplies) {
      return <Spinner size="sm" className="p-1" />;
    }
    const loadMoreText =
      loadedReplies.comments.length > 0 ? 'View more replies' : 'View replies';
    const link = (
      <a
        href="#"
        style={{ fontSize: '0.9rem' }}
        onClick={(e) => {
          e.preventDefault();
          setLoadMoreRepliesURL(loadedReplies.next);
        }}
      >
        {loadMoreText}
      </a>
    );
    if (loadedReplies.comments.length > 0) {
      return (
        <div className="card card-body post-comment reply pt-3">{link}</div>
      );
    }
    return <div className="view-replies">{link}</div>;
  }, [loadedReplies, loadingMoreReplies]);

  const replies = useMemo(() => {
    if (loadedReplies.comments.length > 0) {
      const replyCards = loadedReplies.comments.map((reply) => (
        <ContentCard key={`comment-reply-${reply.id}`} data={reply} />
      ));
      return (
        <div>
          {replyCards}
          {loadMoreTrigger}
        </div>
      );
    }
    return loadMoreTrigger;
  }, [loadedReplies, loadMoreTrigger]);

  return (
    <>
      {data.text && (
        <div
          id={`post-comment-card-body-text-${data.commentId}`}
          className="post-comment-text"
          dangerouslySetInnerHTML={{ __html: data.text }}
        />
      )}
      {replies}
    </>
  );
}

export default PostCommentCardBody;
