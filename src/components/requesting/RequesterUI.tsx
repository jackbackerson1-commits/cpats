import Link from 'next/link';
import { ArrowRight, Building2, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

// These presentation primitives belong to the Requesting Office only.
export const requesterFieldClass = 'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 placeholder:text-slate-500 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15 disabled:bg-slate-100 aria-[invalid=true]:border-rose-600';
export const requesterPrimaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700';
export const requesterSecondaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

export function RequesterPageHeader({ title, description, department, action }: {
  title: string;
  description: string;
  department: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 border-b border-slate-200 pb-6 sm:mb-8">
      <div className="mb-3 inline-flex max-w-full items-start gap-2 text-xs font-medium leading-5 text-emerald-800">
        <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">Requesting Office · {department}</span>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function RequesterSection({ id, number, title, description, children }: {
  id: string;
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-sm font-semibold text-emerald-800">{number}</span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function RequesterFieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-2 flex items-start gap-2 text-sm leading-5 text-rose-800"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{message}</span></p>;
}

export function TrackRequestsLink() {
  return <Link href="/dashboard/pr/track" className={requesterSecondaryClass}>Track requests<ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link>;
}
