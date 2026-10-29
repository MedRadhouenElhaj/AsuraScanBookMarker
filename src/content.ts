import { themeCss } from './shared/theme';
import { brandIcon } from './shared/brand';
import { parseAsuraRoute } from './shared/domain';
import { extractPageMetadata } from './shared/extract';
import { sendExtensionMessage } from './shared/messages';
import type { PageMetadata, TrackedSeries } from './shared/types';
import { clampPanelPosition, type PanelPosition } from './content/panel';

const HOST_ID = 'asura-reading-tracker-root';
const CHECK_INTERVAL_MS = 1_000;
const POSITION_STORAGE_KEY = 'trackerPanelPosition';

let currentRouteKey = '';
let currentMetadata: PageMetadata | null = null;
let currentSeries: TrackedSeries | null = null;
let busy = false;
let errorMessage = '';
let dismissed = false;
let panelPosition: PanelPosition | null = null;
let positionLoaded = false;
let panelHasAnimated = false;

async function loadPanelPosition(): Promise<void> {
  if (positionLoaded) return;
  positionLoaded = true;
  const result = await chrome.storage.local.get(POSITION_STORAGE_KEY);
  const stored = result[POSITION_STORAGE_KEY] as Partial<PanelPosition> | undefined;
  if (Number.isFinite(stored?.x) && Number.isFinite(stored?.y)) {
    panelPosition = { x: Number(stored?.x), y: Number(stored?.y) };
  }
}

function ensureHost(): ShadowRoot {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.append(host);
  }
  return host.shadowRoot ?? host.attachShadow({ mode: 'open' });
}

