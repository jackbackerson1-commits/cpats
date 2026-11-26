// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/prisma';
import { LoginSchema } from '@/validation/auth.schema';
import { signToken, SESSION_COOKIE_NAME, AuthUser } from '@/shared/session';
import { verifyPassword } from '@/shared/password';

function formRedirect(path: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path, 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const isForm = contentType === 'application/x-www-form-urlencoded';

  try {
    let rawBody: unknown;
    if (isForm) {
      const fetchSite = request.headers.get('sec-fetch-site');
      const origin = request.headers.get('origin');
      // Browser fetch metadata still describes the public origin when a tunnel proxies the request.
      const sameOrigin = fetchSite === 'same-origin' || (
        !fetchSite && origin && URL.canParse(origin) && new URL(origin).host === request.headers.get('host')
      );
      if (!sameOrigin) return new NextResponse(null, { status: 403 });

      const form = await request.formData();
      rawBody = { email: form.get('email'), password: form.get('password') };
    } else {
      rawBody = await request.json();
    }
    const validation = LoginSchema.safeParse(rawBody);

    if (!validation.success) {
      if (isForm) return formRedirect('/login?signInError=invalid');
      return NextResponse.json(
        { success: false, errors: validation.error.format() },
        { status: 422 }
      );
    }

    const { password } = validation.data;
    const email = validation.data.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      include: { department: true },
    });

    if (!user || user.accountStatus !== 'Active' || !verifyPassword(password, user.passwordHash)) {
      if (isForm) return formRedirect('/login?signInError=rejected');
      return NextResponse.json(
        { success: false, error: "AUTHENTICATION_FAILED: Invalid email or password." },
        { status: 401 }
      );
    }

    const authUserPayload: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      departmentCode: user.department.code,
      departmentName: user.department.name,
      sessionVersion: user.sessionVersion,
    };

    // Await async signToken call
    const sessionToken = await signToken({
      user: authUserPayload,
      exp: Date.now() + 1000 * 60 * 60 * 12, // 12-hour session
    });

    const response = isForm
      ? formRedirect('/dashboard')
      : NextResponse.json({ success: true, data: authUserPayload }, { status: 200 });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch (error: unknown) {
    console.error("CRITICAL AUTHENTICATION ENGINE FAILURE:", error);
    if (isForm) return formRedirect('/login?signInError=unavailable');
    return NextResponse.json(
      { success: false, error: "Internal Authentication Exception." },
      { status: 500 }
    );
  }
}
