export function adminReviewPage<T>(records: readonly T[], requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  const offset = (page - 1) * pageSize;
  return { page, totalPages, start: records.length ? offset + 1 : 0, end: Math.min(offset + pageSize, records.length), records: records.slice(offset, offset + pageSize) };
}
