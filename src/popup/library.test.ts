import { describe, expect, it } from 'vitest';
import { createTrackedSeries } from '../shared/domain';
import type { TrackedSeries } from '../shared/types';
import { filterLibrary } from './library';

function series(title: string, status: TrackedSeries['status']): TrackedSeries {
  const slug = title.toLowerCase().replaceAll(' ', '-');
  return {
    ...createTrackedSeries({
      slug,
      title,
      canonicalUrl: `https://asurascans.com/comics/${slug}`,
      pageType: 'series',
      chapters: [],
    }),
    status,
  };
}

describe('popup library filters', () => {
  const library = [series('Infinite Mage', 'reading'), series('Nano Machine', 'completed')];

  it('searches case-insensitively', () => {
    expect(filterLibrary(library, 'MAGE', 'all').map((item) => item.title)).toEqual([
      'Infinite Mage',
    ]);
  });

  it('filters by reading status', () => {
    expect(filterLibrary(library, '', 'completed').map((item) => item.title)).toEqual([
      'Nano Machine',
    ]);
  });
});
