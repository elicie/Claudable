import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/services/auth';
import { getProjectForUser } from '@/lib/services/project';
import { getDeploymentForProject } from '@/lib/services/deployment';

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

    const deployment = await getDeploymentForProject(project_id);
    if (!deployment) {
      return NextResponse.json(
        { success: false, error: 'Deployment not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: deployment,
    });
  } catch (error) {
    console.error('[API] Failed to get deployment info:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get deployment info',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

