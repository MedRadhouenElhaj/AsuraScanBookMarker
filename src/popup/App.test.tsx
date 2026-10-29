import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { sendExtensionMessage } from '../shared/messages';
import { createTrackedSeries } from '../shared/domain';
import type { ExtensionResponse, RefreshResult, TrackedSeries } from '../shared/types';

vi.mock('../shared/messages', () => ({ sendExtensionMessage: vi.fn() }));
const send = vi.mocked(sendExtensionMessage);
const series = createTrackedSeries({ slug: 'mage', title: 'Infinite Mage', canonicalUrl: 'https://asurascans.com/comics/mage', pageType: 'series', chapters: [] });
const refreshed: ExtensionResponse<RefreshResult> = { ok: true, data: { updated: 0, failures: [], skipped: 0 } };
const failure = { ok: false, error: { code: 'STORAGE_UNAVAILABLE', message: 'Unable to load library.' } } as const;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mount() {
  vi.stubGlobal('chrome', { storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } });
  return render(<App />);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

it.each(['populated', 'empty', 'error'])('clears skeletons when initial loading finishes: %s', async (state) => {
  const initial = deferred<ExtensionResponse<TrackedSeries[]>>();
  send.mockReturnValueOnce(initial.promise).mockResolvedValueOnce(refreshed)
    .mockResolvedValue(state === 'error' ? failure : { ok: true, data: state === 'empty' ? [] : [series] });
  const { container } = mount();
  expect(screen.getByRole('status')).toHaveTextContent('Loading your library');
  expect(container.querySelectorAll('.skeleton-card')).toHaveLength(3);
  expect(container.querySelector('.skeleton-list')).toHaveAttribute('aria-hidden', 'true');
  expect(container.querySelector('.library-list')).toHaveAttribute('aria-busy', 'true');
  await act(async () => initial.resolve(state === 'error' ? failure : { ok: true, data: state === 'empty' ? [] : [series] }));
  await waitFor(() => expect(container.querySelector('.library-list')).toHaveAttribute('aria-busy', 'false'));
  expect(container.querySelector('.skeleton-list')).not.toBeInTheDocument();
  expect(container.querySelector('.refresh-shimmer')).not.toBeInTheDocument();
  if (state === 'populated') expect(screen.getByText('Infinite Mage')).toBeInTheDocument();
  if (state === 'empty') expect(screen.getByText('Your list is ready')).toBeInTheDocument();
  if (state === 'error') expect(screen.getByRole('alert')).toHaveTextContent('Unable to load library.');
});

it.each([true, false])('keeps cards usable and clears automatic/manual refresh shimmer (success=%s)', async (success) => {
  const automatic = deferred<ExtensionResponse<RefreshResult>>();
  const manual = deferred<ExtensionResponse<RefreshResult>>();
  send.mockImplementation((message) => {
    if (message.type === 'GET_LIBRARY') return Promise.resolve({ ok: true, data: [series] });
    if (message.type === 'REFRESH_LIBRARY') return message.force ? manual.promise : automatic.promise;
    return Promise.resolve({ ok: true, data: null });
  });
  const { container } = mount();
  await screen.findByText('Infinite Mage');
  expect(screen.getByRole('status')).toHaveTextContent('Refreshing your library');
  expect(container.querySelector('.refresh-shimmer')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.getByRole('button', { name: 'Continue reading' })).toBeEnabled();
  await act(async () => automatic.resolve(refreshed));
  await waitFor(() => expect(container.querySelector('.refresh-shimmer')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Refresh latest chapters' }));
  expect(container.querySelector('.refresh-shimmer')).toBeInTheDocument();
  await act(async () => manual.resolve(success ? refreshed : failure));
  await waitFor(() => expect(container.querySelector('.library-list')).toHaveAttribute('aria-busy', 'false'));
  expect(container.querySelector('.refresh-shimmer')).not.toBeInTheDocument();
  expect(screen.getByText('Infinite Mage')).toBeInTheDocument();
  if (!success) expect(screen.getByRole('alert')).toBeInTheDocument();
});
