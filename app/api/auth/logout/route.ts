import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/services/auth';

export async function POST() {
  try {
    clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Failed to logout:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to logout',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

