import { z } from 'zod';
import { Role } from '@prisma/client';

export const ManagedRoleSchema = z.enum([
  Role.Requesting_Office,
  Role.Business_Office,
  Role.Admin_Office,
  Role.Purchasing_Office,
  Role.Receiving_Custodian,
  Role.Global_Auditor,
]);

export const DepartmentCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, 'Use 2 to 12 letters or numbers.'),
});

export const AccountCreateSchema = z.object({
  email: z.email().trim().toLowerCase().max(191),
  role: ManagedRoleSchema,
  departmentId: z.string().trim().min(1),
});

export const AccountStatusSchema = z.object({
  status: z.enum(['Active', 'Disabled']),
});

export const AccountLinkSchema = z.object({
  purpose: z.enum(['Activation', 'Password_Reset']),
});

export const RequestResetSchema = z.object({
  email: z.email().trim().toLowerCase().max(191),
});

export const CompleteTokenSchema = z.object({
  token: z.string().min(20).max(200),
  purpose: z.enum(['Activation', 'Password_Reset']),
  newPassword: z.string().min(16, 'Use at least 16 characters.').max(256),
});
