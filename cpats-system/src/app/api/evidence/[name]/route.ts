import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { authorizeRequest } from '@/shared/rbac';
import { canAccessEvidence, EvidenceError, readEvidence } from '@/shared/evidence';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  try {
    const auth = await authorizeRequest(request, Object.values(Role));
    if (!auth.success) return auth.response;
    const { name } = await context.params;
    if (!await canAccessEvidence(name, auth.user)) return NextResponse.json({ success: false, error: 'Attachment not found for your account.' }, { status: 404 });
    const { bytes, contentType } = await readEvidence(name);
    return new NextResponse(Uint8Array.from(bytes), { headers: {
      'Content-Type': contentType, 'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch (error) {
    if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return NextResponse.json({ success: false, error: 'Attachment not found.' }, { status: 404 });
    console.error('EVIDENCE READ FAILURE:', error);
    return NextResponse.json({ success: false, error: 'Unable to open this attachment. Please try again.' }, { status: 500 });
  }
}
