import { isSeriesUnread, stableSeriesId } from '../shared/domain';
import type { RefreshResult, TrackedSeries } from '../shared/types';

export const STARTUP_NOTIFICATION_ID = 'free-chapter-startup-summary';

export async function showStartupSummary(library: TrackedSeries[], result: RefreshResult): Promise<void> {
  if (!result.updated) return;
  const failed = new Set(result.failures.map((failure) => stableSeriesId(failure.slug)));
  const ready = library.filter((series) => !failed.has(stableSeriesId(series.slug)) && isSeriesUnread(series))
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!ready.length) return;
  const lines = ready.slice(0, 3).map((series) => `${series.title}: chapter ${series.latestFreeChapter!.id}`);
  if (ready.length > 3) lines.push(`and ${ready.length - 3} more`);
  try {
    const permission = await new Promise<string>((resolve) => chrome.notifications.getPermissionLevel(resolve));
    if (permission !== 'granted') return;
    await chrome.notifications.create(STARTUP_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `${ready.length} ${ready.length === 1 ? 'title has' : 'titles have'} free chapters ready`,
      message: lines.join('\n'),
    });
  } catch { /* Notifications may be disabled by Chrome or the operating system. */ }
}
