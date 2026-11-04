'use client';

import { useEffect, useRef } from 'react';
import { CircleAlert } from 'lucide-react';
import type { SubmissionIssue } from '@/shared/submission-feedback';

export function SubmissionFeedback({ issue }: { issue: SubmissionIssue | null }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => { if (issue) notice.current?.focus({ preventScroll: false }); }, [issue]);
  if (!issue) return null;
  const informational = issue.kind === 'saved';
  return <div ref={notice} role={informational ? 'status' : 'alert'} tabIndex={-1}
    className={`my-4 flex min-w-0 scroll-mt-36 items-start gap-3 rounded-xl border p-4 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${informational ? 'border-sky-200 bg-sky-50 text-sky-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
    <CircleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
      <p className="font-semibold">{issue.title}</p>
      {issue.reference && <p className="mt-1 text-xs">Submission reference: {issue.reference}</p>}
      <p className="mt-1">{issue.message}</p>
      <p className="mt-2">{issue.guidance}</p>
    </div>
  </div>;
}
