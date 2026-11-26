import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Role, PRStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { MonthlyReportQuerySchema } from '../src/validation/monthly-report.schema';
import * as reporting from '../src/shared/monthly-report';
import * as policy from '../src/shared/online-purchase';
import * as purchaseMethod from '../src/shared/purchase-method';

test('monthly reports use enrolled totals and stages, preserve ordinary amounts and identify the original PO preparer', async () => {
  const queries: object[] = [];
  const base = {
    poNumber: 'PO-001', createdAt: new Date('2026-11-18T02:00:00Z'), paymentType: 'CASH_CHECK', isCheckIssued: true,
    receivingReports: [], purchaseRequest: {
      id: 'request', justification: 'Office supplies', status: PRStatus.Ready_for_Purchase,
      itemsPayload: [{ itemName: 'Printer', quantity: 2, unitPrice: 400 }],
      department: { code: 'DEPT', name: 'Department' }, auditLogs: [{ actor: { email: 'purchaser@example.test' } }],
    },
  };
  const prisma = { purchaseOrder: { findMany: async (query: object) => {
    queries.push(query);
    return [
      { ...base, onlinePurchase: { amount: '1100.00', stage: 'ORDERED' } },
      { ...base, purchaseMethod: 'ONLINE_CASH', onlinePurchase: { amount: '900.00', stage: 'AWAITING_ADMIN' } },
      { ...base, onlinePurchase: null },
      { ...base, purchaseMethod: 'SUPPLIER_CREDIT', paymentType: 'CREDIT_TERMS', isCheckIssued: false, onlinePurchase: null },
      { ...base, purchaseMethod: 'ONLINE_CASH', isCheckIssued: false, onlinePurchase: null },
    ];
  } } };
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse }, '@prisma/client': { PRStatus, Role }, '@/shared/prisma': { prisma },
    '@/validation/monthly-report.schema': { MonthlyReportQuerySchema }, '@/shared/monthly-report': reporting, '@/shared/online-purchase': policy,
    '@/shared/purchase-method': purchaseMethod,
    '@/shared/rbac': { authorizeRequest: async () => ({ success: true, user: { role: Role.Purchasing_Office, email: 'purchaser@example.test' } }) },
  };
  const exports: { GET?: (request: unknown) => Promise<Response> } = {};
  vm.runInNewContext(ts.transpileModule(readFileSync('src/app/api/po/reports/monthly/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, console, Date, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  const response = await exports.GET!({ nextUrl: new URL('http://localhost/api/po/reports/monthly?month=2026-11') });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.data.rows.map((row: { totalAmount: number | null }) => row.totalAmount), [1100, 900, 800, null, null]);
  assert.match(body.data.rows[0].financialStatus, /Order recorded.*provisional/i);
  assert.match(body.data.rows[1].financialStatus, /Awaiting Admin.*provisional/i);
  assert.equal(body.data.rows[2].financialStatus, reporting.describeFinancialStatus(base.paymentType as 'CASH_CHECK', true));
  assert.equal(body.data.rows[3].financialStatus, 'Awaiting Credit Clearance');
  assert.equal(body.data.rows[4].financialStatus, 'Awaiting Checkout Amount');
  assert.match(reporting.buildMonthlyReportCsv('November', '', '', body.data.rows), /,"","Supplier credit",/);
  assert.equal(body.data.summary.totalAmount, 2800);
  assert.equal(body.data.rows[0].preparedBy, 'purchaser@example.test');
  assert.match(JSON.stringify(queries[0]), /"onlinePurchaseAction":null/);
});
