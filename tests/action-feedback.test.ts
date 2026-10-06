import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { toast } from 'sonner';
import { actionFeedback, decisionFeedback, submissionFeedbackError } from '../src/components/ui/action-feedback';

const reference = 'request-with-a-long-department-reference-12345678';
function latest(id: string | number) { return toast.getHistory().find((item) => item.id === id)!; }

test('office decision feedback distinguishes stage approval, return and final decline', () => {
  for (const office of ['Business', 'Admin'] as const) {
    const approved = latest(decisionFeedback('APPROVE', reference, office));
    assert.equal(approved.type, 'success');
    assert.match(String(approved.description), office === 'Business' ? /Admin Office review/ : /Purchase Order preparation/);
    const returned = latest(decisionFeedback('RETURN_FOR_CORRECTION', reference, office));
    assert.equal(returned.type, 'warning');
    assert.equal(returned.title, 'Returned for correction');
    const declined = latest(decisionFeedback('DECLINE', reference, office));
    assert.equal(declined.type, 'error');
    assert.equal(declined.title, 'Decline recorded');
    assert.match(String(declined.description), /original request is final/);
    for (const item of [approved, returned, declined]) assert.ok(String(item.description).includes(reference));
  }
  assert.equal(latest(decisionFeedback('APPROVE', reference, 'Business', true)).title, 'Revised evaluation recorded');
  assert.equal(latest(submissionFeedbackError(new Error('Server rejected the decision'))).title, 'Submission could not be confirmed');
  assert.equal(latest(actionFeedback('Damage recorded', reference, 'warning')).type, 'warning');
});

// Execute the actual submission function with isolated response/state adapters.
// No database or live workflow requests are performed.
function businessHarness(action: string, reply: () => Promise<unknown>, stale = false) {
  const source = readFileSync('src/app/dashboard/pr/evaluate-business/page.tsx', 'utf8');
  const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleEvaluationSubmit') handler = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  const calls: unknown[][] = [];
  let pending: Promise<unknown> = Promise.resolve();
  const state = { role: 'Business_Office' };
  const context: Record<string, unknown> = {
    Error, JSON,
    activeUser: state, Role: { Business_Office: state.role },
    PRStatus: { Pending_Business_Approval: 'Pending_Business_Approval' },
    activeQueue: [{ id: reference, status: stale ? 'Returned_for_Correction' : 'Pending_Business_Approval' }], businessHistory: [],
    targetPrId: reference, evaluationAction: action, remarks: 'A clear reason for this decision',
    necessityVerified: true, budgetAvailable: true,
    isAdminReturnForBusiness: () => stale,
    fetch: reply,
    startTransition: (fn: () => Promise<unknown>) => { pending = fn(); },
    decisionFeedback: (...args: unknown[]) => calls.push(['decision', ...args]),
    actionFeedback: (...args: unknown[]) => calls.push(['feedback', ...args]),
    submissionFeedbackError: (...args: unknown[]) => calls.push(['error', ...args]),
    syncWorkspaceQueue: async () => undefined,
    router: { refresh: () => undefined },
  };
  for (const setter of ['setSystemError', 'setFieldErrors', 'setSuccessMessage', 'setShowOperationStateModal', 'setTargetPrId', 'setEvaluationAction', 'setRemarks', 'setNecessityVerified', 'setBudgetAvailable']) context[setter] = (...args: unknown[]) => calls.push([setter, ...args]);
  const compiled = ts.transpileModule('globalThis.run = ' + handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, context);
  return { calls, run: async () => { await (context.run as (event: unknown) => Promise<void>)({ preventDefault() {} }); await pending; } };
}

