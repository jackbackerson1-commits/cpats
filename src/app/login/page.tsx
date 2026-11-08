'use client';

import Image from 'next/image';
import Link from 'next/link';
import styles from './login.module.css';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  LoaderCircle,
  Eye,
  EyeOff,
  HelpCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
  X,
} from 'lucide-react';

const SAMPLE_TIMELINE = [
  { title: 'Request submitted', detail: 'Nursing Office · Oct 19, 9:12 AM', state: 'complete' },
  { title: 'Reviewed and authorized', detail: 'Dean · Oct 19, 2:40 PM', state: 'complete' },
  { title: 'Delivered and recorded', detail: 'Property Custodian · Awaiting receipt', state: 'current' },
  { title: 'Audit verification', detail: 'Pending · After delivery', state: 'pending' },
];

function BrandMark() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative size-12 shrink-0 rounded-full bg-white p-1 lg:size-16">
        <Image
          src="/dmc-logo.png"
          alt="DMC College Foundation, Inc. seal"
          fill
          sizes="(min-width: 1024px) 64px, 48px"
          className="object-contain"
          priority
        />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white lg:text-base">
          DMC College Foundation, Inc.
        </p>
        <p className="mt-1 max-w-80 text-[11px] leading-relaxed text-emerald-100 lg:text-xs">
          Campus Procurement Automation &amp; Tracking System
        </p>
      </div>
    </div>
  );
}

function SupportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;

    if (!dialog.open) {
      dialog.showModal();
    }

    document.body.style.overflow = 'hidden';

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="support-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;

        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;

        if (outside) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-[#cbd8d1] bg-white p-6 text-slate-900 shadow-xl backdrop:bg-[#063d2d]/70 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between gap-4">
        <HelpCircle
          className="size-6 text-emerald-800"
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close institutional IT support"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <h3
        id="support-dialog-title"
        className="mt-3 text-xl font-semibold"
      >
        Institutional IT support
      </h3>

      <p className="mt-3 text-sm leading-6 text-slate-600">
        You can request a reset link from the sign-in page. If you cannot
        access your verified school mailbox, contact your institution&apos;s
        designated IT office for identity-checked recovery.
      </p>

      <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-slate-500">Office</dt>
          <dd className="text-right font-semibold">
            MIS &amp; Systems Center
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-slate-500">Internal extension</dt>
          <dd className="font-semibold">Local 104</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-slate-500">Email</dt>
          <dd className="min-w-0 text-right font-semibold">
            <a
              href="mailto:mis-support@dmc.edu.ph"
              className="break-all text-emerald-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              mis-support@dmc.edu.ph
            </a>
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 min-h-11 rounded-lg bg-emerald-800 px-5 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      >
        Close
      </button>
    </dialog>
  );
}

