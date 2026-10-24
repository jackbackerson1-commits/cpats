import { currentStageSince, type QueueTiming } from './queue-insights';

export type TrackingView = 'all' | 'active' | 'received';
export type TrackingSort = 'recent' | 'waiting';

export function matchesTrackingView(record: QueueTiming, view: TrackingView) {
  const closed = record.status === 'Received_and_Closed';
  return view === 'all' || (view === 'received' ? closed : !closed);
}

export function sortTrackingRecords<T extends QueueTiming & { id: string; updatedAt: string }>(records: readonly T[], sort: TrackingSort): T[] {
  return [...records].sort((a, b) => {
    if (sort === 'waiting') {
      const aSince = currentStageSince(a);
      const bSince = currentStageSince(b);
      // Recorded active waits come first; missing timing and closed records stay last.
      const waiting = (aSince ? Date.parse(aSince) : Infinity) - (bSince ? Date.parse(bSince) : Infinity);
      if (waiting && !Number.isNaN(waiting)) return waiting;
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id);
  });
}

export function trackingPage<T>(records: readonly T[], requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  const offset = (page - 1) * pageSize;
  return { page, totalPages, start: records.length ? offset + 1 : 0, end: Math.min(offset + pageSize, records.length), records: records.slice(offset, offset + pageSize) };
}
