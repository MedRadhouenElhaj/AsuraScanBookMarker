import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrackedSeries } from '../shared/domain';
import { AVAILABILITY_CACHE_VERSION, refreshLibrary, refreshSeriesRecord } from './refresh';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('series refresh repair', () => {
  it('uses the stable route and adopts Asura’s redirected current slug', async () => {
    const syncSet = vi.fn().mockResolvedValue(undefined);
    const localSet = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: {
        sync: { set: syncSet },
        local: { set: localSet },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://asurascans.com/comics/steel-eating-player-00dcbf97',
      text: vi.fn().mockResolvedValue(`
        <a href="/comics/steel-eating-player-00dcbf97/chapter/18">18</a>
        <a href="/comics/steel-eating-player-00dcbf97/chapter/19">19</a>
        <astro-island component-url="/_astro/ChapterListReact.js" props="{&quot;chapters&quot;:[1,[[0,{&quot;number&quot;:[0,19],&quot;is_premium&quot;:[0,false]}],[0,{&quot;number&quot;:[0,18],&quot;is_premium&quot;:[0,false]}]]]}"></astro-island>
      `),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stale = {
      ...createTrackedSeries({
        slug: 'steel-eating-player-f886a8af',
        pageType: 'chapter',
        title: 'Steel-Eating Player',
        canonicalUrl: 'https://asurascans.com/comics/steel-eating-player-f886a8af',
        currentChapter: {
          id: '18',
          url: 'https://asurascans.com/comics/steel-eating-player-f886a8af/chapter/18',
        },
        chapters: [],
      }),
    };

    const result = await refreshSeriesRecord(stale, 1_700_000_000_000);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://asurascans.com/comics/steel-eating-player',
      expect.objectContaining({ credentials: 'omit' }),
    );
    expect(result.slug).toBe('steel-eating-player-00dcbf97');
    expect(result.canonicalUrl).toBe(
      'https://asurascans.com/comics/steel-eating-player-00dcbf97',
    );
    expect(result.lastReadChapter?.url).toContain(
      '/comics/steel-eating-player-00dcbf97/chapter/18',
    );
    expect(result.nextChapter?.id).toBe('19');
    expect(result.latestFreeChapter?.id).toBe('19');
    expect(syncSet).toHaveBeenCalledOnce();
    expect(localSet).toHaveBeenCalledOnce();
  });
});

const fixture = createTrackedSeries({
  slug: 'test', title: 'Test', canonicalUrl: 'https://asurascans.com/comics/test',
  pageType: 'chapter', currentChapter: { id: '1', url: '/1' },
  chapters: [{ id: '2', url: '/2', availability: 'free' }],
});
function mockStorage(cached: unknown) {
  const syncSet = vi.fn().mockResolvedValue(undefined);
  const localSet = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { storage: {
    sync: { get: vi.fn().mockResolvedValue({ 'series:test': fixture }), set: syncSet, remove: vi.fn() },
    local: { get: vi.fn().mockResolvedValue({ 'refresh:test': cached }), set: localSet },
  } });
  return { syncSet, localSet };
}
it('bypasses a fresh legacy timestamp and does not cache incomplete availability', async () => {
  const { syncSet, localSet } = mockStorage(Date.now());
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true,
    url: fixture.canonicalUrl, text: async () => '<a href="/comics/test/chapter/3">3</a>',
  }));
  const result = await refreshLibrary(false);
  expect(result.skipped).toBe(0);
  expect(result.updated).toBe(0);
  expect(result.failures[0].message).toContain('availability');
  expect(syncSet).not.toHaveBeenCalled();
  expect(localSet).not.toHaveBeenCalled();
});
it('honors the versioned cache after successful availability extraction', async () => {
  mockStorage({ version: AVAILABILITY_CACHE_VERSION, checkedAt: Date.now() });
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await refreshLibrary(false)).toEqual({ updated: 0, skipped: 1, failures: [] });
  expect(fetch).not.toHaveBeenCalled();
});
