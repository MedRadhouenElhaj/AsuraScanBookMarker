import type { ChapterRef, PageMetadata, ReadingStatus, TrackedSeries } from './types';

export const SERIES_KEY_PREFIX = 'series:';
export const REFRESH_KEY_PREFIX = 'refresh:';
export const REFRESH_TTL_MS = 30 * 60 * 1000;
const ASURA_ORIGIN = 'https://asurascans.com';
const OPAQUE_SLUG_SUFFIX = /-[a-f0-9]{8}$/i;

export interface ParsedRoute {
  pageType: 'series' | 'chapter';
  slug: string;
  chapterId?: string;
}

export function stableSeriesId(slug: string): string {
  return slug.replace(OPAQUE_SLUG_SUFFIX, '');
}

export function stableSeriesUrl(slug: string): string {
  return `${ASURA_ORIGIN}/comics/${stableSeriesId(slug)}`;
}

export function canonicalSeriesUrl(slug: string): string {
  return `${ASURA_ORIGIN}/comics/${slug}`;
}

export function parseAsuraRoute(input: string | URL): ParsedRoute | null {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return null;
  }

  if (url.hostname !== 'asurascans.com' && url.hostname !== 'www.asurascans.com') {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'comics' || !parts[1]) return null;
  if (parts.length === 2) return { pageType: 'series', slug: parts[1] };
  if (parts[2] === 'chapter' && parts[3]) {
    return {
      pageType: 'chapter',
      slug: parts[1],
      chapterId: decodeURIComponent(parts[3]),
    };
  }
  return null;
}

function chapterParts(id: string): number[] {
  const matches = id.match(/\d+/g);
  return matches?.map(Number) ?? [];
}

