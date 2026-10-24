import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRStatus, Role } from '@prisma/client';
import { BusinessDecisionChronology, BusinessReviewEvent } from '../src/components/business/BusinessDecisionChronology';
import { AdminFeedbackContext } from '../src/components/business/AdminFeedbackContext';

const business: BusinessReviewEvent = { id: 'business', createdAt: '2026-10-07T08:18:33Z', newState: PRStatus.Pending_Admin_Approval,
  remarks: 'Original fiscal approval', actor: { role: Role.Business_Office, email: 'finance@example.invalid' }, businessNecessityVerified: null, businessBudgetAvailable: false };
const admin: BusinessReviewEvent = { id: 'admin', createdAt: '2026-10-07T08:18:54Z', newState: PRStatus.Declined,
  remarks: 'Final Admin feedback', actor: { role: Role.Admin_Office, email: 'admin@example.invalid' } };
const render = (status: PRStatus, auditLogs: BusinessReviewEvent[], businessDecision: BusinessReviewEvent | undefined = business) => renderToStaticMarkup(<BusinessDecisionChronology status={status} auditLogs={auditLogs} businessDecision={businessDecision} />);

test('Admin decline is displayed before earlier fiscal approval, below the stored current status', () => {
  const markup = render(PRStatus.Declined, [admin, business]);
  assert.ok(markup.indexOf('Current request status: Declined') < markup.indexOf('Admin Office decision · Declined'));
  assert.ok(markup.indexOf('Admin Office decision · Declined') < markup.indexOf('Earlier Business Office decision · Historical'));
  assert.match(markup, /Recorded outcome: Approved/); assert.match(markup, /1 · Most recent saved review/); assert.match(markup, /2 · Earlier review · Historical/);
  assert.match(markup, /Final Admin feedback/); assert.match(markup, /Original fiscal approval/);
  assert.match(markup, /Not recorded/); assert.match(markup, /Not confirmed/);
  assert.doesNotMatch(markup, /<button|<input|<form/);
});

test('returned feedback is first; older Admin returns remain expandable after the fiscal decision', () => {
  const returned = { ...admin, newState: PRStatus.Returned_for_Correction };
  const older = { ...returned, id: 'older-admin', createdAt: '2026-10-06T08:00:00Z', remarks: 'Older return reason' };
  const markup = render(PRStatus.Returned_for_Correction, [returned, business, older]);
  assert.ok(markup.indexOf('Admin Office feedback · Corrections required') < markup.indexOf('Earlier Business Office decision'));
  assert.ok(markup.indexOf('Earlier Business Office decision') < markup.indexOf('Previous Admin return · Historical'));
  assert.match(markup, /<details/); assert.match(markup, /Older return reason/);
});

test('a later Business revision comes first and never describes the previous Admin return as current', () => {
  const returned = { ...admin, newState: PRStatus.Returned_for_Correction };
  const revised = { ...business, id: 'revised', createdAt: '2026-10-08T08:00:00Z', remarks: 'Revised fiscal review' };
  const markup = render(PRStatus.Pending_Admin_Approval, [revised, returned, business], revised);
  assert.ok(markup.indexOf('Recorded Business Office decision') < markup.indexOf('Previous Admin return · Historical'));
  assert.doesNotMatch(markup, /Admin Office feedback · Corrections required/);
  assert.match(markup, /Current request status: Pending Admin Approval/);
});

test('approved and advanced states use stored status and display the saved Admin approval even without past returns', () => {
  const approved = { ...admin, newState: PRStatus.Approved_Awaiting_PO };
  for (const status of [PRStatus.Approved_Awaiting_PO, PRStatus.Ready_for_Purchase, PRStatus.Received_and_Closed]) {
    const later = { ...approved, id: 'receiving', actor: { role: Role.Receiving_Custodian, email: 'receiving@example.invalid' }, newState: status };
    const markup = render(status, [later, approved, business]);
    assert.match(markup, new RegExp(`Current request status: ${status.replace(/_/g, ' ')}`));
    assert.ok(markup.indexOf('Latest Admin decision · Approved') < markup.indexOf('Earlier Business Office decision'));
  }
});

test('equal timestamps preserve server order; missing decisions do not invent an approval', () => {
  const tied = { ...admin, createdAt: business.createdAt };
  assert.ok(render(PRStatus.Declined, [tied, business]).indexOf('Admin Office decision · Declined') < render(PRStatus.Declined, [tied, business]).indexOf('Earlier Business Office decision'));
  const empty = renderToStaticMarkup(<BusinessDecisionChronology status={PRStatus.Pending_Business_Approval} />);
  assert.match(empty, /Current request status: Pending Business Approval/); assert.doesNotMatch(empty, /Recorded outcome: Approved/);
});

test('default Admin context is preserved, while filtered sections never duplicate events', () => {
  const older = { ...admin, id: 'older', newState: PRStatus.Returned_for_Correction };
  const logs = [admin, business, older];
  const defaultMarkup = renderToStaticMarkup(<AdminFeedbackContext auditLogs={logs} status={PRStatus.Declined} />);
  const explicit = renderToStaticMarkup(<AdminFeedbackContext auditLogs={logs} status={PRStatus.Declined} sections="all" />);
  assert.equal(defaultMarkup, explicit);
  const markup = render(PRStatus.Declined, logs);
  assert.equal((markup.match(/Final Admin feedback/g) || []).length, 2); // latest decline and older return both use this fixture note
  assert.equal((markup.match(/Admin Office decision · Declined/g) || []).length, 1);
});
