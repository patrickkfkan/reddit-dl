import { type PageElements } from '../types/PageElements';
import MediaGallery from './MediaGallery';
import ContentCard from './ContentCard';
import { useMemo } from 'react';
import FadeContent from './FadeContent';
import LightGallery from 'lightgallery/react';
import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-zoom.css';
import 'lightgallery/css/lg-thumbnail.css';
import 'lightgallery/css/lg-video.css';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgZoom from 'lightgallery/plugins/zoom';
import lgVideo from 'lightgallery/plugins/video';

interface PostCardBodyProps {
  data: PageElements.CardBodyContent.Post;
}

function PostCardBody({ data }: PostCardBodyProps) {
  const text = useMemo(() => {
    if (!data.text) {
      return null;
    }
    let main = <div dangerouslySetInnerHTML={{ __html: data.text }} />;
    if (data.hasEmbeddedContentMedia) {
      main = (
        <LightGallery
          speed={500}
          plugins={[lgThumbnail, lgZoom, lgVideo]}
          selector=".embedded-content-media"
        >
          {main}
        </LightGallery>
      );
    }
    if (data.useShowMore) {
      return <FadeContent>{main}</FadeContent>;
    }
    return main;
  }, [data.text, data.useShowMore]);

  const embed = useMemo(() => {
    if (!data.embedHTML) {
      return null;
    }
    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: data.embedHTML }} />
        <div className="fs-6 fst-italic">
          &#40;Embedded media - not stored locally&#41;
        </div>
      </div>
    );
  }, [data.embedHTML]);

  return (
    <>
      {text}
      {data.gallery && <MediaGallery data={data.gallery} />}
      {embed}
      {data.nestedPost && (
        <div className="p-1">
          <ContentCard data={data.nestedPost} />
        </div>
      )}
    </>
  );
}

export default PostCardBody;
