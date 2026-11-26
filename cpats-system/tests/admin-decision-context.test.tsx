import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import { AdminDecisionContext, AdminContextEvent } from '../src/components/admin/AdminDecisionContext';

const fiscal: AdminContextEvent = { id: 'fiscal', previousState: PRStatus.Pending_Business_Approval, newState: PRStatus.Pending_Admin_Approval, actor: {role: Role.Business_Office, email: 'finance@example.invalid'}, createdAt: '2026-10-08T08:11:00Z', remarks: 'Saved fiscal approval', businessNecessityVerified: true, businessBudgetAvailable: null };
const admin: AdminContextEvent = { ...fiscal, id: 'admin', previousState: PRStatus.Pending_Admin_Approval, newState: PRStatus.Declined, actor: {role: Role.Admin_Office, email: 'admin@example.invalid'}, createdAt: '2026-10-08T08:12:00Z', remarks: 'Saved decline reason' };
const render = (status: PRStatus, logs: readonly AdminContextEvent[]) => renderToStaticMarkup(<AdminDecisionContext status={status} logs={logs} />);

test('decline merges status, decision, reason and attribution ahead of historical fiscal approval', () => {
  const html = render(PRStatus.Declined, [admin, fiscal]);
  assert.match(html, /1 · Current status and latest decision/);
  assert.match(html, /Latest saved decision: Declined — Admin Office/);
  assert.match(html, /This decline is final/);
  assert.match(html, /2 · Earlier Business Office review · Historical/);
  assert.match(html, /Approved at the fiscal-review stage/);
  assert.ok(html.indexOf('Saved decline reason') < html.indexOf('Saved fiscal approval'));
  assert.equal(html.split('Saved decline reason').length - 1, 1);
  assert.match(html, /admin@example.invalid/); assert.match(html, /finance@example.invalid/);
  assert.match(html, /Confirmed/); assert.match(html, /Not recorded/);
  assert.doesNotMatch(html, /<button|<input|<form/);
});
test('approved and returned outcomes retain authoritative status without final decline language', () => {
  for (const state of [PRStatus.Approved_Awaiting_PO, PRStatus.Returned_for_Correction]) {
    const html = render(state, [{...admin, newState: state}, fiscal]);
    assert.match(html, new RegExp(`Current request status: ${state.replace(/_/g,' ')}`));
    assert.doesNotMatch(html, /This decline is final/);
    assert.match(html, /Earlier Business Office review · Historical/);
  }
});
test('later receiving and resubmission cannot be replaced by an earlier Admin decision', () => {
  const received = {...admin, id:'received', newState:PRStatus.Received_and_Closed, actor:{role:Role.Receiving_Custodian,email:'receiving@example.invalid'}, remarks:'Saved receipt'};
  const logs=Object.freeze([received,{...admin,newState:PRStatus.Approved_Awaiting_PO},fiscal]);
  const before=JSON.stringify(logs), html=render(PRStatus.Received_and_Closed,logs);
  assert.match(html,/1 · Current status and latest update/); assert.match(html,/2 · Earlier Admin Office review · Historical/);
  assert.ok(html.indexOf('Saved receipt')<html.indexOf('Saved decline reason'));
  assert.equal(JSON.stringify(logs),before);
  const resubmitted=render(PRStatus.Pending_Business_Approval,[{...received,newState:PRStatus.Pending_Business_Approval,actor:{role:Role.Requesting_Office,email:'requester@example.invalid'}},{...admin,newState:PRStatus.Returned_for_Correction},fiscal]);
  assert.match(resubmitted,/Current request status: Pending Business Approval/);
  assert.match(resubmitted,/Earlier Admin Office review · Historical/);
  assert.doesNotMatch(resubmitted,/This request was returned for correction/);
});
test('missing records and notes remain explicit; multiple reviews retain saved order and false confirmations', () => {
  assert.match(render(PRStatus.Declined,[]),/No saved decision details are available/);
  const html=render(PRStatus.Declined,[{...admin,remarks:null}, {...fiscal,businessBudgetAvailable:false}, {...admin,id:'old-return',newState:PRStatus.Returned_for_Correction}]);
  assert.match(html,/No decision note was recorded/); assert.match(html,/Not confirmed/);
  assert.match(html,/3 · Earlier Admin Office review · Historical/);
});
