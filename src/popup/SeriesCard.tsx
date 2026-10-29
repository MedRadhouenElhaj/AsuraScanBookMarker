import { useEffect, useState } from 'react';
import { isSeriesUnread } from '../shared/domain';
import { READING_STATUSES, STATUS_LABELS } from '../shared/types';
import type { ReadingStatus, TrackedSeries } from '../shared/types';

interface SeriesCardProps {
  series: TrackedSeries;
  onStatusChange: (slug: string, status: ReadingStatus) => Promise<void>;
  onProgressChange: (slug: string, chapterId: string) => Promise<void>;
  onRemove: (series: TrackedSeries) => Promise<void>;
  onOpen: (url: string) => void;
  onContinue: (series: TrackedSeries) => Promise<void>;
}

export function SeriesCard({
  series,
  onStatusChange,
  onProgressChange,
  onRemove,
  onOpen,
  onContinue,
}: SeriesCardProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [editing, setEditing] = useState(false);
  const [chapterId, setChapterId] = useState(series.lastReadChapter?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [validation, setValidation] = useState('');
  const unread = isSeriesUnread(series);

  async function saveProgress(): Promise<void> {
    const nextValue = chapterId.trim();
    if (!/^\d+(?:[.-]\d+)*$/.test(nextValue)) {
      setValidation('Use a chapter number such as 42 or 152.10.');
      return;
    }
    setSaving(true);
    setValidation('');
    await onProgressChange(series.slug, nextValue);
    setSaving(false);
    setEditing(false);
  }

  async function markAllRead(): Promise<void> {
    if (!series.latestFreeChapter) return;
    setSaving(true);
    setValidation('');
    setChapterId(series.latestFreeChapter.id);
    await onProgressChange(series.slug, series.latestFreeChapter.id);
    setSaving(false);
    setEditing(false);
  }

  async function continueReading(): Promise<void> {
    setContinuing(true);
    await onContinue(series);
    setContinuing(false);
  }

  return (
    <article className="series-card">
      <button
        className="cover-button"
        type="button"
        title={`Open ${series.title}`}
        onClick={() => onOpen(series.canonicalUrl)}
      >
        {series.coverUrl ? (
          <img className="cover" src={series.coverUrl} alt="" />
        ) : (
          <span className="cover-fallback">A</span>
        )}
      </button>

      <div className="card-content">
        <div className="title-row">
          <button className="series-title" type="button" onClick={() => onOpen(series.canonicalUrl)}>
            {series.title}
          </button>
          {unread && <span className="new-pill">New</span>}
        </div>

        <div className="progress-line">
          <span>Read {series.lastReadChapter?.id ?? '—'}</span>
          <span className="progress-divider">→</span>
          <span>Free {series.latestFreeChapter?.id ?? '—'}</span>
        </div>

        {(series.lockedChapters ?? []).map((chapter) => (
          <p className="locked-release" key={chapter.id}>
            Chapter {chapter.id} locked{chapter.unlockAt
              ? Date.parse(chapter.unlockAt) > now
                ? ` · Free in ${Math.ceil((Date.parse(chapter.unlockAt) - now) / 60000)} min`
                : ' · Awaiting availability check'
              : ''}
          </p>
        ))}

        {editing ? (
          <div className="edit-progress">
            <label>
              <span className="sr-only">Last read chapter</span>
              <input
                autoFocus
                value={chapterId}
                placeholder="Chapter"
                onChange={(event) => setChapterId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveProgress();
                  if (event.key === 'Escape') setEditing(false);
                }}
              />
            </label>
            <button type="button" disabled={saving} onClick={() => void saveProgress()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="read-all-button"
              type="button"
              disabled={saving || !series.latestFreeChapter}
              title={series.latestFreeChapter ? `Mark through chapter ${series.latestFreeChapter.id} as read` : 'Latest chapter unknown'}
              onClick={() => void markAllRead()}
            >
              Read all
            </button>
            <button className="quiet-button" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {validation && <p className="field-error">{validation}</p>}
          </div>
        ) : (
          <div className="card-controls">
            <select
              aria-label={`Status for ${series.title}`}
              value={series.status}
              onChange={(event) =>
                void onStatusChange(series.slug, event.target.value as ReadingStatus)
              }
            >
              {READING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <button className="text-button" type="button" onClick={() => setEditing(true)}>
              Edit progress
            </button>
          </div>
        )}

        <div className="card-actions">
          <button
            className="primary-button"
            type="button"
            disabled={continuing}
            onClick={() => void continueReading()}
          >
            {continuing ? 'Finding next…' : 'Continue reading'}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove ${series.title}`}
            title="Remove"
            onClick={() => void onRemove(series)}
          >
            ×
          </button>
        </div>
      </div>
    </article>
  );
}
