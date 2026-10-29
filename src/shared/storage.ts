import {
  REFRESH_KEY_PREFIX,
  SERIES_KEY_PREFIX,
  compareChapterIds,
  stableSeriesId,
  toSeriesStorageKey,
} from './domain';
import type { ChapterRef } from './types';
import type { ExtensionError, TrackedSeries } from './types';

function isTrackedSeries(value: unknown): value is TrackedSeries {
  if (!value || typeof value !== 'object') return false;
  const series = value as Partial<TrackedSeries>;
  return Boolean(
    series.slug &&
      series.title &&
      series.canonicalUrl &&
      series.status &&
      series.addedAt &&
      series.updatedAt,
  );
}

export function readSeriesEntries(items: Record<string, unknown>): TrackedSeries[] {
  const records = Object.entries(items)
    .filter(([key]) => key.startsWith(SERIES_KEY_PREFIX))
    .map(([, value]) => value)
    .filter(isTrackedSeries);
  const consolidated = new Map<string, TrackedSeries[]>();
  for (const record of records) {
    const id = stableSeriesId(record.slug);
    consolidated.set(id, [...(consolidated.get(id) ?? []), record]);
  }
  return [...consolidated.values()].map(mergeSeriesRecords);
}

function newestChapter(chapters: Array<ChapterRef | undefined>): ChapterRef | undefined {
  return chapters.filter((chapter): chapter is ChapterRef => Boolean(chapter)).reduce<
    ChapterRef | undefined
  >((newest, chapter) => {
    if (!newest || compareChapterIds(chapter.id, newest.id) > 0) return chapter;
    return newest;
  }, undefined);
}

function nextChapterAfter(
  chapters: Array<ChapterRef | undefined>,
  lastRead: ChapterRef | undefined,
): ChapterRef | undefined {
  if (!lastRead) return undefined;
  return chapters.filter((chapter): chapter is ChapterRef =>
    Boolean(chapter && compareChapterIds(chapter.id, lastRead.id) > 0),
  ).reduce<ChapterRef | undefined>((next, chapter) => {
    if (!next || compareChapterIds(chapter.id, next.id) < 0) return chapter;
    return next;
  }, undefined);
}

export function mergeSeriesRecords(records: TrackedSeries[]): TrackedSeries {
  const sorted = [...records].sort(
    (left, right) =>
      new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime(),
  );
  const newest = sorted[sorted.length - 1];
  const lastReadChapter = newestChapter(records.map((record) => record.lastReadChapter));
  const latestChapter = newestChapter(records.map((record) => record.latestChapter));
  return {
    ...newest,
    lastReadChapter,
    latestChapter,
    nextChapter: nextChapterAfter(
      [newest.nextChapter].filter((chapter) => chapter?.availability === 'free'),
      lastReadChapter,
    ),
    addedAt: records.reduce(
      (earliest, record) => (record.addedAt < earliest ? record.addedAt : earliest),
      newest.addedAt,
    ),
  };
}

async function migrateLibrary(items: Record<string, unknown>): Promise<TrackedSeries[]> {
  const library = readSeriesEntries(items);
  const updates: Record<string, TrackedSeries> = {};
  const removals: string[] = [];

  for (const series of library) {
    const stableKey = toSeriesStorageKey(series.slug);
    const storedAtStableKey = items[stableKey];
    if (!isTrackedSeries(storedAtStableKey) || JSON.stringify(storedAtStableKey) !== JSON.stringify(series)) {
      updates[stableKey] = series;
    }
  }

  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(SERIES_KEY_PREFIX) || !isTrackedSeries(value)) continue;
    if (key !== toSeriesStorageKey(value.slug)) removals.push(key);
  }

  if (Object.keys(updates).length > 0) await chrome.storage.sync.set(updates);
  if (removals.length > 0) await chrome.storage.sync.remove(removals);
  return library;
}

export function normalizeStorageError(error: unknown): ExtensionError {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('quota') || lowerMessage.includes('max_write')) {
    return {
      code: 'SYNC_QUOTA',
      message: 'Chrome Sync storage is full or temporarily rate-limited. Try again later or remove an item.',
    };
  }
  return {
    code: 'STORAGE_UNAVAILABLE',
    message: message || 'Chrome storage is unavailable.',
  };
}

export async function getLibrary(): Promise<TrackedSeries[]> {
  const items = (await chrome.storage.sync.get(null)) as Record<string, unknown>;
  return (await migrateLibrary(items)).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
}

export async function getSeries(slug: string): Promise<TrackedSeries | undefined> {
  const stableId = stableSeriesId(slug);
  return (await getLibrary()).find((series) => stableSeriesId(series.slug) === stableId);
}

export async function saveSeries(series: TrackedSeries): Promise<void> {
  await chrome.storage.sync.set({ [toSeriesStorageKey(series.slug)]: series });
}

export async function removeSeries(slug: string): Promise<void> {
  const stableId = stableSeriesId(slug);
  const items = (await chrome.storage.sync.get(null)) as Record<string, unknown>;
  const matchingKeys = Object.entries(items)
    .filter(
      ([key, value]) =>
        key.startsWith(SERIES_KEY_PREFIX) &&
        isTrackedSeries(value) &&
        stableSeriesId(value.slug) === stableId,
    )
    .map(([key]) => key);
  if (matchingKeys.length > 0) await chrome.storage.sync.remove(matchingKeys);
  await chrome.storage.local.remove([
    `${REFRESH_KEY_PREFIX}${stableId}`,
    `${REFRESH_KEY_PREFIX}${slug}`,
  ]);
}
