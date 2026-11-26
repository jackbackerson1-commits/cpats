'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Search, X } from 'lucide-react';
import type { WorkflowGuide as Guide } from '@/shared/workflow-guide';
import { matchesGuideSearch } from '@/shared/workflow-guide';
import waves from '@/components/requesting/requester-waves.module.css';
import styles from './admin-help.module.css';

export default function WorkflowGuide({ guide, waveBackground = false, waveAccent = false, compact = false }: { guide: Guide; waveBackground?: boolean; waveAccent?: boolean; compact?: boolean }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const tasks = guide.tasks.filter((task) => matchesGuideSearch(query, task.title, task.description));
  const answers = guide.answers.filter((entry) => matchesGuideSearch(query, entry.question, entry.answer));
  const clear = () => { setQuery(''); searchRef.current?.focus(); };
  return <main className={compact ? `${styles.page} mx-auto w-full` : 'mx-auto w-full max-w-[1920px] space-y-6 px-4 py-6 sm:px-6 lg:px-8'}>
    <section className={waveBackground ? `${waves.introduction}${waveAccent ? ` ${waves.adminIntroduction}` : ''}` : 'rounded-xl border border-slate-200 bg-white p-4 sm:p-6'} aria-labelledby="guide-title">
      <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><BookOpen className="size-5 shrink-0" aria-hidden="true" />CPATS help</p>
      <h1 id="guide-title" className="break-words text-2xl font-semibold text-slate-950 sm:text-3xl">{guide.roleLabel} guide</h1>
      <p className="mt-3 text-sm leading-6 text-slate-700">{guide.purpose}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">These instructions describe the current system. Your workspace shows the record’s latest status and available actions.</p>
    </section>
    <section aria-label="Search help" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <label htmlFor="guide-search" className="block text-sm font-semibold">Find a task or answer</label>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-56"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-600" /><input ref={searchRef} id="guide-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your role’s help…" className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm focus:outline-2 focus:outline-emerald-700" /></div>
        {query && <button type="button" onClick={clear} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700"><X className="size-4 shrink-0" aria-hidden="true" />Clear search</button>}
      </div>
      <p role="status" className="mt-3 text-sm text-slate-600">{tasks.length} task shortcuts · {answers.length} answers{query.trim() ? ' match your search' : ' for your role'}</p>
    </section>
    {!tasks.length && !answers.length && <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-semibold">No help matches this search</h2><p className="mt-2 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">Try a shorter phrase or clear the search to browse your role’s tasks and answers.</p><button type="button" onClick={clear} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700">Show all help</button></section>}
    {tasks.length > 0 && <section aria-labelledby="guide-tasks-title"><h2 id="guide-tasks-title" className="mb-3 text-lg font-semibold">Task shortcuts</h2><ul className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-3">{tasks.map((task) => <li key={task.href} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><h3 className="break-words text-base font-semibold [overflow-wrap:anywhere]">{task.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{task.description}</p><Link href={task.href} className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"><span className="break-words [overflow-wrap:anywhere]">Open {task.title.toLocaleLowerCase()}</span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link></li>)}</ul></section>}
    {answers.length > 0 && <section aria-labelledby="guide-answers-title"><h2 id="guide-answers-title" className="mb-3 text-lg font-semibold">Common questions</h2><div className="space-y-3">{answers.map((entry) => <details key={entry.question} open={Boolean(query.trim()) || undefined} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-700 [overflow-wrap:anywhere]">{entry.question}</summary><p className="mt-2 text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{entry.answer}</p></details>)}</div></section>}
  </main>;
}
