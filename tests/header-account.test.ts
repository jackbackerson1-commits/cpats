import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { initialHeaderAccount } from '../src/shared/header-account';

test('every role receives its own server-rendered identity without a client fetch', () => {
  for (const role of Object.values(Role)) {
    const headers = new Headers({ 'x-user-role': role, 'x-user-email': `${role}@example.invalid`, 'x-user-department-code': 'TEST-OFFICE', 'cookie': 'not-for-client', 'x-user-id': 'not-needed' });
    assert.deepEqual(initialHeaderAccount(headers), { role, email: `${role}@example.invalid`, departmentCode: 'TEST-OFFICE' });
  }
});

test('unknown or incomplete identity keeps the existing fallback instead of inventing a role', () => {
  assert.equal(initialHeaderAccount(new Headers()), null);
  assert.equal(initialHeaderAccount(new Headers({ 'x-user-role': 'Unknown', 'x-user-email': 'test@example.invalid', 'x-user-department-code': 'TEST' })), null);
  assert.equal(initialHeaderAccount(new Headers({ 'x-user-role': Role.Admin_Office, 'x-user-email': 'test@example.invalid' })), null);
});
