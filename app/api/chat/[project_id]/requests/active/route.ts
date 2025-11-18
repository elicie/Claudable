import { NextResponse } from 'next/server';
import { getActiveRequests } from '@/lib/services/user-requests';
import { requireCurrentUser } from '@/lib/services/auth';
import { getProjectForUser } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
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
    const summary = await getActiveRequests(project_id);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('[API] Failed to get active requests:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get active requests',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
