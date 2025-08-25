import { useCallback } from 'react';
import { TargetListPage } from '../types/Page';
import { Col, Container, type ContainerProps, Row } from 'react-bootstrap';
import ContentCard from '../components/ContentCard';
import RenderedPage from '../components/RenderedPage';

interface TargetListPageProps extends ContainerProps {
  page: TargetListPage;
}

function TargetListPage({ page, ...containerProps }: TargetListPageProps) {
  const renderContent = useCallback((page: TargetListPage) => {
    return (
      <Container fluid className="p-0">
        <Row className="justify-content-start gx-lg-2 gy-3">
          {page.targets.map((target) => (
            <Col key={`content-card-${target.id}`} lg={6}>
              <ContentCard data={target} />
            </Col>
          ))}
        </Row>
      </Container>
    );
  }, []);

  return (
    <RenderedPage
      page={page}
      renderContent={renderContent}
      {...containerProps}
    />
  );
}

export default TargetListPage;
