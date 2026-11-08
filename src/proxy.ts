// src/proxy.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/shared/session';
import { ROUTE_ROLE_MAP, isRoleAllowed } from '@/shared/rbac';
import { prisma } from '@/shared/prisma';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/favicon.ico', '/_next'];
const PUBLIC_ACCOUNT_PATHS = ['/activate', '/reset-password', '/api/auth/request-reset', '/api/auth/complete-token'];

async function currentSessionUser(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const claims = sessionCookie ? await verifySessionToken(sessionCookie) : null;
  if (!claims) return null;
  const stored = await prisma.user.findUnique({
    where: { id: claims.id },
    include: { department: { select: { code: true, name: true } } },
  });
  if (!stored || stored.accountStatus !== 'Active' || stored.sessionVersion !== (claims.sessionVersion ?? 0)) return null;
  return {
    id: stored.id,
    email: stored.email,
    role: stored.role,
    departmentId: stored.departmentId,
    departmentCode: stored.department.code,
    departmentName: stored.department.name,
    sessionVersion: stored.sessionVersion,
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path)) || PUBLIC_ACCOUNT_PATHS.includes(pathname)) {
    if (pathname === '/login') {
      const user = await currentSessionUser(request);
      if (user) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
    return NextResponse.next();
  }

  const user = await currentSessionUser(request);

  if (pathname.startsWith('/uploads/')) {
    if (!user) return NextResponse.json({ success: false, error: 'Sign in to view this attachment.' }, { status: 401 });
    const evidenceUrl = request.nextUrl.clone();
    evidenceUrl.pathname = `/api/evidence/${pathname.slice('/uploads/'.length)}`;
    const evidenceHeaders = new Headers(request.headers);
    evidenceHeaders.set('x-user-id', user.id);
    evidenceHeaders.set('x-user-email', user.email);
    evidenceHeaders.set('x-user-role', user.role);
    evidenceHeaders.set('x-user-department-id', user.departmentId);
    evidenceHeaders.set('x-user-department-code', user.departmentCode);
    evidenceHeaders.set('x-user-session-version', String(user.sessionVersion ?? 0));
    return NextResponse.rewrite(evidenceUrl, { request: { headers: evidenceHeaders } });
  }

  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Page-Level RBAC Access Control
    const requiredRoles = ROUTE_ROLE_MAP[pathname];
    if (requiredRoles && !isRoleAllowed(user.role, requiredRoles)) {
      return NextResponse.redirect(new URL('/dashboard?error=unauthorized_role', request.url));
    }
  }

  if (pathname.startsWith('/api') && !pathname.startsWith('/api/auth/login')) {
    if (!user) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED: Valid session required." },
        { status: 401 }
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  if (user) {
    requestHeaders.set('x-user-id', user.id);
    requestHeaders.set('x-user-email', user.email);
    requestHeaders.set('x-user-role', user.role);
    requestHeaders.set('x-user-department-id', user.departmentId);
    requestHeaders.set('x-user-department-code', user.departmentCode);
    requestHeaders.set('x-user-session-version', String(user.sessionVersion ?? 0));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/uploads/:path*', '/login'],
};
