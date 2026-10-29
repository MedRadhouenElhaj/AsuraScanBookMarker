import { themeAccent } from './shared/theme';
import {
  countUnreadSeries,
  hasExpiredUnlock,
  createTrackedSeries,
  isReadingStatus,
  mergePageVisit,
} from './shared/domain';
import {
  getLibrary,
  getSeries,
  normalizeStorageError,
  removeSeries,
  saveSeries,
} from './shared/storage';
import type {
  ExtensionError,
  ExtensionMessage,
  ExtensionResponse,
  TrackedSeries,
} from './shared/types';
import { showStartupSummary, STARTUP_NOTIFICATION_ID } from './background/notifications';
import { refreshLibrary, refreshSeriesRecord } from './background/refresh';

async function updateBadge(): Promise<void> {
  const unread = countUnreadSeries(await getLibrary());
  await chrome.action.setBadgeBackgroundColor({ color: themeAccent });
  await chrome.action.setBadgeText({ text: unread > 0 ? String(unread) : '' });
}

function success<T>(data: T): ExtensionResponse<T> {
  return { ok: true, data };
}

function failure(error: ExtensionError): ExtensionResponse<never> {
  return { ok: false, error };
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse<unknown>> {
  try {
    switch (message.type) {
      case 'GET_LIBRARY':
        return success(await getLibrary());
      case 'GET_SERIES':
        return success((await getSeries(message.slug)) ?? null);
      case 'PAGE_VISITED': {
        const existing = await getSeries(message.metadata.slug);
        if (!existing) return success(null);
        const updated = mergePageVisit(existing, message.metadata);
        await saveSeries(updated);
        if (hasExpiredUnlock(updated)) {
          try { await refreshSeriesRecord(updated); } catch { /* Preserve page data on failure. */ }
        }
        await updateBadge();
        return success((await getSeries(updated.slug)) ?? updated);
      }
      case 'TRACK_SERIES': {
        const existing = await getSeries(message.metadata.slug);
        const updated = existing
          ? mergePageVisit(existing, message.metadata)
          : createTrackedSeries(message.metadata);
        await saveSeries(updated);
        await updateBadge();
        return success(updated);
      }
      case 'REMOVE_SERIES':
        await removeSeries(message.slug);
        await updateBadge();
        return success(null);
      case 'UPDATE_SERIES': {
        const existing = await getSeries(message.slug);
        if (!existing) {
          return failure({ code: 'NOT_FOUND', message: 'That title is no longer tracked.' });
        }
        if (message.patch.status && !isReadingStatus(message.patch.status)) {
          return failure({ code: 'INVALID_REQUEST', message: 'Unknown reading status.' });
        }
        const updated: TrackedSeries = {
          ...existing,
          ...message.patch,
          nextChapter:
            Object.prototype.hasOwnProperty.call(message.patch, 'lastReadChapter')
              ? undefined
              : existing.nextChapter,
          updatedAt: new Date().toISOString(),
        };
        await saveSeries(updated);
        await updateBadge();
        return success(updated);
      }
      case 'GET_CONTINUE_TARGET': {
        const existing = await getSeries(message.slug);
        if (!existing) {
          return failure({ code: 'NOT_FOUND', message: 'That title is no longer tracked.' });
        }

        if (existing.nextChapter?.availability === 'free') {
          return success({
            url: existing.nextChapter.url,
            chapter: existing.nextChapter,
            caughtUp: false,
          });
        }

        if (!existing.lastReadChapter) {
          return success({ url: existing.canonicalUrl, caughtUp: false });
        }

        try {
          const refreshed = await refreshSeriesRecord(existing);
          return success({
            url: refreshed.nextChapter?.url ?? refreshed.canonicalUrl,
            chapter: refreshed.nextChapter,
            caughtUp: !refreshed.nextChapter,
          });
        } catch (error) {
          return failure({
            code: 'NETWORK',
            message:
              error instanceof Error
                ? `Could not find the next chapter: ${error.message}`
                : 'Could not find the next chapter.',
          });
        }
      }
      case 'REFRESH_LIBRARY': {
        const result = await refreshLibrary(message.force);
        await updateBadge();
        return success(result);
      }
      default:
        return failure({ code: 'INVALID_REQUEST', message: 'Unknown extension request.' });
    }
  } catch (error) {
    return failure(normalizeStorageError(error));
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void refreshLibrary(false).then(updateBadge).catch(() => updateBadge()).catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    try {
      const result = await refreshLibrary(true);
      await updateBadge();
      await showStartupSummary(await getLibrary(), result);
    } catch { await updateBadge(); }
  })().catch(() => undefined);
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === STARTUP_NOTIFICATION_ID) {
    void chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    void chrome.notifications.clear(id);
  }
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'sync') void updateBadge();
});