test('no decision toast before response; each confirmed decision retains the inline banner', async () => {
  for (const action of ['APPROVE', 'RETURN_FOR_CORRECTION', 'DECLINE']) {
    let resolve!: (value: unknown) => void;
    const response = new Promise((done) => { resolve = done; });
    const harness = businessHarness(action, () => response);
    const run = harness.run();
    assert.equal(harness.calls.some(([kind]) => kind === 'decision'), false);
    resolve({ ok: true, json: async () => ({ success: true }) });
    await run;
    assert.equal(harness.calls.filter(([kind]) => kind === 'decision').length, 1);
    const banner = harness.calls.find(([kind, value]) => kind === 'setSuccessMessage' && value !== null)?.[1];
    assert.deepEqual(JSON.parse(JSON.stringify(banner)), { action, message: 'Evaluation committed successfully. Request status updated.' });
  }
});

test('rejected, validation, stale and disconnected submissions cannot emit a recorded decision', async () => {
  for (const status of [422, 409, 500]) {
    const harness = businessHarness('APPROVE', async () => ({ ok: false, status, json: async () => status === 422 ? { errors: {} } : { error: 'The decision was rejected.' } }));
    await harness.run();
    assert.equal(harness.calls.some(([kind]) => kind === 'decision'), false);
    assert.ok(harness.calls.some(([kind]) => kind === 'error'));
  }
  const stale = businessHarness('APPROVE', async () => ({ ok: false, status: 400, json: async () => ({ error: 'INVALID OPERATION STATE' }) }));
  await stale.run();
  assert.equal(stale.calls.some(([kind]) => kind === 'decision'), false);
  assert.ok(stale.calls.some(([kind, title]) => kind === 'feedback' && title === 'Decision not recorded'));
  const network = businessHarness('APPROVE', async () => { throw new Error('Connection lost'); });
  await network.run();
  assert.equal(network.calls.some(([kind]) => kind === 'decision'), false);
  assert.ok(network.calls.some(([kind]) => kind === 'error'));
});

