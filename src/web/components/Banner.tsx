import '../assets/styles/Banner.scss';
import { Button, Stack } from 'react-bootstrap';
import { type PageElements } from '../types/PageElements';
import { useCallback, useState } from 'react';
import { NavLink } from 'react-router';

interface BannerProps {
  data: PageElements.Banner | null;
}

function Banner({ data }: BannerProps) {
  const [showDescription, setShowDescription] = useState(false);

  const toggleDescription = useCallback(() => {
    setShowDescription(!showDescription);
  }, [showDescription]);

  if (!data) {
    return null;
  }

  let bannerLines = 1; // Title
  if (data.caption) bannerLines++;
  if (data.shortDescription) bannerLines++;

  return (
    <Stack className="banner card p-2 mb-4" data-lines={bannerLines}>
      <Stack direction="horizontal" gap={3}>
        {data.icon && <img className="icon mx-1" src={data.icon} />}
        <Stack>
          <div className="title">
            {data.title.url ?
              <NavLink to={data.title.url}>{data.title.text}</NavLink>
            : data.title.text}
            {data.externalURL && (
              <a
                href={data.externalURL}
                className="external-link"
                target="_blank"
                rel="noreferrer"
              >
                exit_to_app
              </a>
            )}
          </div>
          {data.caption && <div className="caption">{data.caption}</div>}
          {data.shortDescription && (
            <div className="short-description mt-1">
              {data.shortDescription}
            </div>
          )}
        </Stack>
        {data.description && (
          <div>
            <Button
              variant="link"
              className={`show-description ${showDescription ? '' : 'collapsed'}`}
              type="button"
              onClick={toggleDescription}
            >
              <span className="material-icons-outlined">
                keyboard_double_arrow_up
              </span>
            </Button>
          </div>
        )}
      </Stack>
      {data.description && (
        <div
          className={`description mt-4 px-2 ${showDescription ? '' : 'collapse'}`}
          dangerouslySetInnerHTML={{ __html: data.description }}
        />
      )}
    </Stack>
  );
}

export default Banner;
