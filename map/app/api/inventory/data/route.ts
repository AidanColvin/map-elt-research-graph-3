/**
 * GET /api/inventory/data?set=partnerships|accounts
 * The ONLY door to the workbook inventory. Serves the requested dataset when
 * the caller presents either:
 *   - a valid inventory token (X-Inventory-Token, minted by /unlock), or
 *   - a verified, owner-approved Firebase account (Bearer token).
 * Everyone else gets 401 with no data. The datasets are server-only modules,
 * imported lazily so each response loads just the set it serves.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { tokenValid } from '@/lib/inventory/gate';
import { verifyAuth } from '@/lib/verifyAuth';
import { isApprovedCaller } from '@/lib/serverApproval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const unlocked =
    tokenValid(request.headers.get('x-inventory-token')) ||
    (await isApprovedCaller(await verifyAuth(request)));
  if (!unlocked) {
    return NextResponse.json({ error: 'Locked' }, { status: 401 });
  }

  const set = request.nextUrl.searchParams.get('set');
  // Auth-gated payloads must never land in a shared cache.
  const headers = { 'Cache-Control': 'private, no-store' };

  if (set === 'partnerships') {
    const { PARTNERSHIP_RECORDS } = await import('@/lib/inventory/partnershipRecords');
    return NextResponse.json({ data: PARTNERSHIP_RECORDS }, { headers });
  }
  if (set === 'accounts') {
    const { INVENTORY_ACCOUNTS } = await import('@/lib/inventory/accountRecords');
    return NextResponse.json({ data: INVENTORY_ACCOUNTS }, { headers });
  }
  return NextResponse.json({ error: 'Unknown set' }, { status: 400 });
}
