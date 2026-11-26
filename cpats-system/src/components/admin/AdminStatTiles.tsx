import { CheckCircle2, Clock3, Undo2, XCircle } from 'lucide-react';
import tracker from '../requesting/request-track.module.css';

export function AdminStatTiles({ counts, active, loading, onSelect }: { counts: readonly number[]; active: string; loading: boolean; onSelect: (filter: 'AWAITING' | 'APPROVED' | 'RETURNED' | 'DECLINED') => void }) {
  const tiles = [
    { id: 'AWAITING', label: 'Awaiting review', tone: 'progress', Icon: Clock3 },
    { id: 'APPROVED', label: 'Approved', tone: 'approved', Icon: CheckCircle2 },
    { id: 'RETURNED', label: 'Returned', tone: 'action', Icon: Undo2 },
    { id: 'DECLINED', label: 'Declined', tone: 'declined', Icon: XCircle },
  ] as const;
  return <section aria-label="Executive review summary" className={`${tracker.stats} admin-portal-stats`}>{tiles.map(({ id, label, tone, Icon }, index) => <button key={id} type="button" className={`${tracker.stat} admin-portal-stat`} data-tone={tone} aria-pressed={active === id} onClick={() => onSelect(id)}>
    <span className={tracker.statTop}><span>{label}</span><span className={tracker.statIcon}><Icon className="size-4 shrink-0" aria-hidden="true" /></span></span>
    <span className={tracker.statValue}>{loading ? '…' : counts[index]}</span>
  </button>)}</section>;
}

