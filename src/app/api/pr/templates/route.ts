import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { RequestTemplatePayloadSchema, SaveRequestTemplateSchema, RemoveRequestTemplateSchema } from '@/validation/request-template.schema';

const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const missing = () => reply({ success: false, error: 'Template not found for your account and department.' }, 404);

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const scope = { ownerId: auth.user.id, departmentId: auth.user.departmentId };
    const id = request.nextUrl.searchParams.get('id');
    if (id !== null) {
      if (!z.string().uuid().safeParse(id).success) return reply({ success: false, error: 'A valid template reference is required.' }, 400);
      const template = await prisma.requestTemplate.findFirst({ where: { id, ...scope } });
      if (!template) return missing();
      const parsed = RequestTemplatePayloadSchema.safeParse(template.payload);
      if (!parsed.success) return reply({ success: false, error: 'This template cannot be restored. Your current form has been kept.' }, 422);
      return reply({ success: true, data: { id: template.id, name: template.name, version: template.version, payload: parsed.data } });
    }
    const pageText = request.nextUrl.searchParams.get('page') ?? '0';
    if (!/^\d{1,6}$/.test(pageText)) return reply({ success: false, error: 'Invalid template page.' }, 400);
    const page = Number(pageText);
    const templates = await prisma.requestTemplate.findMany({
      where: scope, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page * 20, take: 21,
      select: { id: true, name: true, version: true, payload: true, createdAt: true },
    });
    return reply({ success: true, data: templates.slice(0, 20).map(template => {
      const parsed = RequestTemplatePayloadSchema.safeParse(template.payload);
      return { id: template.id, name: template.name, version: template.version, createdAt: template.createdAt, itemCount: parsed.success ? parsed.data.items.length : 0 };
    }), nextPage: templates.length > 20 ? page + 1 : null });
  } catch (error) {
    console.error('REQUEST TEMPLATE LOAD FAILURE:', error);
    return reply({ success: false, error: 'Unable to load your templates. Your current form has been kept; please try again.' }, 500);
  }
}
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const parsed = SaveRequestTemplateSchema.safeParse(await request.json());
    if (!parsed.success) return reply({ success: false, error: 'Enter a template name and complete each item’s specifications and quantity.', errors: parsed.error.format() }, 422);
    const template = await prisma.requestTemplate.create({
      data: { ownerId: auth.user.id, departmentId: auth.user.departmentId, ...parsed.data },
      select: { id: true, name: true, version: true, createdAt: true },
    });
    return reply({ success: true, data: template }, 201);
  } catch (error) {
    console.error('REQUEST TEMPLATE SAVE FAILURE:', error);
    return reply({ success: false, error: 'Unable to save this template. Your current form has been kept; please try again.' }, 500);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const parsed = RemoveRequestTemplateSchema.safeParse(await request.json());
    if (!parsed.success) return reply({ success: false, error: 'A valid template reference and version are required.' }, 422);
    const scope = { id: parsed.data.id, ownerId: auth.user.id, departmentId: auth.user.departmentId };
    const existing = await prisma.requestTemplate.findFirst({ where: scope, select: { id: true } });
    if (!existing) return missing();
    const removed = await prisma.requestTemplate.deleteMany({ where: { ...scope, version: parsed.data.version } });
    if (!removed.count) return reply({ success: false, error: 'This template changed or was removed. Refresh your templates before trying again.' }, 409);
    return reply({ success: true });
  } catch (error) {
    console.error('REQUEST TEMPLATE REMOVE FAILURE:', error);
    return reply({ success: false, error: 'Unable to confirm template removal. Refresh your templates before trying again.' }, 500);
  }
}
