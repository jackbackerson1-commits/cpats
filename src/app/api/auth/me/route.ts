import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { authorizeRequest } from '@/shared/rbac';

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request, Object.values(Role));
  if (!auth.success) return auth.response;

  return NextResponse.json(
    { success: true, data: auth.user },
    { status: 200 }
  );
}
