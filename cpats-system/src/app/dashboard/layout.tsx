// src/app/dashboard/layout.tsx
import React from 'react';
import EnterpriseHeader from '@/components/ui/EnterpriseHeader';
import DmcCrestWatermark from '@/components/ui/DmcCrestWatermark';
import CpatsToaster from '@/components/ui/CpatsToaster';
import { UnsavedChangesProvider } from '@/components/ui/UnsavedChanges';
import { headers } from 'next/headers';
import { initialHeaderAccount } from '@/shared/header-account';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const initialUser = initialHeaderAccount(await headers());
  return (
    <UnsavedChangesProvider><div className="cpats-dashboard-shell relative bg-slate-50 font-sans text-slate-900 antialiased flex flex-col">
      {/* Centralized Institutional Seal Watermark */}
      <DmcCrestWatermark />

      {/* Centralized Header rendered for ALL dashboard pages */}
      <EnterpriseHeader initialUser={initialUser} />
      <CpatsToaster />

      {/* Page Content elevated above background watermark */}
      <div className="cpats-dashboard-content relative z-10">
        {children}
      </div>
    </div></UnsavedChangesProvider>
  );
}
