import { themeAccent } from '../shared/theme';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), library: vi.fn(), summary: vi.fn(),
}));
vi.mock('./refresh', () => ({ refreshLibrary: mocks.refresh, refreshSeriesRecord: vi.fn() }));
vi.mock('../shared/storage', () => ({
  getLibrary: mocks.library, getSeries: vi.fn(), saveSeries: vi.fn(),
  removeSeries: vi.fn(), normalizeStorageError: vi.fn(),
}));
vi.mock('./notifications', () => ({ showStartupSummary: mocks.summary, STARTUP_NOTIFICATION_ID: 'summary' }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); vi.resetModules(); });

it('refreshes and summarizes only on startup, updates badge first, and opens library on click', async () => {
  const onStartup = vi.fn();
  const onInstalled = vi.fn();
  const onClicked = vi.fn();
  const tabs = vi.fn().mockResolvedValue({});
  const badge = vi.fn().mockResolvedValue(undefined);
  mocks.library.mockResolvedValue([]);
  mocks.refresh.mockResolvedValue({ updated: 1, skipped: 0, failures: [] });
  mocks.summary.mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    runtime: { onMessage: { addListener: vi.fn() }, onStartup: { addListener: onStartup },
      onInstalled: { addListener: onInstalled }, getURL: (path: string) => `chrome-extension://id/${path}` },
    action: { setBadgeBackgroundColor: vi.fn(), setBadgeText: badge },
    storage: { onChanged: { addListener: vi.fn() } },
    notifications: { onClicked: { addListener: onClicked }, clear: vi.fn() },
    tabs: { create: tabs },
  });
  await import('../background');
  expect(mocks.refresh).not.toHaveBeenCalled();
  onInstalled.mock.calls[0][0]();
  await vi.waitFor(() => expect(badge).toHaveBeenCalled());
  expect(mocks.summary).not.toHaveBeenCalled();
  expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: themeAccent });
  expect(badge).toHaveBeenLastCalledWith({ text: '' });
  mocks.library.mockResolvedValue([{ lastReadChapter: { id: '1' }, latestFreeChapter: { id: '2' } }]);
  onStartup.mock.calls[0][0]();
  await vi.waitFor(() => expect(mocks.summary).toHaveBeenCalledOnce());
  expect(mocks.refresh).toHaveBeenNthCalledWith(1, false);
  expect(mocks.refresh).toHaveBeenNthCalledWith(2, true);
  expect(badge.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.summary.mock.invocationCallOrder[0]);
  expect(badge).toHaveBeenLastCalledWith({ text: '1' });
  onClicked.mock.calls[0][0]('unrelated');
  expect(tabs).not.toHaveBeenCalled();
  onClicked.mock.calls[0][0]('summary');
  expect(tabs).toHaveBeenCalledWith({ url: 'chrome-extension://id/index.html' });
});
