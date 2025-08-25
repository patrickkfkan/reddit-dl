import { NavLink } from 'react-router';
import '../assets/styles/PageNav.scss';
import { type PageElements } from '../types/PageElements';

interface PageNavProps {
  data: PageElements.Nav;
}

function PageNav({ data }: PageNavProps) {
  return (
    <div className="page-nav mt-3 mb-2">
      {data.previous && (
        <NavLink to={data.previous} className="material-icons-outlined prev">
          chevron_left
        </NavLink>
      )}
      {data.sections.map((section, index) => (
        <>
          {index > 0 && <span className="separator">...</span>}
          {section.map((page) =>
            page.isCurrent ?
              <span key={`page-nav:${page.url}`} className="page current">
                {page.pageNumber}
              </span>
            : <NavLink
                key={`page-nav:${page.url}`}
                to={page.url}
                className="page"
              >
                {page.pageNumber}
              </NavLink>
          )}
        </>
      ))}
      {data.next && (
        <NavLink to={data.next} className="material-icons-outlined next">
          chevron_right
        </NavLink>
      )}
    </div>
  );
}

export default PageNav;
