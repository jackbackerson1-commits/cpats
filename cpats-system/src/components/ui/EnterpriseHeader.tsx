'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Role } from '@prisma/client';
import { useUnsavedNavigation } from '@/components/ui/UnsavedChanges';
import NotificationBell from '@/components/ui/NotificationBell';
import { ASSET_REGISTER_ROLES } from '@/shared/asset-access';
import './compact-header.css';
import type { HeaderAccount } from '@/shared/header-account';
import '@/components/admin/admin-review-workspace.css';
import '@/components/ui/portal-tokens.css';
import '@/components/requesting/requester-portal.css';
import '@/components/purchasing/purchasing-portal.css';
import '@/components/admin/admin-portal.css';
import '@/components/receiving/receiving-portal.css';
import '@/components/business/business-portal.css';
import '@/components/audit/auditor-portal.css';
import '@/components/account/system-portal.css';
import { BarChart3, BookOpen, ClipboardCheck, FilePlus2, ListChecks, LogOut, PackageCheck, QrCode, ShieldCheck, UsersRound, Wallet, Menu, X } from 'lucide-react';

function HelpNavigationLink({ active = false }: { active?: boolean }) {
  // Keep native Help navigation and the existing before-unload protection.
  return <a href="/dashboard/help" aria-current={active ? 'page' : undefined} className="cpats-header-link"><BookOpen className="size-4 shrink-0" aria-hidden="true" />Help</a>;
}

function DashboardLogo() {
  return <Image src="/dmc-logo.png" alt="DMC College Foundation, Inc. seal" width={40} height={40} sizes="40px" className="cpats-header-logo" priority />;
}

