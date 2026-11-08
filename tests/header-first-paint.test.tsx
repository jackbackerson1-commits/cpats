import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Role } from '@prisma/client';
import { ASSET_REGISTER_ROLES } from '../src/shared/asset-access';

test('actual header renders the correct navigation on the server for every role before effects run', () => {
  const source = readFileSync('src/components/ui/EnterpriseHeader.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const require = createRequire(import.meta.url);
  const exports: Record<string, unknown> = {};
  const compiledModule = { exports };
  const mocks: Record<string, unknown> = {
    'next/navigation': { usePathname: () => '/dashboard/help', useRouter: () => ({}) },
    'next/link': ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', props, children),
    'next/image': () => null,
    '@/components/ui/UnsavedChanges': { useUnsavedNavigation: () => (action: () => void) => action() },
    '@/components/ui/NotificationBell': () => null,
    '@/shared/asset-access': { ASSET_REGISTER_ROLES },
  };
  vm.runInNewContext(code, { module: compiledModule, exports, require: (id: string) => id.endsWith('.css') ? {} : mocks[id] ?? require(id) });
  const Header = compiledModule.exports.default as React.ComponentType<{ initialUser: { email: string; role: Role; departmentCode: string } }>;
  for (const role of Object.values(Role)) {
    const html = renderToStaticMarkup(<Header initialUser={{ email: 'test@example.invalid', role, departmentCode: 'TEST-OFFICE' }} />);
    assert.doesNotMatch(html, /Loading account|Session Active/, role);
    assert.ok(html.includes(`aria-label="${role.replaceAll('_', ' ')} navigation"`), role);
    assert.match(html, /TEST-OFFICE/, role);
  }
});
