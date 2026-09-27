import { NextRequest, NextResponse } from 'next/server';
import { Role, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { DepartmentCreateSchema } from '@/validation/account.schema';

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request, Role.System_Administrator);
  if (!auth.success) return auth.response;
  const departments = await prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } });
  return NextResponse.json({ success: true, data: departments });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRequest(request, Role.System_Administrator);
  if (!auth.success) return auth.response;
  const validation = DepartmentCreateSchema.safeParse(await request.json());
  if (!validation.success) return NextResponse.json({ success: false, error: 'Enter a department name and a unique code of 2 to 12 letters or numbers.' }, { status: 422 });
  try {
    const department = await prisma.department.create({ data: validation.data, select: { id: true, name: true, code: true } });
    return NextResponse.json({ success: true, data: department }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'That department name or code is already in use.' }, { status: 409 });
    }
    console.error('Department creation failed:', error);
    return NextResponse.json({ success: false, error: 'Unable to create the department.' }, { status: 500 });
  }
}
