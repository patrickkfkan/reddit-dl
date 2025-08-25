import '../assets/styles/SearchInputBox.scss';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { useSearch } from '../contexts/SearchProvider';
import { useCallback, useMemo, useState } from 'react';

function SearchInputBox() {
  const { searchContext, setSearchContext, performSearch } = useSearch();
  const [query, setQuery] = useState('');

  const handleClearSearchContextClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      setSearchContext({
        target: 'all'
      });
    },
    []
  );

  const searchIn = useMemo(() => {
    if (searchContext.target === 'all') {
      return null;
    }
    const targetName =
      searchContext.target === 'in_subreddit' ?
        `r/${searchContext.subredditName}`
      : searchContext.target === 'by_user' ? `u/${searchContext.username}`
      : '';
    return (
      <InputGroup.Text className="d-flex align-items-center pe-1 py-1">
        {targetName}
        <a
          href="#"
          className="clear-context p-2 fs-6 material-icons"
          onClick={handleClearSearchContextClick}
        >
          close
        </a>
      </InputGroup.Text>
    );
  }, [searchContext.target, setSearchContext]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
    },
    []
  );

  const doSearch = useCallback(() => {
    performSearch(query);
  }, [query, performSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    },
    [doSearch]
  );

  return (
    <div className="search-input-box w-100">
      <InputGroup>
        {searchIn}
        <Form.Control
          value={query}
          type="search"
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
        />
        <Button
          className="d-flex align-items-center justify-content-center"
          onClick={doSearch}
        >
          <span className="material-icons">search</span>
        </Button>
      </InputGroup>
    </div>
  );
}

export default SearchInputBox;
