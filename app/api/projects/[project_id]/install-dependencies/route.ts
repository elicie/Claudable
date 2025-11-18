/**
 * POST /api/projects/[project_id]/install-dependencies
 * Run npm install (or equivalent) for a project workspace.
 */

import { NextResponse } from 'next/server';
import { previewManager } from '@/lib/services/preview';
import { requireCurrentUser } from '@/lib/services/auth';
import { getProjectForUser } from '@/lib/services/project';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(
  _request: Request,
  { params }: RouteContext
) {
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
    const result = await previewManager.installDependencies(project_id);

    return NextResponse.json({
      success: true,
      logs: result.logs,
    });
  } catch (error) {
    console.error('[API] Failed to install dependencies:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to install dependencies',
      },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
