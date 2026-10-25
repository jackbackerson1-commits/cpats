import { PRStatus } from '@prisma/client';

export interface QueueTiming {
  status: string;
  createdAt: string;
  auditLogs?: { createdAt: string; previousState: string | null; newState: string }[];
}
export interface QueueFilterRecord {
  createdAt?: string;
  department?: string;
  status?: string;
}
export interface QueueFilters {
  from: string;
  to: string;
  department: string;
  status: string;
}
export const emptyQueueFilters: QueueFilters = { from: '', to: '', department: '', status: '' };

// Dates in CPATS are interpreted in the institution's Philippine time zone.
export function submittedDay(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}
export function matchesQueueFilters(record: QueueFilterRecord, filters: QueueFilters): boolean {
  if (filters.from && filters.to && filters.from > filters.to) return false;
  const day = submittedDay(record.createdAt);
  return (!filters.department || record.department === filters.department) &&
    (!filters.status || record.status === filters.status) &&
    (!filters.from || !!day && day >= filters.from) &&
    (!filters.to || !!day && day <= filters.to);
}
export function currentStageSince(record: QueueTiming): string | undefined {
  if (record.status === PRStatus.Draft || record.status === PRStatus.Declined || record.status === PRStatus.Received_and_Closed) return undefined;
  const entry = record.auditLogs?.filter(event => event.newState === record.status && event.previousState !== event.newState && Number.isFinite(Date.parse(event.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  // Legacy first-review requests can use their original submission time.
  return entry?.createdAt || (record.status === PRStatus.Pending_Business_Approval && Number.isFinite(Date.parse(record.createdAt)) ? record.createdAt : undefined);
}
export function waitingTimeLabel(record: QueueTiming, now: number): string {
  if (record.status === PRStatus.Received_and_Closed || record.status === PRStatus.Declined) return 'No active waiting time';
  if (record.status === PRStatus.Draft) return 'Draft · not submitted';
  const since = currentStageSince(record);
  if (!since) return 'Stage start not recorded';
  const days = Math.floor(Math.max(0, now - Date.parse(since)) / 86_400_000);
  return `In current stage: ${days === 0 ? 'less than 1 day' : `${days} day${days === 1 ? '' : 's'}`}`;
}
