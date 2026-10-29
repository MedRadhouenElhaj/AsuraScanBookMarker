import { describe, expect, it } from 'vitest';
import { createTrackedSeries, toSeriesStorageKey } from './domain';
import { normalizeStorageError, readSeriesEntries } from './storage';

describe('storage helpers', () => {
  const series = createTrackedSeries({
    slug: 'example-f886a8af',
    title: 'Example',
    canonicalUrl: 'https://asurascans.com/comics/example-f886a8af',
    pageType: 'series',
    chapters: [],
  });

  it('keeps each series under its own sync key', () => {
    const key = toSeriesStorageKey(series.slug);
    expect(key).toBe('series:example');
    expect(readSeriesEntries({ [key]: series, unrelated: { value: true } })).toEqual([series]);
  });

  it('consolidates old and new Asura suffixes without losing progress', () => {
    const older = {
      ...series,
      slug: 'example-f886a8af',
      lastReadChapter: { id: '16', url: '/chapter/16' },
      latestChapter: { id: '104', url: '/chapter/104' },
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const newer = {
      ...series,
      slug: 'example-00dcbf97',
      canonicalUrl: 'https://asurascans.com/comics/example-00dcbf97',
      lastReadChapter: { id: '18', url: '/chapter/18' },
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const result = readSeriesEntries({
      'series:example-f886a8af': older,
      'series:example-00dcbf97': newer,
    });
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('example-00dcbf97');
    expect(result[0].lastReadChapter?.id).toBe('18');
    expect(result[0].latestChapter?.id).toBe('104');
  });

  it('maps quota failures to a user-facing code', () => {
    expect(normalizeStorageError(new Error('QUOTA_BYTES_PER_ITEM exceeded')).code).toBe(
      'SYNC_QUOTA',
    );
  });
});
