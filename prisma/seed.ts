import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { Role } from '@prisma/client';
import { prisma } from '../src/shared/prisma';
import { hashPassword } from '../src/shared/password';

dotenv.config({ path: resolve(process.cwd(), '.env.seed.local') });

const DEPARTMENTS = [
  { id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', name: 'College of Computer Studies', code: 'CCS' },
  { id: 'business-finance-dept-xyz', name: 'Business and Finance Office', code: 'BFO' },
  { id: 'administration-dept-uuid-hq', name: 'Office of the Vice President for Administration', code: 'OVPA' },
  { id: 'purchasing-dept-uuid-wxy', name: 'Purchasing and Procurement Office', code: 'PPO' },
  { id: 'asset-management-dept-uuid-000', name: 'Property and Asset Management Unit', code: 'PAMU' },
  { id: 'audit-compliance-dept-uuid', name: 'Internal Audit Office', code: 'IAO' },
  { id: 'cpats-system-administration', name: 'CPATS System Administration', code: 'SYS' },
] as const;

const ROLE_ACCOUNTS = [
  { id: '6a2f7b1e-3c9d-4e5f-a6b7-8c9d0e1f2a3b', email: 'requester@dmc.edu.ph', role: Role.Requesting_Office, departmentCode: 'CCS', passwordVariable: 'CPATS_SEED_REQUESTER_PASSWORD' },
  { id: 'business-evaluator-uuid-999', email: 'finance@dmc.edu.ph', role: Role.Business_Office, departmentCode: 'BFO', passwordVariable: 'CPATS_SEED_FINANCE_PASSWORD' },
  { id: 'admin-approver-uuid-static-789', email: 'vp-admin@dmc.edu.ph', role: Role.Admin_Office, departmentCode: 'OVPA', passwordVariable: 'CPATS_SEED_ADMIN_PASSWORD' },
  { id: 'purchaser-uuid-static-888', email: 'purchasing@dmc.edu.ph', role: Role.Purchasing_Office, departmentCode: 'PPO', passwordVariable: 'CPATS_SEED_PURCHASING_PASSWORD' },
  { id: 'custodian-uuid-static-555', email: 'custodian@dmc.edu.ph', role: Role.Receiving_Custodian, departmentCode: 'PAMU', passwordVariable: 'CPATS_SEED_CUSTODIAN_PASSWORD' },
  { id: 'global-auditor-uuid-007', email: 'auditor@dmc.edu.ph', role: Role.Global_Auditor, departmentCode: 'IAO', passwordVariable: 'CPATS_SEED_AUDITOR_PASSWORD' },
] as const;

function requireSeedPassword(variableName: string): string {
  const password = process.env[variableName];
  if (!password || password.length < 16) {
    throw new Error(`${variableName} must be defined in .env.seed.local with at least 16 characters.`);
  }
  return password;
}

async function main() {
  console.log('Synchronizing institutional departments without deleting operational records...');

  const departmentIds = new Map<string, string>();
  for (const department of DEPARTMENTS) {
    const storedDepartment = await prisma.department.upsert({
      where: { code: department.code },
      update: {},
      create: department,
      select: { id: true, code: true },
    });
    departmentIds.set(storedDepartment.code, storedDepartment.id);
  }

  console.log('Creating missing demonstration role accounts without rotating existing passwords...');

  for (const account of ROLE_ACCOUNTS) {
    const departmentId = departmentIds.get(account.departmentCode);
    if (!departmentId) throw new Error(`Department ${account.departmentCode} could not be resolved.`);

    const existing = await prisma.user.findUnique({ where: { email: account.email }, select: { id: true } });
    if (existing) continue;
    await prisma.user.create({ data: {
      id: account.id,
      email: account.email,
      passwordHash: hashPassword(requireSeedPassword(account.passwordVariable)),
      role: account.role,
      departmentId,
    } });
  }

  const adminEmail = process.env.CPATS_SEED_SYSTEM_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.CPATS_SEED_SYSTEM_ADMIN_PASSWORD;
  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminPassword) throw new Error('Set both CPATS_SEED_SYSTEM_ADMIN_EMAIL and CPATS_SEED_SYSTEM_ADMIN_PASSWORD.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminPassword.length < 16) {
      throw new Error('System administrator bootstrap requires a valid email and a password of at least 16 characters.');
    }
    const existing = await prisma.user.findUnique({ where: { email: adminEmail }, select: { role: true } });
    if (existing && existing.role !== Role.System_Administrator) {
      throw new Error('System administrator email already belongs to another role.');
    }
    if (!existing) {
      await prisma.user.create({ data: {
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
        role: Role.System_Administrator,
        departmentId: departmentIds.get('SYS')!,
      } });
    }
  }

  console.log('Missing accounts created. Existing credentials, procurement, and audit records were preserved.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
