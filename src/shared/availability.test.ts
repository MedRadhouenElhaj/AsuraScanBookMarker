import { expect, it } from 'vitest';
import { extractChaptersFromHtml } from './extract';
import { createTrackedSeries, hasExpiredUnlock, isSeriesUnread, mergePageVisit } from './domain';

const canonicalUrl = 'https://asurascans.com/comics/test-abcd1234';
const until = '2026-10-17T12:00:00Z';
const chapters = [
  { id: '2', url: `${canonicalUrl}/chapter/2`, availability: 'free' as const },
  { id: '3', url: `${canonicalUrl}/chapter/3`, availability: 'locked' as const, unlockAt: until },
];
it('reads actual Astro availability and exact per-chapter unlock time; plain links remain unknown', () => {
  const props = JSON.stringify({ chapters: [1, chapters.map((chapter) => [0, {
    number: [0, Number(chapter.id)], is_premium: [0, chapter.availability === 'locked'],
    early_access_until: [0, chapter.unlockAt ?? null],
  }])] }).replaceAll('"', '&quot;');
  expect(extractChaptersFromHtml(`<astro-island component-url="/_astro/ChapterListReact.js" props="${props}"></astro-island>`, canonicalUrl)).toEqual(chapters);
  expect(extractChaptersFromHtml(`<a href="${canonicalUrl}/chapter/4">4</a>`, canonicalUrl)[0].availability).toBeUndefined();
});
it('uses only free chapters for updates and continue; expired locks require verification', () => {
  const metadata = { slug: 'test-abcd1234', title: 'Test', canonicalUrl, pageType: 'chapter' as const,
    currentChapter: { id: '2', url: '/2' }, chapters };
  const series = createTrackedSeries(metadata);
  expect(series.latestChapter?.id).toBe('3');
  expect(series.latestFreeChapter?.id).toBe('2');
  expect(series.nextChapter).toBeUndefined();
  expect(isSeriesUnread(series)).toBe(false);
  const now = Date.parse(until);
  expect(hasExpiredUnlock(series, now - 1, now)).toBe(true);
  expect(hasExpiredUnlock(series, now, now)).toBe(false);
  const unlocked = mergePageVisit(series, { ...metadata, pageType: 'series', chapters: chapters.map((chapter) => ({ ...chapter, availability: 'free' })) });
  expect(isSeriesUnread(unlocked)).toBe(true);
  expect(unlocked.nextChapter?.id).toBe('3');
  expect(unlocked.latestFreeChapter?.unlockAt).toBe(until);
});
it('does not alert for legacy data or advance progress on a known locked visit', () => {
  const series = createTrackedSeries({ slug: 'test', title: 'Test', canonicalUrl, pageType: 'chapter', currentChapter: chapters[1], chapters });
  expect(series.lastReadChapter).toBeUndefined();
  expect(isSeriesUnread({ ...series, lastReadChapter: chapters[0], latestFreeChapter: undefined })).toBe(false);
});

it('preserves confirmed availability and next target on an incomplete chapter visit', () => {
  const original = createTrackedSeries({ slug: 'test', title: 'Test', canonicalUrl,
    pageType: 'chapter', currentChapter: { id: '1', url: '/1' }, chapters });
  const visited = mergePageVisit(original, { slug: 'test', title: 'Test',
    canonicalUrl: 'https://asurascans.com/comics/test-1234abcd', pageType: 'chapter',
    currentChapter: { id: '1', url: '/1' }, chapters: [{ id: '4', url: '/4' }],
  });
  expect(visited.latestFreeChapter?.id).toBe('2');
  expect(visited.lockedChapters?.[0].id).toBe('3');
  expect(visited.lockedChapters?.[0].url).toContain('test-1234abcd');
  expect(visited.nextChapter?.id).toBe('2');
  expect(visited.lastReadChapter?.id).toBe('1');
});
