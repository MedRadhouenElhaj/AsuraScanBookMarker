export const READING_STATUSES = [
  'reading',
  'plan-to-read',
  'completed',
  'on-hold',
  'dropped',
] as const;

export type ReadingStatus = (typeof READING_STATUSES)[number];

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: 'Reading',
  'plan-to-read': 'Plan to Read',
  completed: 'Completed',
  'on-hold': 'On Hold',
  dropped: 'Dropped',
};

export interface ChapterRef {
  id: string;
  url: string;
  availability?: 'free' | 'locked' | 'unknown';
  unlockAt?: string;
}

export interface PageMetadata {
  slug: string;
  pageType: 'series' | 'chapter';
  title: string;
  canonicalUrl: string;
  coverUrl?: string;
  currentChapter?: ChapterRef;
  chapters: ChapterRef[];
}

export interface TrackedSeries {
  slug: string;
  title: string;
  canonicalUrl: string;
  coverUrl?: string;
  status: ReadingStatus;
  lastReadChapter?: ChapterRef;
  latestChapter?: ChapterRef;
  latestFreeChapter?: ChapterRef;
  lockedChapters?: ChapterRef[];
  nextChapter?: ChapterRef;
  addedAt: string;
  updatedAt: string;
}

export type EditableSeriesPatch = Partial<
  Pick<TrackedSeries, 'status' | 'lastReadChapter'>
>;

export interface RefreshFailure {
  slug: string;
  message: string;
}

export interface RefreshResult {
  updated: number;
  skipped: number;
  failures: RefreshFailure[];
}

export interface ContinueResult {
  url: string;
  chapter?: ChapterRef;
  caughtUp: boolean;
}

export type StorageErrorCode = 'SYNC_QUOTA' | 'STORAGE_UNAVAILABLE' | 'UNKNOWN';

export interface ExtensionError {
  code: StorageErrorCode | 'NETWORK' | 'INVALID_REQUEST' | 'NOT_FOUND';
  message: string;
}

export type ExtensionMessage =
  | { type: 'GET_LIBRARY' }
  | { type: 'GET_SERIES'; slug: string }
  | { type: 'PAGE_VISITED'; metadata: PageMetadata }
  | { type: 'TRACK_SERIES'; metadata: PageMetadata }
  | { type: 'REMOVE_SERIES'; slug: string }
  | { type: 'UPDATE_SERIES'; slug: string; patch: EditableSeriesPatch }
  | { type: 'GET_CONTINUE_TARGET'; slug: string }
  | { type: 'REFRESH_LIBRARY'; force: boolean };

export type ExtensionResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExtensionError };
