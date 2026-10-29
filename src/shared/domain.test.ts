import { describe, expect, it } from 'vitest';
import {
  compareChapterIds,
  countUnreadSeries,
  createTrackedSeries,
  findNextChapter,
  isRefreshStale,
  mergePageVisit,
  parseAsuraRoute,
  stableSeriesId,
  stableSeriesUrl,
  toSeriesStorageKey,
} from './domain';
import type { PageMetadata, TrackedSeries } from './types';

const baseMetadata: PageMetadata = {
  slug: 'mount-hua-f886a8af',
  pageType: 'series',
  title: 'Mount Hua',
  canonicalUrl: 'https://asurascans.com/comics/mount-hua-f886a8af',
  chapters: [
    { availability: 'free', id: '1', url: 'https://asurascans.com/comics/mount-hua-f886a8af/chapter/1' },
    { availability: 'free', id: '2', url: 'https://asurascans.com/comics/mount-hua-f886a8af/chapter/2' },
  ],
};

describe('Asura route parsing', () => {
  it('recognizes series and chapter routes', () => {
    expect(parseAsuraRoute(baseMetadata.canonicalUrl)).toEqual({
      pageType: 'series',
      slug: 'mount-hua-f886a8af',
    });
    expect(parseAsuraRoute(`${baseMetadata.canonicalUrl}/chapter/152.10`)).toEqual({
      pageType: 'chapter',
      slug: 'mount-hua-f886a8af',
      chapterId: '152.10',
    });
  });

  it('uses the suffix-free route as the permanent series identity', () => {
    expect(stableSeriesId('steel-eating-player-00dcbf97')).toBe('steel-eating-player');
    expect(stableSeriesId('steel-eating-player-f886a8af')).toBe('steel-eating-player');
    expect(stableSeriesUrl('steel-eating-player-00dcbf97')).toBe(
      'https://asurascans.com/comics/steel-eating-player',
    );
    expect(toSeriesStorageKey('steel-eating-player-00dcbf97')).toBe(
      'series:steel-eating-player',
    );
  });

  it('rejects unrelated hosts and routes', () => {
    expect(parseAsuraRoute('https://example.com/comics/foo')).toBeNull();
    expect(parseAsuraRoute('https://asurascans.com/browse')).toBeNull();
  });
});

describe('chapter ordering', () => {
  it('keeps multi-part fractional chapters distinct', () => {
    expect(compareChapterIds('152.10', '152.9')).toBe(1);
    expect(compareChapterIds('152.1', '152.10')).toBe(-1);
    expect(compareChapterIds('7', '7.0')).toBe(0);
  });

  it('finds the nearest chapter after progress', () => {
    expect(
      findNextChapter(
        [
          { id: '3', url: '/3' },
          { availability: 'free', id: '1', url: '/1' },
          { availability: 'free', id: '2', url: '/2' },
        ],
        { availability: 'free', id: '1', url: '/1' },
      ),
    ).toEqual({ availability: 'free', id: '2', url: '/2' });
  });
});

describe('tracking behavior', () => {
  it('records the current chapter when first tracked', () => {
    const tracked = createTrackedSeries({
      ...baseMetadata,
      pageType: 'chapter',
      currentChapter: baseMetadata.chapters[0],
    }, '2026-01-01T00:00:00.000Z');
    expect(tracked.status).toBe('reading');
    expect(tracked.lastReadChapter?.id).toBe('1');
    expect(tracked.latestChapter?.id).toBe('2');
    expect(tracked.nextChapter?.id).toBe('2');
  });

  it('never moves progress backward on an older chapter visit', () => {
    const existing: TrackedSeries = {
      ...createTrackedSeries(baseMetadata),
      lastReadChapter: baseMetadata.chapters[1],
    };
    const result = mergePageVisit(existing, {
      ...baseMetadata,
      pageType: 'chapter',
      currentChapter: baseMetadata.chapters[0],
    });
    expect(result.lastReadChapter?.id).toBe('2');
  });

  it('adopts a changed Asura slug without losing saved progress', () => {
    const existing: TrackedSeries = {
      ...createTrackedSeries(baseMetadata),
      lastReadChapter: baseMetadata.chapters[1],
    };
    const result = mergePageVisit(existing, {
      ...baseMetadata,
      slug: 'mount-hua-00dcbf97',
      canonicalUrl: 'https://asurascans.com/comics/mount-hua-00dcbf97',
      pageType: 'chapter',
      currentChapter: {
        id: '1',
        url: 'https://asurascans.com/comics/mount-hua-00dcbf97/chapter/1',
      },
    });
    expect(result.slug).toBe('mount-hua-00dcbf97');
    expect(result.lastReadChapter).toEqual({
      availability: 'free',
      id: '2',
      url: 'https://asurascans.com/comics/mount-hua-00dcbf97/chapter/2',
    });
  });

  it('counts only titles with newer known chapters', () => {
    const unread = {
      ...createTrackedSeries(baseMetadata),
      lastReadChapter: baseMetadata.chapters[0],
    };
    const caughtUp = {
      ...createTrackedSeries(baseMetadata),
      slug: 'caught-up',
      lastReadChapter: baseMetadata.chapters[1],
    };
    expect(countUnreadSeries([unread, caughtUp])).toBe(1);
  });

  it('throttles refreshes for thirty minutes', () => {
    const now = 2_000_000;
    expect(isRefreshStale(now - 29 * 60_000, now)).toBe(false);
    expect(isRefreshStale(now - 30 * 60_000, now)).toBe(true);
    expect(isRefreshStale(undefined, now)).toBe(true);
  });
});