function render(): void {
  if (!currentMetadata || dismissed) return;
  const shadow = ensureHost();
  const tracked = Boolean(currentSeries);
  const positionStyle = panelPosition
    ? `left:${panelPosition.x}px;top:${panelPosition.y}px;right:auto;bottom:auto;`
    : '';
  const chapterNote = currentMetadata.currentChapter
    ? `<span class="chapter">Chapter ${currentMetadata.currentChapter.id}</span>`
    : '';
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      ${themeCss}
      *, *::before, *::after { box-sizing: border-box; }
      .tracker {
        position: fixed;
        right: 18px;
        top: 72px;
        bottom: auto;
        z-index: 2147483647;
        width: min(320px, calc(100vw - 36px));
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
        color: var(--text);
        box-shadow: 0 18px 46px rgba(0,0,0,.38), 0 1px 0 rgba(255,255,255,.05) inset;
        font: 500 13px/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
        backdrop-filter: blur(18px) saturate(125%);
        transform-origin: top right;
      }
      .tracker.entering { animation: tracker-enter .36s cubic-bezier(.2,.8,.2,1) backwards; }
      .tracker.dragging { user-select: none; }
      .row { display: flex; align-items: center; gap: 10px; }
      .drag-handle {
        display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1;
        cursor: grab; touch-action: none;
      }
      .drag-handle:active { cursor: grabbing; }
      .drag-grip {
        display: grid; grid-template-columns: repeat(2, 2px); gap: 3px; flex: 0 0 auto;
        padding: 4px 1px; opacity: .5;
      }
      .drag-grip::before, .drag-grip::after {
        content: ''; width: 2px; height: 14px;
        background: radial-gradient(circle, var(--muted) 1px, transparent 1.2px) 0 0/2px 5px;
      }
      .mark { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 7px; }
      button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 3px; }
      .copy { min-width: 0; flex: 1; }
      .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 760; letter-spacing: -.01em; }
      .meta { display: flex; align-items: center; gap: 7px; margin-top: 4px; color: var(--muted); font-size: 10px; }
      .state {
        padding: 2px 6px; border-radius: 999px;
        background: ${tracked ? 'rgba(34,197,94,.12)' : 'var(--accent-soft)'};
        color: ${tracked ? '#86efac' : 'var(--accent-text)'};
        animation: status-pop .28s ease-out backwards;
      }
      button {
        border: 1px solid ${tracked ? 'var(--border)' : 'rgba(145,63,226,.45)'}; border-radius: 7px; padding: 8px 11px; cursor: pointer;
        background: ${tracked ? 'var(--surface-raised)' : 'var(--accent)'}; color: white;
        font: 700 12px/1 ui-sans-serif, system-ui, sans-serif;
        transition: transform .15s ease, filter .15s ease, border-color .15s ease;
      }
      button:hover { filter: brightness(1.08); transform: translateY(-1px); }
      button:active { transform: translateY(0) scale(.97); }
      button:disabled { opacity: .6; cursor: wait; }
      .close-button {
        display: grid; place-items: center; width: 26px; height: 26px; padding: 0;
        border: 1px solid transparent; background: transparent; color: var(--subtle);
        font-size: 17px; line-height: 1;
      }
      .close-button:hover { border-color: #ef4444; color: #fca5a5; }
      .error { margin-top: 8px; color: #fca5a5; font-size: 11px; animation: message-in .2s ease-out backwards; }
      @keyframes tracker-enter {
        from { opacity: 0; transform: translateY(-8px) scale(.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes status-pop {
        from { opacity: 0; transform: scale(.88); }
        to { opacity: 1; transform: scale(1); }
      }
      @keyframes message-in {
        from { opacity: 0; transform: translateY(-3px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @media (prefers-reduced-motion: reduce) {
        .tracker, .mark, .state, .error, button { animation: none !important; transition: none !important; }
      }
    </style>
    <aside class="tracker${panelHasAnimated ? '' : ' entering'}" style="${positionStyle}" aria-label="Asura Reading Tracker">
      <div class="row">
        <div class="drag-handle" title="Drag to move">
          <span class="drag-grip" aria-hidden="true"></span>
          <img class="mark" src="${brandIcon}" alt="" draggable="false" />
          <div class="copy">
            <div class="title" title="${escapeHtml(currentMetadata.title)}">${escapeHtml(currentMetadata.title)}</div>
            <div class="meta"><span class="state">${tracked ? 'Tracking' : 'Not tracked'}</span>${chapterNote}</div>
          </div>
        </div>
        <button type="button" ${busy ? 'disabled' : ''}>${busy ? 'Saving…' : tracked ? 'Remove' : 'Track'}</button>
        <button class="close-button" type="button" aria-label="Dismiss tracker" title="Dismiss">×</button>
      </div>
      ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    </aside>
  `;
  panelHasAnimated = true;
  shadow.querySelector<HTMLButtonElement>('button:not(.close-button)')?.addEventListener(
    'click',
    () => void toggleTracking(),
  );
  shadow.querySelector<HTMLButtonElement>('.close-button')?.addEventListener('click', dismissPanel);
  attachDragging(shadow);
}

function dismissPanel(): void {
  dismissed = true;
  document.getElementById(HOST_ID)?.remove();
}

function attachDragging(shadow: ShadowRoot): void {
  const panel = shadow.querySelector<HTMLElement>('.tracker');
  const handle = shadow.querySelector<HTMLElement>('.drag-handle');
  if (!panel || !handle) return;

  let pointerId: number | null = null;
  let startPointer: PanelPosition = { x: 0, y: 0 };
  let startPanel: PanelPosition = { x: 0, y: 0 };

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    pointerId = event.pointerId;
    startPointer = { x: event.clientX, y: event.clientY };
    startPanel = { x: rect.left, y: rect.top };
    handle.setPointerCapture(event.pointerId);
    panel.classList.add('dragging');
    event.preventDefault();
  });

  handle.addEventListener('pointermove', (event) => {
    if (pointerId !== event.pointerId) return;
    const rect = panel.getBoundingClientRect();
    const nextPosition = clampPanelPosition(
      {
        x: startPanel.x + event.clientX - startPointer.x,
        y: startPanel.y + event.clientY - startPointer.y,
      },
      { width: window.innerWidth, height: window.innerHeight },
      { width: rect.width, height: rect.height },
    );
    panel.style.left = `${nextPosition.x}px`;
    panel.style.top = `${nextPosition.y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panelPosition = nextPosition;
  });

  const finishDragging = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    pointerId = null;
    panel.classList.remove('dragging');
    if (panelPosition) void chrome.storage.local.set({ [POSITION_STORAGE_KEY]: panelPosition });
  };
  handle.addEventListener('pointerup', finishDragging);
  handle.addEventListener('pointercancel', finishDragging);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

async function toggleTracking(): Promise<void> {
  if (!currentMetadata || busy) return;
  if (currentSeries && !window.confirm(`Remove ${currentSeries.title} from your reading list?`)) {
    return;
  }

  busy = true;
  errorMessage = '';
  render();
  const response = currentSeries
    ? await sendExtensionMessage<null>({
        type: 'REMOVE_SERIES',
        slug: currentMetadata.slug,
      })
    : await sendExtensionMessage<TrackedSeries>({
        type: 'TRACK_SERIES',
        metadata: currentMetadata,
      });
  busy = false;
  if (response.ok) {
    currentSeries = currentSeries ? null : (response.data as TrackedSeries);
  } else {
    errorMessage = response.error.message;
  }
  render();
}

async function initializeForPage(): Promise<void> {
  const route = parseAsuraRoute(window.location.href);
  if (!route) {
    document.getElementById(HOST_ID)?.remove();
    currentMetadata = null;
    currentSeries = null;
    return;
  }

  const metadata = extractPageMetadata(document, window.location.href);
  if (!metadata) return;
  await loadPanelPosition();
  currentMetadata = metadata;
  errorMessage = '';

  const visitResponse = await sendExtensionMessage<TrackedSeries | null>({
    type: 'PAGE_VISITED',
    metadata,
  });
  if (visitResponse.ok) currentSeries = visitResponse.data;
  else {
    const lookupResponse = await sendExtensionMessage<TrackedSeries | null>({
      type: 'GET_SERIES',
      slug: metadata.slug,
    });
    currentSeries = lookupResponse.ok ? lookupResponse.data : null;
    errorMessage = visitResponse.error.message;
  }
  render();
}

function checkRoute(): void {
  const route = parseAsuraRoute(window.location.href);
  const routeKey = route
    ? `${route.pageType}:${route.slug}:${route.chapterId ?? ''}`
    : window.location.pathname;
  if (routeKey === currentRouteKey) return;
  currentRouteKey = routeKey;
  dismissed = false;
  panelHasAnimated = false;
  void initializeForPage();
}

checkRoute();
window.addEventListener('popstate', checkRoute);
setInterval(checkRoute, CHECK_INTERVAL_MS);
