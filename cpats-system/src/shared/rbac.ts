import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { getAuthenticatedUser, AuthUser } from '@/shared/session';
import { prisma } from '@/shared/prisma';
import { ASSET_REGISTER_ROLES } from '@/shared/asset-access';

export const ROUTE_ROLE_MAP: Record<string, Role[]> = {
  '/dashboard/pr': [Role.Requesting_Office],
  '/dashboard/pr/new': [Role.Requesting_Office],
  '/dashboard/pr/track': [Role.Requesting_Office],
  '/dashboard/pr/evaluate-business': [Role.Business_Office],
  '/dashboard/pr/approve-admin': [Role.Admin_Office],
  '/dashboard/po/new': [Role.Purchasing_Office],
  '/dashboard/po/track': [Role.Purchasing_Office],
  '/dashboard/po/reports': [Role.Purchasing_Office],
  '/dashboard/po/release-check': [Role.Business_Office],
  '/dashboard/po/online': [Role.Purchasing_Office, Role.Business_Office, Role.Admin_Office],
  '/dashboard/receiving/new': [Role.Receiving_Custodian],
  '/dashboard/receiving/history': [Role.Receiving_Custodian],
  '/dashboard/receiving/forms': [Role.Purchasing_Office, Role.Receiving_Custodian, Role.Requesting_Office, Role.Business_Office, Role.Admin_Office, Role.Global_Auditor],
  '/dashboard/audit': [Role.Global_Auditor],
  '/dashboard/assets': ASSET_REGISTER_ROLES,
  '/dashboard/system/accounts': [Role.System_Administrator],
  '/dashboard/notifications': Object.values(Role),
  '/dashboard/help': Object.values(Role),
};

export function isRoleAllowed(userRole: Role, allowedRoles: Role | Role[]): boolean {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return allowed.includes(userRole);
}

export async function authorizeRequest(
  request: NextRequest,
  allowedRoles: Role | Role[]
): Promise<
  | { success: true; user: AuthUser }
  | { success: false; response: NextResponse }
> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: "UNAUTHORIZED: Active authenticated session required." },
        { status: 401 }
      ),
    };
  }

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    include: { department: { select: { code: true, name: true } } },
  });
  if (!current || current.accountStatus !== 'Active' || current.sessionVersion !== (user.sessionVersion ?? 0)) {
    return {
      success: false,
      response: NextResponse.json({ success: false, error: 'Your session is no longer active. Please sign in again.' }, { status: 401 }),
    };
  }

  const activeUser: AuthUser = {
    id: current.id,
    email: current.email,
    role: current.role,
    departmentId: current.departmentId,
    departmentCode: current.department.code,
    departmentName: current.department.name,
    sessionVersion: current.sessionVersion,
  };

  if (!isRoleAllowed(activeUser.role, allowedRoles)) {
    return {
      success: false,
      response: NextResponse.json(
        {
          success: false,
          error: `FORBIDDEN: Institutional security policy restricts resource access. User role '${activeUser.role}' is not authorized for this operation.`,
        },
        { status: 403 }
      ),
    };
  }

  return { success: true, user: activeUser };
}
