import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { authorizeRequest } from '@/shared/rbac';
import { EvidenceError, parseBoundedUpload, saveEvidence } from '@/shared/evidence';

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeRequest(request, Object.values(Role));
    if (!auth.success) return auth.response;
    const file = await parseBoundedUpload(request);
    const url = await saveEvidence(file, auth.user);
    return NextResponse.json({ success: true, url }, { status: 200 });
  } catch (error) {
    if (error instanceof EvidenceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('FILE UPLOAD FAILURE:', error);
    return NextResponse.json({ success: false, error: 'Unable to save this file. Please try again.' }, { status: 500 });
  }
}
