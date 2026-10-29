import {
  REFRESH_KEY_PREFIX,
  isFreeChapter,
  hasExpiredUnlock,
  canonicalSeriesUrl,
  findNextChapter,
  isRefreshStale,
  maxChapter,
  parseAsuraRoute,
  stableSeriesId,
  stableSeriesUrl,
} from '../shared/domain';
import { extractChaptersFromHtml } from '../shared/extract';
import { getLibrary, saveSeries } from '../shared/storage';
import type { RefreshFailure, RefreshResult, TrackedSeries } from '../shared/types';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CONCURRENCY = 3;
export const AVAILABILITY_CACHE_VERSION = 1;

async function getLastChecked(slug: string): Promise<number | undefined> {
  const key = `${REFRESH_KEY_PREFIX}${stableSeriesId(slug)}`;
  const result = await chrome.storage.local.get(key);
  const cached = result[key] as { version?: number; checkedAt?: number } | undefined;
  return cached?.version === AVAILABILITY_CACHE_VERSION && typeof cached.checkedAt === 'number'
    ? cached.checkedAt : undefined;
}

async function markChecked(slug: string, timestamp: number): Promise<void> {
  await chrome.storage.local.set({
    [`${REFRESH_KEY_PREFIX}${stableSeriesId(slug)}`]: {
      version: AVAILABILITY_CACHE_VERSION, checkedAt: timestamp,
    },
  });
}

export async function refreshSeriesRecord(
  series: TrackedSeries,
  now = Date.now(),
): Promise<TrackedSeries> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(stableSeriesUrl(series.slug), {
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Asura returned HTTP ${response.status}.`);
    const resolvedRoute = parseAsuraRoute(response.url);
    if (!resolvedRoute || resolvedRoute.pageType !== 'series') {
      throw new Error('Asura did not resolve the current series URL.');
    }
    const resolvedCanonicalUrl = canonicalSeriesUrl(resolvedRoute.slug);
    const chapters = extractChaptersFromHtml(await response.text(), resolvedCanonicalUrl);
    if (chapters.length === 0) throw new Error('No chapters were found on the series page.');
    if (chapters.some((chapter) => chapter.availability !== 'free' && chapter.availability !== 'locked')) {
      throw new Error('Chapter availability could not be verified. Previous reading data was preserved.');
    }

    const updatedSeries: TrackedSeries = {
      ...series,
      slug: resolvedRoute.slug,
      canonicalUrl: resolvedCanonicalUrl,
      lastReadChapter: series.lastReadChapter
        ? {
            id: series.lastReadChapter.id,
            url: `${resolvedCanonicalUrl}/chapter/${encodeURIComponent(series.lastReadChapter.id)}`,
          }
        : undefined,
      latestChapter: maxChapter(chapters),
      latestFreeChapter: maxChapter(chapters.filter(isFreeChapter)),
      lockedChapters: chapters.filter((chapter) => chapter.availability === 'locked'),
      nextChapter: findNextChapter(chapters.filter(isFreeChapter), series.lastReadChapter),
      updatedAt: new Date(now).toISOString(),
    };
    await saveSeries(updatedSeries);
    await markChecked(series.slug, now);
    return updatedSeries;
  } finally {
    clearTimeout(timeout);
  }
}

export async function refreshLibrary(force: boolean): Promise<RefreshResult> {
  const library = await getLibrary();
  const now = Date.now();
  const queue: TrackedSeries[] = [];
  let skipped = 0;

  for (const series of library) {
    const lastChecked = await getLastChecked(series.slug);
    if (!force && !isRefreshStale(lastChecked, now) && !hasExpiredUnlock(series, lastChecked, now)) skipped += 1;
    else queue.push(series);
  }

  let updated = 0;
  const failures: RefreshFailure[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < queue.length) {
      const series = queue[nextIndex];
      nextIndex += 1;
      try {
        await refreshSeriesRecord(series, now);
        updated += 1;
      } catch (error) {
        failures.push({
          slug: series.slug,
          message:
            error instanceof DOMException && error.name === 'AbortError'
              ? 'The refresh timed out.'
              : error instanceof Error
                ? error.message
                : 'The refresh failed.',
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, () => worker()),
  );
  return { updated, skipped, failures };
}
