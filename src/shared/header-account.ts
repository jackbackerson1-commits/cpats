import { Role } from '@prisma/client';

export interface HeaderAccount { email: string; role: Role; departmentCode: string }

// Dashboard requests pass through proxy.ts, which validates the session and
// replaces these identity headers with current database values before rendering.
// This is presentation data only; endpoints continue to authorize independently.
export function initialHeaderAccount(headers: { get(name: string): string | null }): HeaderAccount | null {
  const role = headers.get('x-user-role');
  const email = headers.get('x-user-email');
  const departmentCode = headers.get('x-user-department-code');
  if (!role || !Object.values(Role).includes(role as Role) || !email || !departmentCode) return null;
  return { role: role as Role, email, departmentCode };
}
