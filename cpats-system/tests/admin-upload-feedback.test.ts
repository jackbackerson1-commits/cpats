import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Admin upload feedback keeps previous proof on failure and replaces it only after confirmed success', async () => {
  const page = readFileSync('src/app/dashboard/pr/approve-admin/page.tsx', 'utf8');
  const start = page.indexOf('  const handleProofFileUpload =');
  const end = page.indexOf('  const handleAdminApproval =', start);
  assert.ok(start >= 0 && end > start);
  for (const ok of [false, true]) {
    const calls: [string, unknown][] = [];
    const context: Record<string, unknown> = {
      setSubmissionIssue: () => {},
      FormData, Error, console: { error() {} },
      setSystemError: (value: unknown) => calls.push(['error', value]),
      setProofUploading: (value: unknown) => calls.push(['uploading', value]),
      setAttachedFileName: (value: unknown) => calls.push(['name', value]),
      setOption1ProofFilePath: (value: unknown) => calls.push(['proof', value]),
      fetch: async () => ({ ok, json: async () => ok ? { success: true, url: '/uploads/new-proof.pdf' } : { success: false, error: 'Upload must be 10 MB or smaller.' } }),
    };
    const source = ts.transpileModule(`${page.slice(start, end)}\nrun = handleProofFileUpload;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, context);
    await (context.run as (event: unknown) => Promise<void>)({ target: { files: [new File(['fixture'], 'new-proof.pdf', { type: 'application/pdf' })] } });
    assert.deepEqual(calls.filter(([kind]) => kind === 'uploading'), [['uploading', true], ['uploading', false]]);
    if (ok) {
      assert.deepEqual(calls.filter(([kind]) => kind === 'proof'), [['proof', '/uploads/new-proof.pdf']]);
      assert.deepEqual(calls.filter(([kind]) => kind === 'name'), [['name', 'new-proof.pdf']]);
    } else {
      assert.deepEqual(calls.filter(([kind]) => kind === 'proof' || kind === 'name'), []);
      assert.ok(calls.some(([kind, value]) => kind === 'error' && value === 'Upload must be 10 MB or smaller.'));
    }
  }
});
