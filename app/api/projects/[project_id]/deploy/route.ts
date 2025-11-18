/**
 * POST /api/projects/[project_id]/deploy
 *
 * Phase 2: Provision internal Postgres database for the project and
 * inject DATABASE_URL into the project's production env file.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { requireCurrentUser } from '@/lib/services/auth';
import { getProjectForUser } from '@/lib/services/project';
import { provisionProjectDatabase } from '@/lib/services/internal-postgres';
import { deployProjectApp } from '@/lib/services/deployment';

interface RouteContext {
  params: Promise<{ project_id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
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

    const dbInfo = await provisionProjectDatabase(project_id, user.id);

    const projectPath =
      project.repoPath && project.repoPath.trim().length > 0
        ? path.resolve(project.repoPath)
        : path.join(process.cwd(), 'projects', project_id);

    await fs.mkdir(projectPath, { recursive: true });
    const envPath = path.join(projectPath, '.env.production');

    let existing = '';
    try {
      existing = await fs.readFile(envPath, 'utf8');
    } catch {
      existing = '';
    }

    const lines = existing
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('DATABASE_URL='));

    lines.push(`DATABASE_URL=${dbInfo.databaseUrl}`);
    const nextEnv = lines.join('\n') + '\n';
    await fs.writeFile(envPath, nextEnv, 'utf8');

    const deployment = await deployProjectApp(project_id);

    return NextResponse.json({
      success: true,
      data: {
        database: {
          host: dbInfo.host,
          port: dbInfo.port,
          name: dbInfo.databaseName,
          username: dbInfo.username,
          hasPassword: true,
        },
        deployment: {
          subdomain: deployment.subdomain,
          port: deployment.port,
          status: deployment.status,
          internalUrl: deployment.url,
          externalUrl: deployment.externalUrl,
        },
        envPath,
      },
    });
  } catch (error) {
    console.error('[API] Failed to deploy project (DB provision):', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to deploy project',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
