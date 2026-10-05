'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Role } from '@prisma/client';
import NotificationBell from '@/components/ui/NotificationBell';
import { BarChart3, ClipboardCheck, FilePlus2, ListChecks, LogOut, PackageCheck, ShieldCheck, Wallet } from 'lucide-react';

interface EnterpriseHeaderProps {
  activeRole?: Role;
  departmentCode?: string;
}

interface NavigationStep {
  name: string;
  number: string;
  href: string;
  allowedRoles: Role[];
}

const ROLE_LABELS: Record<string, string> = {
  Requesting_Office: 'Requesting Office',
  Business_Office: 'Business Office',
  Admin_Office: 'Admin Office',
  Purchasing_Office: 'Purchasing Office',
  Receiving_Custodian: 'Receiving Custodian',
  Global_Auditor: 'Global Auditor',
  System_Administrator: 'System Administrator',
};

export default function EnterpriseHeader({ activeRole: propRole, departmentCode: propCode }: EnterpriseHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<{ email: string; role: Role; departmentCode: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setSessionUser(res.data);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      setSigningOut(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
      setSigningOut(false);
    }
  };

  const displayRole = sessionUser?.role || propRole;
  const displayCode = sessionUser?.departmentCode || propCode || '—';
  const roleLabel = displayRole ? ROLE_LABELS[displayRole] ?? String(displayRole).replace(/_/g, ' ') : 'Loading account';
  const initial = roleLabel.charAt(0);

  // Define workflow routes and permitted roles
  const navigationSteps: NavigationStep[] = [
    { name: 'New Request', number: '01A', href: '/dashboard/pr/new', allowedRoles: [Role.Requesting_Office] },
    { name: 'Track Requests', number: '01B', href: '/dashboard/pr/track', allowedRoles: [Role.Requesting_Office] },
    { name: 'Business Eval', number: '02', href: '/dashboard/pr/evaluate-business', allowedRoles: [Role.Business_Office] },
    { name: 'Admin Sign-Off', number: '03', href: '/dashboard/pr/approve-admin', allowedRoles: [Role.Admin_Office] },
    { name: 'PO Generation', number: '04A', href: '/dashboard/po/new', allowedRoles: [Role.Purchasing_Office] },
    { name: 'Track Orders', number: '04T', href: '/dashboard/po/track', allowedRoles: [Role.Purchasing_Office] },
    { name: 'Monthly Reports', number: '04R', href: '/dashboard/po/reports', allowedRoles: [Role.Purchasing_Office] },
    { name: 'Check Release', number: '04B', href: '/dashboard/po/release-check', allowedRoles: [Role.Business_Office] },
    { name: 'Cargo Intake', number: '05', href: '/dashboard/receiving/new', allowedRoles: [Role.Receiving_Custodian] },
    { name: 'Audit Console', number: '06', href: '/dashboard/audit', allowedRoles: [Role.Global_Auditor] },
    { name: 'Staff Accounts', number: 'IT', href: '/dashboard/system/accounts', allowedRoles: [Role.System_Administrator] },
  ];

  // Filter navigation steps authorized for the active user's role
  const authorizedSteps = navigationSteps.filter((step) =>
    displayRole && step.allowedRoles.includes(displayRole)
  );

  const handleWorkflowNavigation = (
    event: React.MouseEvent<HTMLAnchorElement>,
    step: NavigationStep
  ) => {
    if (
      step.href === '/dashboard/pr/new' &&
      pathname === '/dashboard/pr/new' &&
      (new URLSearchParams(window.location.search).has('returnId') ||
        new URLSearchParams(window.location.search).has('declineId'))
    ) {
      event.preventDefault();
      window.location.assign(step.href);
    }
  };

  if (displayRole === Role.Requesting_Office) {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 py-2">
            <Link href="/dashboard" className="inline-flex min-w-0 items-center gap-2.5" aria-label="CPATS Requesting Office home">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-800 text-xs font-bold text-white">DMC</span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-slate-950">CPATS</span><span className="block text-xs text-slate-600">{displayCode} · Requesting Office</span></span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <button type="button" onClick={handleLogout} disabled={signingOut} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
                <LogOut className="size-4 shrink-0" aria-hidden="true" /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
          <nav className="flex gap-5" aria-label="Requesting Office navigation">
            {authorizedSteps.map((step) => {
              const isActive = pathname === step.href;
              const Icon = step.href === '/dashboard/pr/new' ? FilePlus2 : ListChecks;
              return <Link key={step.href} href={step.href} onClick={(event) => handleWorkflowNavigation(event, step)} aria-current={isActive ? 'page' : undefined} className={`inline-flex min-h-12 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition ${isActive ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{step.name}</Link>;
            })}
          </nav>
        </div>
      </header>
    );
  }

  if (displayRole === Role.Business_Office) {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 py-2">
            <Link href="/dashboard" className="inline-flex min-w-0 items-center gap-2.5" aria-label="CPATS Business Office home">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-800 text-xs font-bold text-white">DMC</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-950">CPATS</span>
                <span className="block break-words text-xs text-slate-600">{displayCode} · Business Office</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <button type="button" onClick={handleLogout} disabled={signingOut} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5" aria-label="Business Office navigation">
            {authorizedSteps.map((step) => {
              const isActive = pathname === step.href;
              const isEvaluation = step.href === '/dashboard/pr/evaluate-business';
              const Icon = isEvaluation ? ClipboardCheck : Wallet;
              return (
                <Link key={step.href} href={step.href} onClick={(event) => handleWorkflowNavigation(event, step)} aria-current={isActive ? 'page' : undefined} className={`inline-flex min-h-12 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition ${isActive ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {isEvaluation ? 'Fiscal Evaluation' : 'Financial Clearance'}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
    );
  }

  if (displayRole === Role.Admin_Office) {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 py-2">
            <Link href="/dashboard" className="inline-flex min-w-0 items-center gap-2.5" aria-label="CPATS Admin Office home">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-800 text-xs font-bold text-white">DMC</span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-slate-950">CPATS</span><span className="block break-words text-xs text-slate-600">{displayCode} · Admin Office</span></span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <button type="button" onClick={handleLogout} disabled={signingOut} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
                <LogOut className="size-4 shrink-0" aria-hidden="true" /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5" aria-label="Admin Office navigation">
            {authorizedSteps.map((step) => <Link key={step.href} href={step.href} onClick={(event) => handleWorkflowNavigation(event, step)} aria-current={pathname === step.href ? 'page' : undefined} className={`inline-flex min-h-12 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition ${pathname === step.href ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Executive Review</Link>)}
          </nav>
        </div>
      </header>
    );
  }

  if (displayRole === Role.Purchasing_Office) {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 py-2">
            <Link href="/dashboard" className="inline-flex min-w-0 items-center gap-2.5" aria-label="CPATS Purchasing Office home">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-800 text-xs font-bold text-white">DMC</span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-slate-950">CPATS</span><span className="block break-words text-xs text-slate-600">{displayCode} · Purchasing Office</span></span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <button type="button" onClick={handleLogout} disabled={signingOut} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
                <LogOut className="size-4 shrink-0" aria-hidden="true" /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5" aria-label="Purchasing Office navigation">
            {authorizedSteps.map((step) => <Link key={step.href} href={step.href} onClick={(event) => handleWorkflowNavigation(event, step)} aria-current={pathname === step.href ? 'page' : undefined} className={`inline-flex min-h-12 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition ${pathname === step.href ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>{step.href === '/dashboard/po/new' ? <FilePlus2 className="size-4 shrink-0" aria-hidden="true" /> : step.href === '/dashboard/po/track' ? <PackageCheck className="size-4 shrink-0" aria-hidden="true" /> : <BarChart3 className="size-4 shrink-0" aria-hidden="true" />}{step.href === '/dashboard/po/new' ? 'Prepare PO' : step.href === '/dashboard/po/track' ? 'Track Orders' : 'Monthly Reports'}</Link>)}
          </nav>
        </div>
      </header>
    );
  }

  if (displayRole === Role.Receiving_Custodian) {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 items-center justify-between gap-3 py-2">
            <Link href="/dashboard" className="inline-flex min-w-0 items-center gap-2.5" aria-label="CPATS Receiving Custodian home">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-800 text-xs font-bold text-white">DMC</span>
              <span className="min-w-0"><span className="block text-sm font-semibold text-slate-950">CPATS</span><span className="block break-words text-xs text-slate-600">{displayCode} · Receiving Custodian</span></span>
            </Link>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <button type="button" onClick={handleLogout} disabled={signingOut} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
                <LogOut className="size-4 shrink-0" aria-hidden="true" /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5" aria-label="Receiving Custodian navigation">
            {authorizedSteps.map((step) => <Link key={step.href} href={step.href} onClick={(event) => handleWorkflowNavigation(event, step)} aria-current={pathname === step.href ? 'page' : undefined} className={`inline-flex min-h-12 items-center gap-2 border-b-2 py-3 text-sm font-semibold transition ${pathname === step.href ? 'border-emerald-800 text-emerald-900' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}><PackageCheck className="size-4 shrink-0" aria-hidden="true" />Receive Delivery</Link>)}
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Identity Bar */}
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center space-x-3 group">
            <div className="h-9 w-9 rounded-lg bg-emerald-700 flex items-center justify-center shadow-sm group-hover:bg-emerald-800 transition-colors">
              <span className="font-bold text-white text-xs tracking-tight">DMC</span>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center space-x-2">
                <h1 className="text-sm font-bold tracking-tight text-slate-900">CPATS</h1>
                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  Session Active
                </span>
              </div>
              <p className="text-[11px] text-slate-400 -mt-0.5">
                Campus Procurement Automation &amp; Tracking System
              </p>
            </div>
          </Link>

          {/* User Session Info & Sign Out Button */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden md:flex items-center space-x-2.5 pr-4 border-r border-slate-200">
              <div className="h-8 w-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <span className="text-xs font-bold text-emerald-700">{initial}</span>
              </div>
              <div className="text-left">
                <span className="block text-xs font-bold text-slate-800 leading-tight">{roleLabel}</span>
                <span className="block text-[11px] text-slate-400 leading-tight">{displayCode} Department</span>
              </div>
            </div>

            <NotificationBell />

            <button
              onClick={handleLogout}
              disabled={signingOut}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors disabled:opacity-50 active:scale-95 cursor-pointer"
            >
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </div>

        {/* Workflow Stage Tabs */}
        {authorizedSteps.length > 1 && (
          <nav className="flex flex-wrap gap-1.5 pb-3" aria-label="Procurement workflow stages">
            {authorizedSteps.map((step) => {
              const isActive = pathname === step.href;
              return (
                <Link
                  key={step.href}
                  href={step.href}
                  onClick={(event) => handleWorkflowNavigation(event, step)}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:flex-none sm:px-3 sm:text-xs ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold shadow-2xs'
                      : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className={`font-mono text-[10px] ${isActive ? 'text-emerald-600' : 'text-slate-300'}`}>
                    {step.number}
                  </span>
                  {step.name}
                </Link>
              );
            })}
          </nav>
        )}

      </div>
    </header>
  );
}