export default function InstitutionalLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            'Authentication failed. Check your email and password.',
        );
      }

      router.push('/dashboard');
      router.refresh();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'We could not verify this account. Check your email and password.',
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClassName =
    'h-[52px] w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-500 hover:border-slate-400 focus:border-emerald-800 focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 aria-invalid:border-rose-500 aria-invalid:bg-rose-50/30 aria-invalid:focus:ring-rose-600';

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.brand} aria-label="About CPATS">
          <div className={styles.watermark} aria-hidden="true">
            <Image src="/dmc-logo.png" alt="" fill sizes="640px" className="object-contain" />
          </div>
          <header className={styles.brandHeader}><BrandMark /></header>
          <div className={styles.brandContent}>
            <h1 className={styles.headline}>
              Every request carries its history <span>with it.</span>
            </h1>
            <p className={styles.supporting}>
              One shared record connects every office, from the first requisition to receiving and audit.
            </p>
            <div className={styles.previewArea}>
              <div className={styles.previewGlow} aria-hidden="true" />
              <div className={styles.backCard} aria-hidden="true" />
              <article className={styles.preview} aria-label="Sample requisition record">
                <div className={styles.previewEyebrow}>
                  <span>Sample record</span>
                  <span className={styles.statusChip}>In progress</span>
                </div>
                <h2 className={styles.recordTitle}>PR-2026-0142 <span>· Laboratory Supplies</span></h2>
                <ol className={styles.timeline}>
                  {SAMPLE_TIMELINE.map((step) => (
                    <li key={step.title} className={styles.timelineStep}>
                      <span className={`${styles.stepIcon} ${styles[step.state]}`} aria-hidden="true">
                        {step.state === 'complete' && <Check className="size-3.5" strokeWidth={2.5} />}
                        {step.state === 'current' && <span />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{step.detail}</p>
                        <span className="sr-only">{step.state === 'complete' ? 'Completed' : step.state === 'current' ? 'Current step' : 'Pending'}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            </div>
          </div>
          <footer className={styles.brandFooter}>© 2026 DMC College Foundation, Inc.</footer>
        </section>

        <section className={styles.formPanel} aria-labelledby="sign-in-heading">
          <div className={styles.formCard}>
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-emerald-900/10 bg-emerald-50 text-emerald-900">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold tracking-[0.12em] text-emerald-800">SECURE STAFF ACCESS</p>
            <h2 id="sign-in-heading" className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.035em] sm:text-[34px]">Sign in to CPATS</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Use the institutional account assigned to your office.</p>
            {errorMessage && (
              <div id="sign-in-error" role="alert" aria-live="assertive" className="mt-6 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <p className="font-semibold">Sign-in failed</p>
                <p className="mt-1 break-words leading-5">{errorMessage}</p>
              </div>
            )}
              <form
                onSubmit={handleLogin}
                aria-busy={loading}
                aria-describedby={
                  errorMessage ? 'sign-in-error' : undefined
                }
                className="mt-8 space-y-6"
              >
                <div>
                  <label
                    htmlFor="institutional-email"
                    className="mb-2 block text-xs font-semibold lg:text-sm"
                  >
                    Institutional email
                  </label>

                  <div className="group relative">
                    <Mail
                      className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-emerald-800"
                      aria-hidden="true"
                    />

                    <input
                      id="institutional-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@dmc.edu.ph"
                      aria-invalid={errorMessage ? true : undefined}
                      aria-describedby={errorMessage ? 'sign-in-error' : undefined}
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
                    <label
                      htmlFor="institutional-password"
                      className="text-xs font-semibold lg:text-sm"
                    >
                      Password
                    </label>

                    <Link
                      href="/reset-password"
                      className="-my-2 inline-flex min-h-11 items-center text-xs text-emerald-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                      Forgot password?
                    </Link>
                  </div>

                  <div className="group relative">
                    <LockKeyhole
                      className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-emerald-800"
                      aria-hidden="true"
                    />

                    <input
                      id="institutional-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      aria-invalid={errorMessage ? true : undefined}
                      aria-describedby={errorMessage ? 'sign-in-error' : undefined}
                      className={`${inputClassName} pr-14`}
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((current) => !current)
                      }
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-200/60 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                      {showPassword ? (
                        <EyeOff
                          className="size-[18px]"
                          aria-hidden="true"
                        />
                      ) : (
                        <Eye
                          className="size-[18px]"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`group ${styles.submit} inline-flex h-[52px] w-full items-center justify-between gap-3 rounded-xl bg-[#0f3d2e] px-5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60`}
                >
                  <span>
                    {loading ? 'Verifying account…' : 'Sign in'}
                  </span>
                  {loading ? (
                    <LoaderCircle className={`size-5 shrink-0 ${styles.spinner}`} aria-hidden="true" />
                  ) : (
                    <ArrowRight className="size-5 shrink-0 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden="true" />
                  )}
                </button>
              </form>
            <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-800" aria-hidden="true" />
              Sign-in attempts and procurement actions are recorded.
            </p>
            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <button type="button" onClick={() => setShowSupportModal(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded text-xs font-medium text-emerald-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                Need access? Contact institutional IT
                <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </div>
          <footer className={styles.systemFooter}>
            <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-700" aria-hidden="true" />All systems operational</span>
            <span>CPATS v0.1.0</span>
          </footer>
          <p className={styles.mobileCopyright}>© 2026 DMC College Foundation, Inc.</p>
        </section>
      </div>
      <SupportDialog open={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </main>
  );
}
