export function auditPage<T>(records: readonly T[], requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  const offset = (page - 1) * pageSize;
  return { page, totalPages, start: records.length ? offset + 1 : 0, end: Math.min(offset + pageSize, records.length), records: records.slice(offset, offset + pageSize) };
}

interface RecordedEvent { id: string; previousState: string | null; newState: string; createdAt: string }
export function latestRecordedReturn<T extends RecordedEvent>(events: readonly T[]): T | undefined {
  return events.filter(event => event.newState === 'Returned_for_Correction' && event.previousState !== event.newState)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

// Audit reports supply newest-first logs. Preserve that order for tied timestamps,
// and keep each event's chronological number when reversing the display.
export function orderedAuditEvents<T>(events: readonly T[], order: 'latest' | 'oldest') {
  const numbered = events.map((log, index) => ({ log, number: events.length - index }));
  return order === 'latest' ? numbered : numbered.reverse();
}
