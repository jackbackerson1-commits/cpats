import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import { EmailOutboxStatus, PRStatus, Role } from '@prisma/client';
import * as policy from '../src/shared/online-purchase';

test('committed online events notify the next office and owning requester without false PO-prepared or credit-path changes', async () => {
  for (const event of ['SUBMIT', 'BO_APPROVE', 'BO_RETURN', 'ADMIN_APPROVE', 'ADMIN_RETURN', 'RELEASE_CHECK', 'RECORD_ORDER', 'CREATE_ONLINE_PO', 'CREATE_OTHER_PO']) {
    const creating = event.startsWith('CREATE_');
    const action = creating ? null : event;
    const created: { recipientId: string; title: string; message: string; actionPath: string }[] = [];
    let recipientFilter: unknown;
    const prisma = {
      auditLog: { findUnique: async () => ({ id: 'event', prId: 'request', onlinePurchaseAction: action, previousState: creating ? PRStatus.Approved_Awaiting_PO : PRStatus.Awaiting_Check_Issuance, newState: action === 'RECORD_ORDER' ? PRStatus.Ready_for_Purchase : PRStatus.Awaiting_Check_Issuance, actor: { role: Role.Purchasing_Office }, purchaseRequest: { departmentId: 'own-dept', department: { name: 'Own department' } } }) },
      purchaseOrder: { findFirst: async () => event === 'CREATE_ONLINE_PO' ? { id: 'online-po' } : null },
      user: { findMany: async ({ where }: { where: unknown }) => { recipientFilter = where; return Object.values(Role).map(role => ({ id: role, role, notificationPreference: null })); } },
      notification: { upsert: async ({ create }: { create: typeof created[number] }) => { created.push(create); return { id: create.recipientId }; } },
      emailOutbox: { findMany: async () => [] },
    };
    const modules: Record<string, unknown> = {
      crypto, '@prisma/client': { EmailOutboxStatus, Role, PRStatus }, '@/shared/prisma': { prisma }, '@/shared/online-purchase': policy,
      '@/shared/email': { getEmailDeliveryMode: () => 'log', sendEmail: () => { throw new Error('No live mail allowed'); } },
    };
    const exports: { dispatchNotificationForAuditLog?: (id: string) => Promise<void> } = {};
    const failures: unknown[] = [];
    vm.runInNewContext(ts.transpileModule(readFileSync('src/shared/notifications.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, process: { env: {} }, console: { error: (...details: unknown[]) => failures.push(details) }, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
    });
    await exports.dispatchNotificationForAuditLog!('event');
    assert.deepEqual(failures, []);
    if (event === 'CREATE_ONLINE_PO') {
      assert.equal(created.length, 1);
      assert.equal(created[0].recipientId, Role.Requesting_Office);
      assert.match(created[0].message, /gathering checkout evidence/);
      assert.doesNotMatch(JSON.stringify(recipientFilter), /Business_Office/);
      continue;
    }
    const next = policy.onlinePurchaseNotice(action);
    assert.equal(created.length, 2);
    assert.equal(created.find(row => row.recipientId === Role.Requesting_Office)?.title, next?.title || 'Purchase order prepared for your request');
    const office = created.find(row => row.recipientId !== Role.Requesting_Office)!;
    assert.equal(office.recipientId, next?.role || Role.Business_Office);
    assert.equal(office.actionPath, `${next?.actionPath || '/dashboard/po/release-check'}?prId=request`);
    assert.match(JSON.stringify(recipientFilter), /"departmentId":"own-dept"/);
    if (action) assert.doesNotMatch(office.message, /is now at Awaiting Check Issuance/);
  }
});