function actualHandler(file: string, name: string, values: Record<string, unknown>) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) handler = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(handler);
  const calls: unknown[][] = [];
  let pending: Promise<unknown> = Promise.resolve();
  const context: Record<string, unknown> = {
    Error, JSON, Boolean, sessionStorage: { setItem() {} },
    startTransition: (fn: () => Promise<unknown>) => { pending = fn(); },
    router: { refresh() {}, push() {} },
    actionFeedback: (...args: unknown[]) => calls.push(['feedback', ...args]),
    decisionFeedback: (...args: unknown[]) => calls.push(['decision', ...args]),
    submissionFeedbackError: (...args: unknown[]) => calls.push(['error', ...args]),
    ...values,
  };
  for (const setter of source.matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter[1]] = (...args: unknown[]) => calls.push([setter[1], ...args]);
  vm.runInNewContext(ts.transpileModule('globalThis.run = ' + handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { calls, run: async () => { await (context.run as (event: unknown) => Promise<void>)({ preventDefault() {} }); await pending; } };
}

test('Admin confirms all three decisions only after successful response', async () => {
  for (const action of ['APPROVE', 'RETURN_FOR_CORRECTION', 'DECLINE']) {
    for (const ok of [true, false]) {
      const harness = actualHandler('src/app/dashboard/pr/approve-admin/page.tsx', 'handleAdminApproval', {
        activeUser: { role: 'Admin_Office' }, Role: { Admin_Office: 'Admin_Office' },
        PRStatus: { Pending_Admin_Approval: 'Pending_Admin_Approval' },
        adminQueue: [{ id: reference, status: 'Pending_Admin_Approval' }], prId: reference,
        action, remarks: 'Detailed decision explanation', checkedPR: true, checkedPOAuth: true, checkedPurchaseAuth: true,
        isOption1Enabled: false, option1ProofFilePath: '', syncAdminWorkspaceQueue: async () => undefined,
        fetch: async () => ({ ok, status: ok ? 200 : 409, json: async () => ({ error: 'Stale request' }) }),
      });
      await harness.run();
      assert.equal(harness.calls.filter(([kind]) => kind === 'decision').length, ok ? 1 : 0);
      assert.equal(harness.calls.filter(([kind]) => kind === 'error').length, ok ? 0 : 1);
    }
  }
});

test('Requesting correction preserves same-record PATCH and reuse retains new-request POST', async () => {
  for (const returnedRequestId of [reference, '']) {
    const requests: Array<{url: string; method: string; body: Record<string, unknown>}> = [];
    const harness = actualHandler('src/app/dashboard/pr/new/page.tsx', 'handleSubmit', {
      activeUser: { role: 'Requesting_Office' }, Role: { Requesting_Office: 'Requesting_Office' },
      returnedRequestId, isDirectPoBypass: true, adminProofFilePath: '/uploads/existing-proof.pdf',
      justification: 'Preserved request justification',
      items: [{ category: 'Other / Custom Item', specs: 'Original saved specification', quantity: 3 }],
      fetch: async (url: string, init: {method: string; body: string}) => {
        requests.push({url, method: init.method, body: JSON.parse(init.body)});
        return { ok: true, json: async () => ({ data: { id: returnedRequestId || 'new-request-id' } }) };
      },
    });
    await harness.run();
    assert.equal(requests[0].method, returnedRequestId ? 'PATCH' : 'POST');
    assert.equal(requests[0].url, returnedRequestId ? '/api/pr/return-correction' : '/api/pr/create');
    assert.equal(requests[0].body.prId, returnedRequestId || undefined);
    assert.equal(requests[0].body.adminProofFilePath, '/uploads/existing-proof.pdf');
    assert.deepEqual(requests[0].body.items, [{itemName: 'Original saved specification', quantity: 3}]);
    assert.equal(harness.calls.filter(([kind]) => kind === 'feedback').length, 1);
  }
});

test('Purchasing, clearance and receiving emit saved outcomes, not optimistic feedback', async () => {
  const cases = [
    { file: 'po/new', handler: 'handlePurchaseOrderGeneration', role: 'Purchasing_Office', values: {
      custodyConfirmed: true, purchasingQueue: [{id: reference, department: {code: 'CCS'}}], purchaseRequestId: reference,
      poNumber: 'PO-test', syncPurchasingQueue: async () => undefined,
    } },
    { file: 'po/release-check', handler: 'handleFinancialClearanceSubmit', role: 'Business_Office', values: {
      poId: 'PO-test', paymentType: 'CREDIT_TERMS', billingItems: [], checkNumber: '', calculatedBilledTotal: 100,
      syncCheckReleaseQueue: async () => undefined,
    } },
    { file: 'receiving/new', handler: 'handleReceivingCommit', role: 'Receiving_Custodian', values: {
      quantityVerified: true, cameraViewportMapped: true, condition: 'Damaged', invoiceFilePath: '/invoice.pdf',
      remarks: 'Inspection recorded damage', purchaseOrderId: 'PO-test', asssetImageFilePath: '/photo.jpg', syncReceivingQueue: async () => undefined,
    } },
  ];
  for (const scenario of cases) {
    for (const ok of [true, false]) {
      const harness = actualHandler(`src/app/dashboard/${scenario.file}/page.tsx`, scenario.handler, {
        activeUser: { role: scenario.role }, Role: { [scenario.role]: scenario.role }, ...scenario.values,
        fetch: async () => ({ ok, status: ok ? 200 : 409, json: async () => ({ error: 'Server rejected this action', data: {poNumber: 'PO-test', qrCodeToken: 'fixture'} }) }),
      });
      await harness.run();
      assert.equal(harness.calls.filter(([kind]) => kind === 'feedback').length, ok ? 1 : 0);
      assert.equal(harness.calls.filter(([kind]) => kind === 'error').length, ok ? 0 : 1);
      if (ok && scenario.role === 'Receiving_Custodian') assert.ok(harness.calls.some(([kind, , , tone]) => kind === 'feedback' && tone === 'warning'));
    }
  }
});
