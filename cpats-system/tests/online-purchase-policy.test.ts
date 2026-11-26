import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { OnlinePurchaseActionSchema, onlinePurchaseTransition, onlinePurchaseNotice, ONLINE_PURCHASE_POLICY } from '../src/shared/online-purchase';

const poId = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';

test('temporary policy requires exact BO and Admin approval before check release and ordering', () => {
  assert.equal(ONLINE_PURCHASE_POLICY.version, 1);
  assert.equal(onlinePurchaseTransition('SUBMIT', 'RETURNED', Role.Purchasing_Office), 'AWAITING_BO');
  assert.equal(onlinePurchaseTransition('BO_APPROVE', 'AWAITING_BO', Role.Business_Office), 'AWAITING_ADMIN');
  assert.equal(onlinePurchaseTransition('ADMIN_APPROVE', 'AWAITING_ADMIN', Role.Admin_Office), 'AUTHORIZED');
  assert.equal(onlinePurchaseTransition('RELEASE_CHECK', 'AUTHORIZED', Role.Business_Office), 'CHECK_RELEASED');
  assert.equal(onlinePurchaseTransition('RECORD_ORDER', 'CHECK_RELEASED', Role.Purchasing_Office), 'ORDERED');
  for (const stage of ['AWAITING_BO', 'AWAITING_ADMIN', 'RETURNED', 'CHECK_RELEASED', 'ORDERED']) {
    assert.throws(() => onlinePurchaseTransition('RELEASE_CHECK', stage, Role.Business_Office));
  }
  for (const role of [Role.Requesting_Office, Role.Receiving_Custodian, Role.System_Administrator, Role.Global_Auditor]) {
    assert.throws(() => onlinePurchaseTransition('ADMIN_APPROVE', 'AWAITING_ADMIN', role));
  }
});

test('resubmission always invalidates approvals before release and is blocked after release', () => {
  for (const stage of ['AWAITING_BO', 'AWAITING_ADMIN', 'AUTHORIZED', 'RETURNED']) {
    assert.equal(onlinePurchaseTransition('SUBMIT', stage, Role.Purchasing_Office), 'AWAITING_BO');
  }
  for (const stage of ['CHECK_RELEASED', 'ORDERED']) assert.throws(() => onlinePurchaseTransition('SUBMIT', stage, Role.Purchasing_Office));
  assert.equal(onlinePurchaseTransition('BO_RETURN', 'AWAITING_BO', Role.Business_Office), 'RETURNED');
  assert.equal(onlinePurchaseTransition('ADMIN_RETURN', 'AWAITING_ADMIN', Role.Admin_Office), 'RETURNED');
});

test('totals, evidence and check details are required without permitting client approval flags', () => {
  const submit = { action: 'SUBMIT', poId, version: 0, amount: '1000.00', documentId };
  assert.equal(OnlinePurchaseActionSchema.safeParse(submit).success, true);
  for (const amount of ['0', '-1', '1.001', 'NaN', '1e3', '1000000000000']) assert.equal(OnlinePurchaseActionSchema.safeParse({ ...submit, amount }).success, false);
  assert.equal(OnlinePurchaseActionSchema.safeParse({ ...submit, approved: true }).success, false);
  assert.equal(OnlinePurchaseActionSchema.safeParse({ ...submit, documentId: 'bad' }).success, false);
  assert.equal(OnlinePurchaseActionSchema.safeParse({ action: 'RELEASE_CHECK', poId, version: 2, checkNumber: 'CHK-001', payee: 'Purchaser' }).success, true);
  assert.equal(OnlinePurchaseActionSchema.safeParse({ action: 'RELEASE_CHECK', poId, version: 2 }).success, false);
  assert.equal(OnlinePurchaseActionSchema.safeParse({ action: 'BO_RETURN', poId, version: 2, notes: ' ' }).success, false);
});

test('event notifications reach the actual next actor and distinguish provisional decisions from PR approval', () => {
  for (const [action, role] of [['SUBMIT', Role.Business_Office], ['BO_APPROVE', Role.Admin_Office], ['ADMIN_APPROVE', Role.Business_Office], ['RELEASE_CHECK', Role.Purchasing_Office], ['RECORD_ORDER', Role.Receiving_Custodian]] as const) {
    const notice = onlinePurchaseNotice(action)!;
    assert.equal(notice.role, role);
    assert.match(notice.description, /online/i);
  }
  assert.equal(onlinePurchaseNotice(undefined), undefined);
});
