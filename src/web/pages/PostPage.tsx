import { useCallback } from 'react';
import { PostPage } from '../types/Page';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';
import { useParams } from 'react-router';
import PostCommentsSection from '../components/PostCommentsSection';

function PostPage() {
  const params = useParams();

  const renderContent = useCallback((page: PostPage) => {
    return (
      <>
        <ContentCard data={page.post} />
        {page.post.body && page.commentsURL && (
          <div className="mt-3">
            <PostCommentsSection url={page.commentsURL} />
          </div>
        )}
      </>
    );
  }, []);

  let fetchPageURL: string;
  if (params.postId) {
    fetchPageURL = `/api/post/${params.postId}`;
  } else {
    return null;
  }

  return (
    <RenderedPage fetchPageURL={fetchPageURL} renderContent={renderContent} />
  );
}

export default PostPage;
