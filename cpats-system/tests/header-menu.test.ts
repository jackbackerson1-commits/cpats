import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { Role } from '@prisma/client';
import { ASSET_REGISTER_ROLES } from '../src/shared/asset-access';

// Exercise the actual header callbacks without a live account or logout request.
function harness() {
  const requests: { url: string; method?: string }[] = [];
  const routes: string[] = [];
  let guards = 0;
  const require = createRequire(import.meta.url);
  const hooks = { ...React, useEffect: () => {}, useRef: () => ({ current: null }), useState: (value: unknown) => [value, () => {}] };
  const mocks: Record<string, unknown> = {
    react: hooks,
    'next/navigation': { usePathname: () => '/dashboard/receiving/new', useRouter: () => ({ push: (path: string) => routes.push(path), refresh: () => routes.push('refresh') }) },
    'next/link': () => null, 'next/image': () => null,
    '@/components/ui/NotificationBell': () => null,
    '@/components/ui/UnsavedChanges': { useUnsavedNavigation: () => (action: () => unknown) => { guards++; return action(); } },
    '@/shared/asset-access': { ASSET_REGISTER_ROLES },
  };
  const exports: Record<string, unknown> = {};
  const compiledModule = { exports };
  const code = ts.transpileModule(readFileSync('src/components/ui/EnterpriseHeader.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, module: compiledModule, console, URLSearchParams,
    requestAnimationFrame: (callback: () => void) => callback(),
    fetch: async (url: string, options?: { method?: string }) => { requests.push({ url, method: options?.method }); return {}; },
    require: (id: string) => id.endsWith('.css') ? {} : mocks[id] ?? require(id),
  });
  const Header = compiledModule.exports.default as (props: unknown) => React.ReactElement;
  const tree = Header({ initialUser: { email: 'pamu@example.invalid', role: Role.Receiving_Custodian, departmentCode: 'PAMU' } });
  type Element = React.ReactElement<Record<string, unknown>>;
  const elements: Element[] = [];
  function walk(node: unknown) {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!React.isValidElement(node)) return;
    const element = node as Element; elements.push(element); walk(element.props.children);
  }
  walk(tree);
  return { elements, requests, routes, guards: () => guards };
}

test('account menu supports arrows, Escape and focus restoration; trigger exposes menu state', () => {
  const h = harness();
  const details = h.elements.find(e => e.type === 'details')!;
  const summary = h.elements.find(e => e.type === 'summary')!;
  assert.equal(summary.props.role, 'button'); assert.equal(summary.props['aria-haspopup'], 'menu'); assert.equal(summary.props['aria-expanded'], false);
  let focused = '';
  const target = { open: false, querySelector: (selector: string) => ({ focus: () => { focused = selector; } }) };
  const keyDown = details.props.onKeyDown as (event: unknown) => void;
  for (const key of ['ArrowDown', 'ArrowUp']) {
    let prevented = false;
    keyDown({ key, currentTarget: target, preventDefault: () => { prevented = true; } });
    assert.equal(target.open, true); assert.equal(focused, 'button'); assert.equal(prevented, true);
  }
  keyDown({ key: 'Escape', currentTarget: target, preventDefault: () => {} });
  assert.equal(target.open, false); assert.equal(focused, 'summary');
  const blur = details.props.onBlur as (event: unknown) => void;
  const inside = { open: true, contains: () => true };
  blur({ currentTarget: inside, relatedTarget: {} }); assert.equal(inside.open, true);
  const outside = { open: true, contains: () => false };
  blur({ currentTarget: outside, relatedTarget: null }); assert.equal(outside.open, false);
});

test('Sign out retains the existing unsaved-navigation guard, POST and login redirect', async () => {
  const h = harness();
  const logout = h.elements.find(e => e.props.role === 'menuitem')!;
  await (logout.props.onClick as () => Promise<void>)();
  assert.equal(h.guards(), 1);
  assert.deepEqual(h.requests, [{ url: '/api/auth/logout', method: 'POST' }]);
  assert.deepEqual(h.routes, ['/login', 'refresh']);
});