interface EnterpriseHeaderProps {
  initialUser?: HeaderAccount | null;
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

export default function EnterpriseHeader({ initialUser = null, activeRole: propRole, departmentCode: propCode }: EnterpriseHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const requestNavigation = useUnsavedNavigation();
  const [sessionUser, setSessionUser] = useState<HeaderAccount | null>(initialUser);
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);
  const mobileRef = useRef<HTMLButtonElement>(null);
  const initial = displayCode === '—' ? roleLabel.charAt(0) : displayCode.charAt(0);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) accountRef.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  useEffect(() => {
    if (displayRole !== Role.Receiving_Custodian) return;
    const header = document.querySelector<HTMLElement>('header.receiving-portal-header');
    const shell = header?.parentElement;
    if (!header || !shell) return;
    const measure = () => shell.style.setProperty('--receiving-shell-height', header.getBoundingClientRect().height + 'px');
    const observer = new ResizeObserver(measure);
    observer.observe(header); measure();
    return () => { observer.disconnect(); shell.style.removeProperty('--receiving-shell-height'); };
  }, [displayRole]);

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
    { name: 'Receiving history', number: '05H', href: '/dashboard/receiving/history', allowedRoles: [Role.Receiving_Custodian] },
    { name: 'Audit Console', number: '06', href: '/dashboard/audit', allowedRoles: [Role.Global_Auditor] },
    { name: 'Asset register', number: 'QR', href: '/dashboard/assets', allowedRoles: ASSET_REGISTER_ROLES },
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

  const systemPortal = displayRole === Role.System_Administrator && ['/dashboard/system/accounts', '/dashboard/help', '/dashboard/notifications'].includes(pathname);
  const roleClass = displayRole === Role.Business_Office ? 'business-portal-header business-evaluation-header'
    : displayRole === Role.Admin_Office ? 'admin-portal-header'
    : displayRole === Role.Purchasing_Office ? 'purchasing-portal-header' + (pathname === '/dashboard/assets' ? ' purchasing-assets-header' : '')
    : displayRole === Role.Receiving_Custodian ? 'receiving-portal-header receiving-intake-header' + (pathname === '/dashboard/assets' ? ' receiving-assets-header' : '')
    : displayRole === Role.Global_Auditor ? 'auditor-portal-header auditor-header' + (pathname === '/dashboard/assets' ? ' auditor-assets-header' : '')
    : systemPortal ? 'system-portal-header system-accounts-header' : '';
  function presentation(step: NavigationStep) {
    if (displayRole === Role.Requesting_Office) return { label: step.name, Icon: step.href === '/dashboard/pr/new' ? FilePlus2 : ListChecks };
    if (displayRole === Role.Business_Office) return { label: step.href === '/dashboard/pr/evaluate-business' ? 'Fiscal Evaluation' : 'Financial Clearance', Icon: step.href === '/dashboard/pr/evaluate-business' ? ClipboardCheck : Wallet };
    if (displayRole === Role.Admin_Office) return { label: 'Executive Review', Icon: ShieldCheck };
    if (displayRole === Role.Purchasing_Office) return { label: step.href === '/dashboard/po/new' ? 'Prepare PO' : step.href === '/dashboard/po/track' ? 'Track Orders' : step.href === '/dashboard/assets' ? 'Asset register' : 'Monthly Reports', Icon: step.href === '/dashboard/po/new' ? FilePlus2 : step.href === '/dashboard/po/track' ? PackageCheck : step.href === '/dashboard/assets' ? QrCode : BarChart3 };
    if (displayRole === Role.Receiving_Custodian) return { label: step.href === '/dashboard/assets' ? 'Asset register' : step.href === '/dashboard/receiving/history' ? 'Receiving history' : 'Receive Delivery', Icon: PackageCheck };
    if (displayRole === Role.Global_Auditor) return { label: step.href === '/dashboard/assets' ? 'Asset register' : 'Audit ledger', Icon: ListChecks };
    return { label: step.name, Icon: systemPortal ? UsersRound : null };
  }
  return <header id="cpats-header" className={'requester-portal-header sticky top-0 z-50 ' + roleClass}>
    <div className="cpats-header-inner">
      <Link href="/dashboard" className="cpats-header-brand" aria-label={'CPATS ' + roleLabel + ' home'}>
        <DashboardLogo /><span className="cpats-header-wordmark">CPATS <span className="cpats-header-institution">DMCCFI</span></span>
      </Link>
      <nav id="cpats-primary-navigation" className="cpats-header-nav" data-open={mobileOpen} aria-label={roleLabel + ' navigation'} onKeyDown={event => {
        if (event.key === 'Escape') { setMobileOpen(false); mobileRef.current?.focus(); }
      }}>
        {authorizedSteps.map(step => {
          const { label, Icon } = presentation(step);
          return <Link key={step.href} href={step.href} onClick={event => { handleWorkflowNavigation(event, step); setMobileOpen(false); }} aria-current={pathname === step.href ? 'page' : undefined} className="cpats-header-link"><>{Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : <span className="font-mono text-xs">{step.number}</span>}{label}</></Link>;
        })}
        <HelpNavigationLink active={pathname === '/dashboard/help'} />
      </nav>
      <div className="cpats-header-actions">
        <NotificationBell />
        <details ref={accountRef} className="cpats-account" onToggle={event => setAccountOpen(event.currentTarget.open)} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false;
        }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); event.currentTarget.open = true;
            const element = event.currentTarget; requestAnimationFrame(() => element.querySelector('button')?.focus());
          }
        }}>
          <summary role="button" aria-label={'Account: ' + displayCode + ' - ' + roleLabel} aria-haspopup="menu" aria-expanded={accountOpen} className="cpats-avatar">{initial}</summary>
          <div role="menu" aria-label="User account" className="cpats-account-dropdown">
            <p className="cpats-account-name">{displayCode} - {roleLabel}</p>
            {sessionUser?.email && <p className="cpats-account-email">{sessionUser.email}</p>}
            <button type="button" role="menuitem" disabled={signingOut} onClick={() => requestNavigation(handleLogout)}><LogOut className="size-4 shrink-0" aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </details>
        <button ref={mobileRef} type="button" className="cpats-mobile-toggle" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} aria-controls="cpats-primary-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button>
      </div>
    </div>
  </header>;
}
