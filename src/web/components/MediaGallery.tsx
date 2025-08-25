import '../assets/styles/MediaGallery.scss';
import { Col, Container, Row } from 'react-bootstrap';
import { type PageElements } from '../types/PageElements';
import LightGallery from 'lightgallery/react';
import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-zoom.css';
import 'lightgallery/css/lg-thumbnail.css';
import 'lightgallery/css/lg-video.css';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgZoom from 'lightgallery/plugins/zoom';
import lgVideo from 'lightgallery/plugins/video';
import HoverPopover from './HoverPopover';
import ContentCard from './ContentCard';

interface MediaGalleryProps {
  data: PageElements.MediaGallery;
  spacing?: 1 | 2;
}

interface MediaGalleryItemProps {
  media: PageElements.MediaGalleryItem;
}

function MediaGalleryItem({ media }: MediaGalleryItemProps) {
  if (!media.src || !media.thumbnail) {
    return null;
  }
  const href = media.type === 'image' ? media.src : undefined;
  const dataSrc = media.type === 'image' ? media.src : undefined;
  const dataVideo =
    media.type === 'video' ?
      JSON.stringify({
        source: [
          {
            src: media.src,
            type: 'video/mp4'
          }
        ],
        attributes: {
          preload: false,
          controls: true,
          playsInline: true
        }
      })
    : undefined;
  const dataPoster = media.type === 'video' ? media.thumbnail : undefined;
  const item = (
    <a
      href={href}
      className="media-gallery-item"
      data-src={dataSrc}
      data-video={dataVideo}
      data-poster={dataPoster}
    >
      <img className="thumbnail" src={media.thumbnail} alt={media.title} />
    </a>
  );
  const wrapped =
    media.tooltip ?
      <HoverPopover
        className="w-100 h-100"
        placement="bottom"
        content={<ContentCard data={media.tooltip} />}
      >
        {item}
      </HoverPopover>
    : item;
  return (
    <Col
      key={`media-gallery-item-${media.mediaId}`}
      sm={4}
      md={3}
      lg={2}
      className={`thumbnail-wrapper align-content-center ${media.type === 'video' ? 'video' : ''}`}
    >
      {wrapped}
    </Col>
  );
}

function MediaGallery({ data, spacing = 2 }: MediaGalleryProps) {
  return (
    <LightGallery
      speed={500}
      plugins={[lgThumbnail, lgZoom, lgVideo]}
      selector=".media-gallery-item"
    >
      <Container fluid className={`media-gallery p-0 ${data.class || ''}`}>
        <Row className={`justify-content-start g-${spacing}`}>
          {data.items.map((media) => (
            <MediaGalleryItem
              key={`media-gallery-item-${media.mediaId}`}
              media={media}
            />
          ))}
        </Row>
      </Container>
    </LightGallery>
  );
}

export default MediaGallery;