export function compareChapterIds(left: string, right: string): number {
  const leftParts = chapterParts(left);
  const rightParts = chapterParts(right);
  const count = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < count; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

export function maxChapter(chapters: ChapterRef[]): ChapterRef | undefined {
  return chapters.reduce<ChapterRef | undefined>((latest, chapter) => {
    if (!latest || compareChapterIds(chapter.id, latest.id) > 0) return chapter;
    return latest;
  }, undefined);
}

export function findNextChapter(
  chapters: ChapterRef[],
  current?: ChapterRef,
): ChapterRef | undefined {
  if (!current) return undefined;
  return chapters.reduce<ChapterRef | undefined>((next, candidate) => {
    if (compareChapterIds(candidate.id, current.id) <= 0) return next;
    if (!next || compareChapterIds(candidate.id, next.id) < 0) return candidate;
    return next;
  }, undefined);
}

export function isSeriesUnread(series: TrackedSeries): boolean {
  return Boolean(
    series.lastReadChapter &&
      series.latestFreeChapter &&
      compareChapterIds(series.latestFreeChapter.id, series.lastReadChapter.id) > 0,
  );
}

export function countUnreadSeries(series: TrackedSeries[]): number {
  return series.filter(isSeriesUnread).length;
}

export function createTrackedSeries(
  metadata: PageMetadata,
  now = new Date().toISOString(),
): TrackedSeries {
  const lastReadChapter = metadata.currentChapter?.availability === 'locked' ? undefined : metadata.currentChapter;
  return {
    slug: metadata.slug,
    title: metadata.title,
    canonicalUrl: metadata.canonicalUrl,
    coverUrl: metadata.coverUrl,
    status: 'reading',
    lastReadChapter,
    latestChapter: maxChapter([
      ...metadata.chapters,
      ...(metadata.currentChapter ? [metadata.currentChapter] : []),
    ]),
    latestFreeChapter: maxChapter(metadata.chapters.filter(isFreeChapter)),
    lockedChapters: metadata.chapters.filter((chapter) => chapter.availability === 'locked'),
    nextChapter: findNextChapter(metadata.chapters.filter(isFreeChapter), lastReadChapter),
    addedAt: now,
    updatedAt: now,
  };
}

function rebaseChapter(
  chapter: ChapterRef | undefined,
  canonicalUrl: string,
): ChapterRef | undefined {
  if (!chapter) return undefined;
  return {
    ...chapter,
    url: `${canonicalUrl.replace(/\/$/, '')}/chapter/${encodeURIComponent(chapter.id)}`,
  };
}

export function mergePageVisit(
  series: TrackedSeries,
  metadata: PageMetadata,
  now = new Date().toISOString(),
): TrackedSeries {
  let lastReadChapter = series.lastReadChapter;
  if (
    metadata.currentChapter &&
    metadata.currentChapter.availability !== 'locked' &&
    (!lastReadChapter ||
      compareChapterIds(metadata.currentChapter.id, lastReadChapter.id) > 0)
  ) {
    lastReadChapter = metadata.currentChapter;
  }

  const completeAvailability = metadata.pageType === 'series' && metadata.chapters.length > 0 &&
    metadata.chapters.every((chapter) => chapter.availability === 'free' || chapter.availability === 'locked');
  const observedLatest = maxChapter([
    ...metadata.chapters,
    ...(metadata.currentChapter ? [metadata.currentChapter] : []),
  ]);
  const latestChapter =
    observedLatest &&
    (!series.latestChapter ||
      compareChapterIds(observedLatest.id, series.latestChapter.id) > 0)
      ? observedLatest
      : series.latestChapter;

  return {
    ...series,
    slug: metadata.slug,
    title: metadata.title || series.title,
    canonicalUrl: metadata.canonicalUrl || series.canonicalUrl,
    coverUrl: metadata.coverUrl || series.coverUrl,
    lastReadChapter: rebaseChapter(lastReadChapter, metadata.canonicalUrl),
    latestChapter: rebaseChapter(latestChapter, metadata.canonicalUrl),
    latestFreeChapter: rebaseChapter(
      completeAvailability ? maxChapter(metadata.chapters.filter(isFreeChapter)) : series.latestFreeChapter,
      metadata.canonicalUrl,
    ),
    lockedChapters: (completeAvailability
      ? metadata.chapters.filter((chapter) => chapter.availability === 'locked')
      : series.lockedChapters)?.map((chapter) => rebaseChapter(chapter, metadata.canonicalUrl)!),
    nextChapter: rebaseChapter(
      completeAvailability
        ? findNextChapter(metadata.chapters.filter(isFreeChapter), lastReadChapter)
        : series.nextChapter && lastReadChapter &&
          compareChapterIds(series.nextChapter.id, lastReadChapter.id) > 0
          ? series.nextChapter : undefined,
      metadata.canonicalUrl,
    ),
    updatedAt: now,
  };
}

export function updateSeriesProgress(
  series: TrackedSeries,
  chapter: ChapterRef | undefined,
  now = new Date().toISOString(),
): TrackedSeries {
  return {
    ...series,
    lastReadChapter: chapter,
    nextChapter: undefined,
    updatedAt: now,
  };
}

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return [
    'reading',
    'plan-to-read',
    'completed',
    'on-hold',
    'dropped',
  ].includes(String(value));
}

export function toSeriesStorageKey(slug: string): string {
  return `${SERIES_KEY_PREFIX}${stableSeriesId(slug)}`;
}

export function isRefreshStale(lastChecked: number | undefined, now = Date.now()): boolean {
  return !lastChecked || now - lastChecked >= REFRESH_TTL_MS;
}

export function isFreeChapter(chapter: ChapterRef): boolean {
  return chapter.availability === 'free';
}

export function hasExpiredUnlock(series: TrackedSeries, checked = 0, now = Date.now()): boolean {
  return (series.lockedChapters ?? []).some((chapter) => {
    const until = Date.parse(chapter.unlockAt ?? '');
    return until <= now && until > checked;
  });
}
