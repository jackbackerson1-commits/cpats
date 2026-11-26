'use client';

import { useEffect, useState } from 'react';
import { emptyQueueFilters, type QueueFilterRecord, type QueueFilters as FilterState, type QueueTiming, waitingTimeLabel } from '@/shared/queue-insights';

export function useQueueFilters() {
  return useState<FilterState>({ ...emptyQueueFilters });
}
const control = 'mt-1 min-h-11 w-full min-w-0 max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';
export function QueueFilters({ records, value, onChange, showStatus = true, onClear, compact = false }: {
  records: QueueFilterRecord[]; value: FilterState; onChange: (value: FilterState) => void; showStatus?: boolean; compact?: boolean; onClear?: () => void;
}) {
  const departments = [...new Set(records.map(record => record.department).filter((name): name is string => !!name))].sort();
  const statuses = [...new Set(records.map(record => record.status).filter((name): name is string => !!name))].sort();
  // Keep a selected option available even after a refresh or a history-tab switch.
  if (value.department && !departments.includes(value.department)) departments.push(value.department);
  if (value.status && !statuses.includes(value.status)) statuses.push(value.status);
  const invalid = !!value.from && !!value.to && value.from > value.to;
  return <div className="min-w-0 space-y-3">
    <div className={`grid min-w-0 gap-3 sm:grid-cols-2 ${compact ? 'xl:grid-cols-1' : ''}`}>
      <label className="min-w-0 text-xs font-medium text-slate-700">Submitted from<input type="date" value={value.from} onChange={event => onChange({ ...value, from: event.target.value })} aria-invalid={invalid} className={control} /></label>
      <label className="min-w-0 text-xs font-medium text-slate-700">Submitted through<input type="date" value={value.to} onChange={event => onChange({ ...value, to: event.target.value })} aria-invalid={invalid} className={control} /></label>
      {(departments.length > 1 || !!value.department) && <label className="min-w-0 text-xs font-medium text-slate-700">Department<select value={value.department} onChange={event => onChange({ ...value, department: event.target.value })} className={control}><option value="">All departments</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
      {showStatus && (statuses.length > 1 || !!value.status) && <label className="min-w-0 text-xs font-medium text-slate-700">Current status<select value={value.status} onChange={event => onChange({ ...value, status: event.target.value })} className={control}><option value="">All statuses</option>{statuses.map(name => <option key={name} value={name}>{name.replaceAll('_', ' ')}</option>)}</select></label>}
    </div>
    {invalid && <p role="alert" className="text-sm leading-6 text-rose-800">Choose an end date on or after the start date.</p>}
    <button type="button" onClick={() => { onChange({ ...emptyQueueFilters }); onClear?.(); }} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Clear filters</button>
    <p className="text-xs leading-5 text-slate-600">Submitted dates use Philippine time. Waiting time uses the latest recorded entry into the current stage; it is not a deadline.</p>
  </div>;
}
export function WaitingTime({ record }: { record: QueueTiming }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="mt-2 block break-words text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{waitingTimeLabel(record, now)}</span>;
}
