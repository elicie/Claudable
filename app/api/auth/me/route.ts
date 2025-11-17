import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/services/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 },
      );
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('[API] Failed to get current user:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get current user',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

