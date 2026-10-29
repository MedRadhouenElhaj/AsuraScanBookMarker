import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendExtensionMessage } from '../shared/messages';
import { READING_STATUSES, STATUS_LABELS } from '../shared/types';
import type {
  ExtensionError,
  ContinueResult,
  ReadingStatus,
  RefreshResult,
  TrackedSeries,
} from '../shared/types';
import { filterLibrary, type StatusFilter } from './library';
import { SeriesCard } from './SeriesCard';
import { brandIcon } from '../shared/brand';

export default function App() {
  const [library, setLibrary] = useState<TrackedSeries[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ExtensionError | null>(null);
  const [notice, setNotice] = useState('');

  const loadLibrary = useCallback(async () => {
    const response = await sendExtensionMessage<TrackedSeries[]>({ type: 'GET_LIBRARY' });
    if (response.ok) {
      setLibrary(response.data);
      setError(null);
    } else setError(response.error);
    setLoading(false);
  }, []);

  const refresh = useCallback(
    async (force: boolean) => {
      setRefreshing(true);
      setNotice('');
      const response = await sendExtensionMessage<RefreshResult>({
        type: 'REFRESH_LIBRARY',
        force,
      });
      if (response.ok) {
        const { updated, failures } = response.data;
        if (failures.length > 0) {
          setNotice(
            `Could not refresh ${failures.length} ${failures.length === 1 ? 'title' : 'titles'}; Chapter availability could not be verified; previous data was preserved.`,
          );
        } else if (force) {
          setNotice(updated > 0 ? `Updated ${updated} ${updated === 1 ? 'title' : 'titles'}.` : 'Library is up to date.');
        }
        await loadLibrary();
      } else setError(response.error);
      setRefreshing(false);
    },
    [loadLibrary],
  );

  useEffect(() => {
    void (async () => {
      await loadLibrary();
      await refresh(false);
    })();
  }, [loadLibrary, refresh]);

  useEffect(() => {
    const listener = (_changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync') void loadLibrary();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [loadLibrary]);

  const visibleSeries = useMemo(
    () => filterLibrary(library, search, status),
    [library, search, status],
  );

  async function updateSeries(
    slug: string,
    patch: Partial<Pick<TrackedSeries, 'status' | 'lastReadChapter'>>,
  ): Promise<void> {
    const response = await sendExtensionMessage<TrackedSeries>({
      type: 'UPDATE_SERIES',
      slug,
      patch,
    });
    if (response.ok) {
      setLibrary((current) =>
        current.map((series) => (series.slug === slug ? response.data : series)),
      );
      setError(null);
    } else setError(response.error);
  }

  async function updateProgress(slug: string, chapterId: string): Promise<void> {
    const series = library.find((item) => item.slug === slug);
    if (!series) return;
    await updateSeries(slug, {
      lastReadChapter: {
        id: chapterId,
        url: `${series.canonicalUrl.replace(/\/$/, '')}/chapter/${encodeURIComponent(chapterId)}`,
      },
    });
  }

  async function remove(series: TrackedSeries): Promise<void> {
    if (!window.confirm(`Remove ${series.title} from your reading list?`)) return;
    const response = await sendExtensionMessage<null>({
      type: 'REMOVE_SERIES',
      slug: series.slug,
    });
    if (response.ok) {
      setLibrary((current) => current.filter((item) => item.slug !== series.slug));
      setError(null);
    } else setError(response.error);
  }

  function openUrl(url: string): void {
    void chrome.tabs.create({ url });
  }

  async function continueReading(series: TrackedSeries): Promise<void> {
    const response = await sendExtensionMessage<ContinueResult>({
      type: 'GET_CONTINUE_TARGET',
      slug: series.slug,
    });
    if (response.ok) {
      openUrl(response.data.url);
      if (response.data.caughtUp) setNotice(`You are caught up with ${series.title}.`);
      setError(null);
    } else setError(response.error);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <img className="brand-mark" src={brandIcon} alt="" />
          <div>
            <p className="eyebrow">Your library</p>
            <h1>Asura Tracker</h1>
          </div>
          <button
            className="refresh-button"
            type="button"
            disabled={refreshing || library.length === 0}
            onClick={() => void refresh(true)}
            aria-label="Refresh latest chapters"
            title="Refresh latest chapters"
          >
            <span className={refreshing ? 'spin' : ''}>↻</span>
          </button>
        </div>

        <label className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search your library"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="filter-row" role="group" aria-label="Filter by reading status">
          <button
            className={status === 'all' ? 'active' : ''}
            type="button"
            onClick={() => setStatus('all')}
          >
            All <span>{library.length}</span>
          </button>
          {READING_STATUSES.map((filterStatus) => {
            const count = library.filter((series) => series.status === filterStatus).length;
            if (count === 0 && status !== filterStatus) return null;
            return (
              <button
                key={filterStatus}
                className={status === filterStatus ? 'active' : ''}
                type="button"
                onClick={() => setStatus(filterStatus)}
              >
                {STATUS_LABELS[filterStatus]} <span>{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      <span className="sr-only" role="status">
        {loading ? 'Loading your library' : refreshing ? 'Refreshing your library' : ''}
      </span>
      {refreshing && !loading && <div className="refresh-shimmer" aria-hidden="true" />}

      {error && (
        <div className={`banner ${error.code === 'SYNC_QUOTA' ? 'quota' : 'error'}`} role="alert">
          <strong>{error.code === 'SYNC_QUOTA' ? 'Chrome Sync needs attention' : 'Something went wrong'}</strong>
          <span>{error.message}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}
      {notice && <div className="banner notice">{notice}</div>}

      <section className="library-list" aria-live="polite" aria-busy={loading || refreshing}>
        {loading ? (
          <div className="skeleton-list" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div className="series-card skeleton-card" key={index}>
                <div className="skeleton-shape skeleton-cover" />
                <div className="card-content">
                  <div className="skeleton-shape skeleton-title" />
                  <div className="skeleton-shape skeleton-progress" />
                  <div className="skeleton-shape skeleton-control" />
                  <div className="skeleton-shape skeleton-action" />
                </div>
              </div>
            ))}
          </div>
        ) : library.length === 0 ? (
          <div className="state-card empty-state">
            <div className="empty-icon">⌑</div>
            <h2>Your list is ready</h2>
            <p>Open a series or chapter on Asura Scans, then use the floating Track button.</p>
            <button type="button" onClick={() => openUrl('https://asurascans.com/browse')}>
              Browse Asura Scans
            </button>
          </div>
        ) : visibleSeries.length === 0 ? (
          <div className="state-card compact">
            <h2>No matches</h2>
            <p>Try another search or reading status.</p>
          </div>
        ) : (
          visibleSeries.map((series) => (
            <SeriesCard
              key={series.slug}
              series={series}
              onOpen={openUrl}
              onContinue={continueReading}
              onRemove={remove}
              onProgressChange={updateProgress}
              onStatusChange={(slug, nextStatus: ReadingStatus) =>
                updateSeries(slug, { status: nextStatus })
              }
            />
          ))
        )}
      </section>

      <footer>
        <span>{library.length} {library.length === 1 ? 'title' : 'titles'} synced</span>
        <span>{refreshing ? 'Checking Asura…' : 'Chrome Sync'}</span>
      </footer>
    </main>
  );
}
