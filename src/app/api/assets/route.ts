import { NextRequest, NextResponse } from 'next/server';
import { PRStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { authorizeRequest } from '@/shared/rbac';
import { ASSET_REGISTER_ROLES } from '@/shared/asset-access';
import { assetItemLines, RegisterAssetUnitsSchema, validateAssetSelection } from '@/shared/asset-units';

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request, ASSET_REGISTER_ROLES);
  if (!auth.success) return auth.response;
  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 160);
  const poId = (request.nextUrl.searchParams.get('poId') || '').trim();
  if (poId && !RegisterAssetUnitsSchema.shape.receivingReportId.safeParse(poId).success) return NextResponse.json({ success: false, error: 'Choose a valid purchase order.' }, { status: 422 });
  const where: Prisma.AssetUnitWhereInput = { ...(poId ? { purchaseOrderId: poId } : {}), ...(q ? { OR: [
    { assetTag: { contains: q } }, { qrCodeToken: { equals: q } }, { serialNumber: { contains: q } },
    { itemName: { contains: q } }, { purchaseOrder: { poNumber: { contains: q } } },
  ] } : {}) };
  try {
    const [assets, total, reports] = await Promise.all([
      prisma.assetUnit.findMany({ where, take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: {
        purchaseOrder: { select: { id: true, poNumber: true, purchaseRequest: { select: { department: { select: { code: true, name: true } } } } } },
        receivingReport: { select: { condition: true, createdAt: true } },
      } }),
      prisma.assetUnit.count({ where }),
      auth.user.role === Role.Receiving_Custodian ? prisma.receivingReport.findMany({
        where: { purchaseOrder: { purchaseRequest: { status: PRStatus.Received_and_Closed }, ...(poId ? { id: poId } : q ? { poNumber: { contains: q } } : {}) } },
        take: 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: {
          purchaseOrder: { include: { assetUnits: { select: { lineIndex: true, unitNumber: true } }, purchaseRequest: { select: { itemsPayload: true } } } },
        },
      }) : Promise.resolve([]),
    ]);
    return NextResponse.json({ success: true, assets, total, canRegister: auth.user.role === Role.Receiving_Custodian,
      receivedOrders: reports.map((report) => ({ reportId: report.id, purchaseOrderId: report.purchaseOrderId, poNumber: report.purchaseOrder.poNumber,
        lines: assetItemLines(report.purchaseOrder.purchaseRequest.itemsPayload), taggedUnits: report.purchaseOrder.assetUnits })) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'The asset register could not be loaded. Please try again.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRequest(request, Role.Receiving_Custodian);
  if (!auth.success) return auth.response;
  try {
    const validation = RegisterAssetUnitsSchema.safeParse(await request.json());
    if (!validation.success) return NextResponse.json({ success: false, error: validation.error.issues[0]?.message || 'Check the asset details.' }, { status: 422 });
    const { receivingReportId, lineIndex, units } = validation.data;
    const assets = await prisma.$transaction(async (tx) => {
      const report = await tx.receivingReport.findUnique({ where: { id: receivingReportId }, include: { purchaseOrder: { include: { purchaseRequest: true } } } });
      if (!report || report.purchaseOrder.purchaseRequest.status !== PRStatus.Received_and_Closed) throw new Error('RECEIPT_REQUIRED');
      // Serialize registration for this PO; the unique index also guards retries.
      await tx.$queryRaw`SELECT id FROM PurchaseOrder WHERE id = ${report.purchaseOrderId} FOR UPDATE`;
      // A locking read sees registrations committed while this transaction waited.
      const existing = await tx.$queryRaw<{ lineIndex: number; unitNumber: number; serialNumber: string | null }[]>`SELECT lineIndex, unitNumber, serialNumber FROM AssetUnit WHERE purchaseOrderId = ${report.purchaseOrderId} FOR UPDATE`;
      const line = validateAssetSelection(report.purchaseOrder.purchaseRequest.itemsPayload, lineIndex, units, existing);
      const saved = [];
      for (const unit of units) {
        const id = crypto.randomUUID();
        saved.push(await tx.assetUnit.create({ data: { id, assetTag: `DMC-ASSET-${id.toUpperCase()}`, qrCodeToken: `ASSET-TOKEN-${id}`,
          purchaseOrderId: report.purchaseOrderId, receivingReportId, lineIndex, unitNumber: unit.unitNumber,
          itemName: line.itemName, serialNumber: unit.serialNumber || null, registeredById: auth.user.id } }));
      }
      return saved;
    });
    return NextResponse.json({ success: true, assets }, { status: 201 });
  } catch (error) {
    const messages: Record<string, string> = {
      RECEIPT_REQUIRED: 'Finalize the receiving report before registering equipment.',
      UNIT_OUTSIDE_ORDER: 'A unit is outside the saved PO quantity. Refresh and check the item line.',
      UNIT_ALREADY_TAGGED: 'A selected unit already has an asset tag. Refresh to see its existing label.',
      SERIAL_ALREADY_RECORDED: 'That serial number is already recorded on this PO. Check the physical unit.',
    };
    if (error instanceof Error && messages[error.message]) return NextResponse.json({ success: false, error: messages[error.message] }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ success: false, error: 'An asset tag already exists for this unit. Refresh before trying again.' }, { status: 409 });
    return NextResponse.json({ success: false, error: 'Asset registration could not be confirmed. Refresh the register before retrying.' }, { status: 500 });
  }
}
