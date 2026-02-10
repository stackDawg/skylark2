// ============================================
// Sync API Route - Google Sheets Sync
// ============================================

import { NextResponse } from 'next/server';
import { forceSync, getDataSummary, syncAllToSheets } from '@/lib/dataStore';

export async function GET() {
  try {
    const summary = await getDataSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get sync status', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action || 'pull';

    if (action === 'pull') {
      const result = await forceSync();
      return NextResponse.json(result);
    }

    if (action === 'push') {
      const result = await syncAllToSheets();
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action. Use "pull" or "push".' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}
