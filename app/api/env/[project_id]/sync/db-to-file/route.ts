import { NextResponse } from 'next/server';
import { syncDbToEnvFile } from '@/lib/services/env';
import { requireCurrentUser } from '@/lib/services/auth';
import { getProjectForUser } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { project_id } = await params;
    const project = await getProjectForUser(project_id, user.id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 },
      );
    }
    const synced = await syncDbToEnvFile(project_id);
    return NextResponse.json({
      success: true,
      synced_count: synced,
      message: `Synced ${synced} env vars from database to file`,
    });
  } catch (error) {
    console.error('[Env API] Failed to sync DB to file:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to sync database to env file',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
