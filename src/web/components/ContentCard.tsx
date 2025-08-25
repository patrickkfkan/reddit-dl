import '../assets/styles/ContentCard.scss';
import { useMemo } from 'react';
import { type PageElements } from '../types/PageElements';
import { Card } from 'react-bootstrap';
import TextRunGroup from './TextRunGroup';
import PostCardBody from './PostCardBody';
import PostCommentCardBody from './PostCommentCardBody';
import MediaItemTooltipCardBody from './MediaItemTooltipCardBody';

interface ContentCardProps {
  data: PageElements.AnyCard;
  onKickerLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onTitleLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onSubtitleLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onFooterLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function ContentCard({
  data,
  onKickerLinkClick,
  onTitleLinkClick,
  onSubtitleLinkClick,
  onFooterLinkClick
}: ContentCardProps) {
  const header = useMemo(() => {
    const hasKicker = data.kicker && data.kicker.length > 0;
    const hasTitle = data.title && data.title.length > 0;
    const hasSubtitle = data.subtitle && data.subtitle.length > 0;
    if (hasKicker || hasTitle || hasSubtitle) {
      return (
        <Card.Header>
          {hasKicker && (
            <div className="kicker">
              <TextRunGroup
                data={data.kicker!}
                onLinkClick={onKickerLinkClick}
              />
            </div>
          )}
          {hasTitle && (
            <div className="title">
              <TextRunGroup data={data.title!} onLinkClick={onTitleLinkClick} />
            </div>
          )}
          {hasSubtitle && (
            <div className="subtitle">
              <TextRunGroup
                data={data.subtitle!}
                onLinkClick={onSubtitleLinkClick}
              />
            </div>
          )}
        </Card.Header>
      );
    }
  }, [data]);

  const body = useMemo(() => {
    if (!data.body) {
      return null;
    }
    let el: React.ReactNode;
    switch (data.type) {
      case 'Post':
        el = <PostCardBody data={data.body.content} />;
        break;
      case 'PostComment':
        el = <PostCommentCardBody data={data.body.content} />;
        break;
      case 'MediaItemTooltip':
        el = <MediaItemTooltipCardBody data={data.body.content} />;
        break;
      case 'SearchPostCommentResult':
        el = <ContentCard data={data.body.content} />;
        break;
      case 'String':
        el = <div dangerouslySetInnerHTML={{ __html: data.body.content }} />;
        break;
    }
    return <Card.Body className={data.body.class}>{el}</Card.Body>;
  }, [data]);

  const footer = useMemo(
    () =>
      data.footer && (
        <Card.Footer>
          <TextRunGroup data={data.footer} onLinkClick={onFooterLinkClick} />
        </Card.Footer>
      ),
    [data]
  );

  return (
    <Card className={data.class}>
      {header}
      {body}
      {footer}
    </Card>
  );
}

export default ContentCard;
