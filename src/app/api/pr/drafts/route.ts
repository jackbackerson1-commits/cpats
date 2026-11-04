import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { DraftIdSchema, RequestDraftPayloadSchema, SaveRequestDraftSchema, UpdateRequestDraftSchema, RemoveRequestDraftSchema } from '@/validation/request-draft.schema';
import { assertEvidenceReferences, EvidenceError } from '@/shared/evidence';

const noStore = { 'Cache-Control': 'private, no-store' };
const missing = () => NextResponse.json({ success: false, error: 'Draft not found for your account and department.' }, { status: 404, headers: noStore });
const stale = () => NextResponse.json({ success: false, error: 'This draft changed in another session or was submitted. Your edits are still in this form. Reopen the saved draft before continuing.' }, { status: 409, headers: noStore });

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const scope = { ownerId: auth.user.id, departmentId: auth.user.departmentId };
    const id = request.nextUrl.searchParams.get('id');
    if (id !== null) {
      const parsed = DraftIdSchema.safeParse(id);
      if (!parsed.success) return NextResponse.json({ success: false, error: 'A valid draft reference is required.' }, { status: 400, headers: noStore });
      const draft = await prisma.requestDraft.findFirst({ where: { id: parsed.data, ...scope } });
      if (!draft) return missing();
      if (draft.submittedRequestId) return NextResponse.json({ success: false, error: 'This draft has already been submitted. You can find the request in Track Requests.' }, { status: 409, headers: noStore });
      return NextResponse.json({ success: true, data: { id: draft.id, version: draft.version, updatedAt: draft.updatedAt, payload: draft.payload } }, { headers: noStore });
    }

    // Offset pages keep every private draft reachable without changing procurement queues.
    const pageText = request.nextUrl.searchParams.get('page') ?? '0';
    if (!/^\d{1,6}$/.test(pageText)) return NextResponse.json({ success: false, error: 'Invalid draft page.' }, { status: 400, headers: noStore });
    const page = Number(pageText);
    const drafts = await prisma.requestDraft.findMany({
      where: { ...scope, submittedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: page * 20, take: 21,
      select: { id: true, version: true, payload: true, updatedAt: true },
    });
    const data = drafts.slice(0, 20).map((draft) => {
      const parsed = RequestDraftPayloadSchema.safeParse(draft.payload);
      const first = parsed.success ? parsed.data.items[0] : null;
      return { id: draft.id, version: draft.version, updatedAt: draft.updatedAt,
        title: first ? (first.specs.trim() || first.category).slice(0, 160) : 'Unfinished request',
        itemCount: parsed.success ? parsed.data.items.length : 0,
      };
    });
    return NextResponse.json({ success: true, data, nextPage: drafts.length > 20 ? page + 1 : null }, { headers: noStore });
  } catch (error) {
    console.error('REQUEST DRAFT LOAD FAILURE:', error);
    return NextResponse.json({ success: false, error: 'Unable to load your saved drafts. Please try again.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const parsed = SaveRequestDraftSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'The draft could not be saved. Check field lengths and quantities.', errors: parsed.error.format() }, { status: 422, headers: noStore });
    await assertEvidenceReferences(auth.user, parsed.data.payload.adminProofFilePath);
    const draft = await prisma.requestDraft.create({ data: { ownerId: auth.user.id, departmentId: auth.user.departmentId, payload: parsed.data.payload } });
    return NextResponse.json({ success: true, data: { id: draft.id, version: draft.version, updatedAt: draft.updatedAt } }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('REQUEST DRAFT SAVE FAILURE:', error);
    if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status, headers: noStore });
    return NextResponse.json({ success: false, error: 'Unable to save this draft. Your edits are still in this form; please try again.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const parsed = UpdateRequestDraftSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'A valid draft reference, version and form are required.', errors: parsed.error.format() }, { status: 422, headers: noStore });
    const { id, version, payload } = parsed.data;
    await assertEvidenceReferences(auth.user, payload.adminProofFilePath);
    const scope = { id, ownerId: auth.user.id, departmentId: auth.user.departmentId };
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.requestDraft.findFirst({ where: scope, select: { id: true } });
      if (!existing) return null;
      const updated = await tx.requestDraft.updateMany({ where: { ...scope, version, submittedAt: null }, data: { payload, version: { increment: 1 } } });
      if (!updated.count) return false;
      return tx.requestDraft.findFirst({ where: scope, select: { id: true, version: true, updatedAt: true } });
    });
    if (result === null) return missing();
    if (result === false) return stale();
    return NextResponse.json({ success: true, data: result }, { headers: noStore });
  } catch (error) {
    console.error('REQUEST DRAFT UPDATE FAILURE:', error);
    if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status, headers: noStore });
    return NextResponse.json({ success: false, error: 'Unable to save this draft. Your edits are still in this form; please try again.' }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Role.Requesting_Office);
    if (!auth.success) return auth.response;
    const parsed = RemoveRequestDraftSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: 'A valid draft reference and saved version are required.' }, { status: 422, headers: noStore });
    const { id, version } = parsed.data;
    const scope = { id, ownerId: auth.user.id, departmentId: auth.user.departmentId };
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.requestDraft.findFirst({ where: scope, select: { id: true } });
      if (!existing) return null;
      // A concurrent save or submission must win over an outdated removal action.
      return tx.requestDraft.deleteMany({ where: { ...scope, version, submittedAt: null, submittedRequestId: null } });
    });
    if (result === null) return missing();
    if (!result.count) return NextResponse.json({ success: false, error: 'This draft changed in another session or was submitted. Refresh your drafts before trying to remove it again.' }, { status: 409, headers: noStore });
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) {
    console.error('REQUEST DRAFT REMOVE FAILURE:', error);
    return NextResponse.json({ success: false, error: 'Unable to remove this draft. Please refresh your drafts before trying again.' }, { status: 500, headers: noStore });
  }
}
