import { isSeriesUnread } from '../shared/domain';
import type { ReadingStatus, TrackedSeries } from '../shared/types';

export type StatusFilter = 'all' | ReadingStatus;

export function filterLibrary(
  library: TrackedSeries[],
  search: string,
  status: StatusFilter,
): TrackedSeries[] {
  const query = search.trim().toLocaleLowerCase();
  return library
    .filter((series) => status === 'all' || series.status === status)
    .filter((series) => !query || series.title.toLocaleLowerCase().includes(query))
    .sort((left, right) => {
      const unreadDifference = Number(isSeriesUnread(right)) - Number(isSeriesUnread(left));
      if (unreadDifference !== 0) return unreadDifference;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}
