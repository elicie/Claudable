import { NextRequest, NextResponse } from 'next/server';
import {
  getProjectCliPreference,
  updateProjectCliPreference,
  getProjectForUser,
} from '@/lib/services/project';
import { requireCurrentUser } from '@/lib/services/auth';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await requireCurrentUser();
  const { project_id } = await params;
  const project = await getProjectForUser(project_id, user.id);
  if (!project) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 },
    );
  }
  const preference = await getProjectCliPreference(project_id);
  if (!preference) {
    return NextResponse.json(
      { success: false, error: 'Project not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: preference });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
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
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload' },
        { status: 400 },
      );
    }

    const update = {
      preferredCli:
        typeof body.preferredCli === 'string'
          ? body.preferredCli
          : typeof body.preferred_cli === 'string'
          ? body.preferred_cli
          : undefined,
      fallbackEnabled:
        typeof body.fallbackEnabled === 'boolean'
          ? body.fallbackEnabled
          : typeof body.fallback_enabled === 'boolean'
          ? body.fallback_enabled
          : undefined,
      selectedModel:
        typeof body.selectedModel === 'string'
          ? body.selectedModel
          : typeof body.selected_model === 'string'
          ? body.selected_model
          : undefined,
    };

    const updated = await updateProjectCliPreference(project_id, update);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[API] Failed to update CLI preference:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update CLI preference',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
