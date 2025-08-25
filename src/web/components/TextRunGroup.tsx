import '../assets/styles/TextRunGroup.scss';
import { type PageElements } from '../types/PageElements';
import TextRun from './TextRun';

interface TextRunGroupProps {
  data: PageElements.TextRunGroup | PageElements.TextRunGroup[];
  onLinkClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

function TextRunGroup({ data, onLinkClick }: TextRunGroupProps) {
  if (Array.isArray(data)) {
    return data.map((group, index) => (
      <TextRunGroup
        key={`text-run-group-${index}`}
        data={group}
        onLinkClick={onLinkClick}
      />
    ));
  }

  return (
    <div className={`text-run-group ${data.class || ''}`}>
      <TextRun data={data.runs} onLinkClick={onLinkClick} />
    </div>
  );
}

export default TextRunGroup;
