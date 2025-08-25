import { Stack } from 'react-bootstrap';
import { type PageElements } from '../types/PageElements';
import { NavLink } from 'react-router';

interface TextRunProps {
  data: PageElements.TextRun | PageElements.TextRun[];
  onLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function TextRun({ data, onLinkClick }: TextRunProps) {
  if (Array.isArray(data)) {
    return data.map((run, index) => (
      <TextRun key={`text-run-${index}`} data={run} onLinkClick={onLinkClick} />
    ));
  }

  return (
    <Stack direction="horizontal" className={data.class} gap={2}>
      {data.icon && <img className="icon" src={data.icon} />}
      {data.url && !data.isExternalURL && (
        <NavLink to={data.url} onClick={onLinkClick}>
          {data.text}
        </NavLink>
      )}
      {data.url && data.isExternalURL && (
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          onClick={onLinkClick}
        >
          {data.text}
        </a>
      )}
      {!data.url && data.text}
    </Stack>
  );
}

export default TextRun;
