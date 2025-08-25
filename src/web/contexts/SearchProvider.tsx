import { createContext, useCallback, useContext, useState } from 'react';
import { type SearchContext } from '../types/Page';
import { useNavigate } from 'react-router';

interface SearchProviderProps {
  children: React.ReactNode;
}

interface SearchProviderContextValue {
  searchContext: SearchContext;
  setSearchContext: (value: SearchContext) => void;
  performSearch: (query: string) => void;
}

const SearchProviderContext = createContext({} as SearchProviderContextValue);

function SearchProvider(props: SearchProviderProps) {
  const [searchContext, setSearchContext] = useState<SearchContext>({
    target: 'all'
  });
  const navigate = useNavigate();

  const performSearch = useCallback(
    (query: string) => {
      if (!query.trim()) {
        return;
      }
      const qs = new URLSearchParams({ q: query.trim() }).toString();
      switch (searchContext.target) {
        case 'in_subreddit': {
          void navigate(`/r/${searchContext.subredditName}/search?${qs}`);
          break;
        }
        case 'by_user': {
          void navigate(`/u/${searchContext.username}/search?${qs}`);
          break;
        }
        case 'all': {
          void navigate(`/search?${qs}`);
          break;
        }
      }
    },
    [navigate, searchContext]
  );

  return (
    <SearchProviderContext.Provider
      value={{ searchContext, setSearchContext, performSearch }}
    >
      {props.children}
    </SearchProviderContext.Provider>
  );
}

const useSearch = () => useContext(SearchProviderContext);

export { useSearch, SearchProvider };
