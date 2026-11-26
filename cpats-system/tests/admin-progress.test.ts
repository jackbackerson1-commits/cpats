import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRStatus, Role } from '@prisma/client';
import { adminProgress, type ProgressEvent } from '../src/shared/admin-progress';

const event = (role: Role, previousState: PRStatus | null, newState: PRStatus): ProgressEvent => ({ actor: { role }, previousState, newState });

test('advanced status does not fabricate completion of stages with missing history', () => {
  assert.deepEqual(adminProgress(PRStatus.Ready_for_Purchase, []).map(step => step.state), ['upcoming', 'upcoming', 'upcoming', 'upcoming', 'current', 'upcoming']);
  assert.deepEqual(adminProgress(PRStatus.Received_and_Closed, []).map(step => step.state), ['upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'current']);
});

test('only recorded office transitions complete their corresponding stage', () => {
  const logs = [event(Role.Requesting_Office, null, PRStatus.Pending_Business_Approval), event(Role.Business_Office, PRStatus.Pending_Business_Approval, PRStatus.Pending_Admin_Approval)];
  assert.deepEqual(adminProgress(PRStatus.Pending_Admin_Approval, logs).map(step => step.state), ['complete', 'complete', 'current', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(adminProgress(PRStatus.Approved_Awaiting_PO, [...logs, event(Role.Admin_Office, PRStatus.Pending_Admin_Approval, PRStatus.Approved_Awaiting_PO)])[2].state, 'complete');
});

test('return and decline never mark executive approval complete; fiscal return never marks fiscal approval complete', () => {
  for (const state of [PRStatus.Returned_for_Correction, PRStatus.Declined]) {
    assert.equal(adminProgress(state, [event(Role.Admin_Office, PRStatus.Pending_Admin_Approval, state)])[2].state, 'upcoming');
    assert.equal(adminProgress(state, [event(Role.Business_Office, PRStatus.Pending_Business_Approval, state)])[1].state, 'upcoming');
  }
});

test('PO and receiving completion use their saved events, not current status or repeated updates', () => {
  const log = event(Role.Purchasing_Office, PRStatus.Approved_Awaiting_PO, PRStatus.Awaiting_Check_Issuance);
  assert.equal(adminProgress(PRStatus.Ready_for_Purchase, [log])[3].state, 'complete');
  assert.equal(adminProgress(PRStatus.Ready_for_Purchase, [{ ...log, previousState: log.newState }])[3].state, 'upcoming');
  const received = event(Role.Receiving_Custodian, PRStatus.Ready_for_Purchase, PRStatus.Received_and_Closed);
  assert.deepEqual(adminProgress(PRStatus.Received_and_Closed, [received]).slice(4).map(step => step.state), ['complete', 'complete']);
});
