'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { CheckCircle2, Clock3, Copy, Undo2, XCircle } from 'lucide-react';
import type { QueueTask } from './WorkflowUI';
import { waitingTimeLabel } from '@/shared/queue-insights';
import { WaitingTime } from './QueueFilters';
import styles from './review-presentation.module.css';

export function ReviewPreviewCard({ task, selected, onSelect }: {
  task: QueueTask; selected: boolean; onSelect: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const decision = task.decisionStatus;
  const label = decision === 'Pending_Admin_Approval' || decision === 'Approved_Awaiting_PO' ? 'Approved'
    : decision === 'Returned_for_Correction' ? 'Returned' : decision === 'Declined' ? 'Declined'
    : task.timing ? waitingTimeLabel(task.timing, now).replace('In current stage: ', 'Waiting ') : task.status?.replaceAll('_', ' ') || 'Awaiting review';
  const tone = label === 'Approved' ? 'approved' : label === 'Declined' ? 'declined' : 'waiting';
  const Icon = label === 'Approved' ? CheckCircle2 : label === 'Declined' ? XCircle : label === 'Returned' ? Undo2 : Clock3;
  return <button type="button" className={styles.card} aria-pressed={selected}
    aria-label={`${task.title} · ${label} · ${task.dateLabel}`} onClick={() => onSelect(task.id)}>
    <span className={styles.title} title={task.title}>{task.title}</span>
    <span className={styles.meta}><span className={styles.office} title={task.department}>{task.officeCode || task.department?.split(' · ')[0] || task.subtitle.split(/[•·]/)[0].trim()}</span>
      <span className={`${styles.badge} ${styles[tone]}`}><Icon size={12} aria-hidden="true" /><span>{label}</span></span></span>
    <span className={styles.footer}><time dateTime={task.dateTime || task.createdAt}>{task.dateLabel}</time><span title={task.id}>Ref …{task.id.slice(-8)}</span></span>
  </button>;
}

// Measure the actual remaining viewport, including wrapped controls and banners.
// Office adapters continue to own filtering, pagination and accepted selection.
export function useReviewViewport(root: RefObject<HTMLElement | null>, detail: RefObject<HTMLDivElement | null>, selectedId: string, enabled = true) {
  const previous = useRef(selectedId);
  useEffect(() => {
    if (previous.current !== selectedId && detail.current) detail.current.scrollTo({ top: 0, behavior: 'instant' });
    previous.current = selectedId;
  }, [selectedId, detail]);
  useEffect(() => {
    if (!enabled) return;
    const element = root.current, main = element?.closest('main');
    if (!element || !main) return;
    const measure = () => {
      const summary = detail.current?.querySelector('.business-request-summary,.admin-request-summary');
      if (summary) detail.current?.style.setProperty('--review-context-height', summary.getBoundingClientRect().height + 12 + 'px');
      const header = document.querySelector('header.sticky')?.getBoundingClientRect().height || 0;
      main.style.setProperty('--review-shell-height', header + 'px');
      element.style.setProperty('--review-height', Math.max(0, window.innerHeight - element.getBoundingClientRect().top - 12) + 'px');
    };
    const previousId = main.id;
    main.id = 'review-viewport-page';
    main.classList.add('review-viewport-page');
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    const context = detail.current?.querySelector('.business-request-summary,.admin-request-summary');
    if (context) observer.observe(context);
    for (const child of main.children) if (child !== element) observer.observe(child);
    const header = document.querySelector('header.sticky');
    if (header) observer.observe(header);
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); main.id = previousId; main.classList.remove('review-viewport-page'); main.style.removeProperty('--review-shell-height'); };
  }, [root, detail, selectedId, enabled]);
}

export function ReviewRecordHeader({ task, showJustification = false }: { task: QueueTask; showJustification?: boolean }) {
  const [feedback, setFeedback] = useState('');
  return <><section className="review-record-header" aria-label="Selected record context">
    <h2 className="line-clamp-2 text-base font-semibold">{task.title}</h2>
    <p className={styles.meta}><span className={styles.office}>{task.department?.split(' · ')[0] || task.subtitle}</span>
      <span className={`${styles.badge} ${styles.waiting}`}><Clock3 size={12} aria-hidden="true" />{task.status?.replaceAll('_', ' ') || 'Awaiting review'}</span></p>
    <div className="flex min-w-0 items-center gap-2 text-xs"><code className="min-w-0 flex-1 break-all">{task.id}</code>
      <button type="button" aria-label="Copy reference" className="rounded-lg border border-slate-300 bg-white p-2" onClick={async () => {
        try { await navigator.clipboard.writeText(task.id); setFeedback('Reference copied.'); }
        catch { setFeedback('Copy unavailable. Select the reference to copy it.'); }
      }}><Copy size={16} aria-hidden="true" /></button></div>
    <p role="status" className="text-xs">{feedback}</p>
  </section><div className="review-record-context p-3 text-sm text-slate-600">
    <p>{task.subtitle}</p>
    {task.timing && <WaitingTime record={task.timing} />}
    {showJustification && task.justificationPreview && <><h3 className="mt-3 font-semibold">Reason for the request</h3><p className="whitespace-pre-wrap break-words">{task.justificationPreview}</p></>}
  </div></>;
}
