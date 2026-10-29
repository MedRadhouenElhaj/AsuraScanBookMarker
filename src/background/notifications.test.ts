import { afterEach, expect, it, vi } from 'vitest';
import { showStartupSummary } from './notifications';
import { countUnreadSeries, createTrackedSeries } from '../shared/domain';

const record = (title: string) => createTrackedSeries({
  slug: title, title, canonicalUrl: `https://asurascans.com/comics/${title}`,
  pageType: 'chapter', currentChapter: { id: '1', url: '/1' },
  chapters: [{ id: '2.5', url: '/2.5', availability: 'free' }],
});
afterEach(() => vi.unstubAllGlobals());
function setup(permission = 'granted') {
  const create = vi.fn().mockResolvedValue('summary');
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    notifications: { getPermissionLevel: (callback: (value: string) => void) => callback(permission), create },
  });
  return create;
}
it('groups titles, truncates at three, and excludes failed refreshes', async () => {
  const create = setup();
  await showStartupSummary(['A', 'B', 'C', 'D', 'E'].map(record), {
    updated: 4, skipped: 0, failures: [{ slug: 'E', message: 'offline' }],
  });
  expect(create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    title: '4 titles have free chapters ready',
    message: 'A: chapter 2.5\nB: chapter 2.5\nC: chapter 2.5\nand 1 more',
  }));
});
it('stays silent for empty results, total failure, unknown chapters and denied permission', async () => {
  const create = setup();
  await showStartupSummary([], { updated: 1, skipped: 0, failures: [] });
  await showStartupSummary([record('A')], { updated: 0, skipped: 0, failures: [] });
  await showStartupSummary([{ ...record('A'), latestFreeChapter: undefined }], { updated: 1, skipped: 0, failures: [] });
  expect(create).not.toHaveBeenCalled();
  const denied = setup('denied');
  await showStartupSummary([record('A')], { updated: 1, skipped: 0, failures: [] });
  expect(denied).not.toHaveBeenCalled();
});
it('contains notification failures', async () => {
  setup().mockRejectedValue(new Error('disabled'));
  await expect(showStartupSummary([record('A')], { updated: 1, skipped: 0, failures: [] })).resolves.toBeUndefined();
});

it('counts three free-update titles and excludes a premium-only fourth title', async () => {
  const create = setup();
  const premium = { ...record('Premium'), latestFreeChapter: { id: '1', url: '/1', availability: 'free' as const },
    latestChapter: { id: '2', url: '/2', availability: 'locked' as const },
    lockedChapters: [{ id: '2', url: '/2', availability: 'locked' as const }] };
  const library = [record('A'), record('B'), record('C'), premium];
  expect(countUnreadSeries(library)).toBe(3);
  await showStartupSummary(library, { updated: 4, skipped: 0, failures: [] });
  expect(create).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    title: '3 titles have free chapters ready', message: 'A: chapter 2.5\nB: chapter 2.5\nC: chapter 2.5',
  }));
});
