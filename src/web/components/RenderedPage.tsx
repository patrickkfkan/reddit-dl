import { useEffect, useState } from 'react';
import { type Page } from '../types/Page';
import { Container, type ContainerProps, Stack } from 'react-bootstrap';
import Banner from './Banner';
import SortOptions from './SortOptions';
import { useSearchParams } from 'react-router';
import PageNav from './PageNav';
import { useSearch } from '../contexts/SearchProvider';

type RenderedPagProps<T extends Page> = ContainerProps & {
  renderContent: (page: T) => React.ReactNode;
} & (
    | {
        page: T;
        fetchPageURL?: undefined;
        searchParams?: undefined;
      }
    | {
        page?: undefined;
        fetchPageURL: string;
        searchParams?: Record<string, number | string>;
      }
  );

function RenderedPage<T extends Page>({
  page,
  fetchPageURL,
  searchParams: customSearchParams,
  renderContent,
  ...containerProps
}: RenderedPagProps<T>) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setSearchContext } = useSearch();
  const [fetchedPage, setFetchedPage] = useState<T | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!fetchPageURL) {
      return;
    }
    const abortController = new AbortController();
    void (async () => {
      const url = new URL(fetchPageURL, window.location.href);
      for (const [k, v] of searchParams.entries()) {
        url.searchParams.set(k, v);
      }
      if (customSearchParams) {
        for (const [k, v] of Object.entries(customSearchParams)) {
          url.searchParams.set(k, String(v));
        }
      }
      try {
        setRefreshing(true);
        const page = (await (
          await fetch(url, { signal: abortController.signal })
        ).json()) as T;
        if (page.nav) {
          const totalPages = page.nav.totalPages;
          const pageParam = Number(searchParams.get('p')) || 1;
          if (pageParam > totalPages) {
            const sp = new URLSearchParams(searchParams);
            if (totalPages > 1) {
              sp.set('p', String(totalPages));
            } else {
              sp.delete('p');
            }
            setSearchParams(sp, { replace: true });
            return;
          }
        }

        setSearchContext(page.searchContext);
        setFetchedPage(page);
        setRefreshing(false);
      } catch (error) {
        if (!abortController.signal.aborted) {
          throw error;
        }
      }
    })();

    return () => abortController.abort();
  }, [
    fetchPageURL,
    searchParams,
    customSearchParams,
    setSearchParams,
    setSearchContext
  ]);

  const pg = fetchedPage || page;

  if (!pg) {
    return null;
  }

  return (
    <>
      <Container className="mt-4 mb-5" fluid {...containerProps}>
        {pg.banner && <Banner data={pg.banner} />}
        {pg.title && <h3 className="mb-4">{pg.title}</h3>}
        {(pg.showingText || pg.sortOptions) && !refreshing && (
          <Stack
            direction="horizontal"
            className="justify-content-between mb-2"
          >
            <span className={!pg.sortOptions ? 'mb-1' : undefined}>
              {pg.showingText || ''}
            </span>
            {pg.sortOptions && <SortOptions data={pg.sortOptions} />}
          </Stack>
        )}
        {!refreshing && renderContent(pg)}
        {!refreshing && pg.nav && pg.nav.totalPages > 1 && (
          <PageNav data={pg.nav} />
        )}
      </Container>
    </>
  );
}

export default RenderedPage;
