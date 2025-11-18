import { prisma } from '@/lib/db/client';
import { previewManager } from '@/lib/services/preview';
import { getProjectById, updateProjectStatus } from '@/lib/services/project';
import { findAvailablePort } from '@/lib/utils/ports';
import path from 'path';
import fs from 'fs/promises';
import { spawn, type ChildProcess } from 'child_process';

export interface DeploymentInfo {
  projectId: string;
  subdomain: string;
  port: number;
  status: string;
  url: string | null;
  externalUrl: string | null;
}

const sanitizeForSubdomain = (value: string, prefix: string, maxLength = 50): string => {
  const safe = value.replace(/[^a-zA-Z0-9-]/g, '-');
  const base = `${prefix}${safe || 'app'}`.toLowerCase();
  if (base.length <= maxLength) {
    return base;
  }
  return base.slice(0, maxLength);
};

export const computeProjectSubdomain = (projectId: string): string => {
  return sanitizeForSubdomain(projectId, 'proj-');
};

const getAppsBaseDomain = (): string | null => {
  const raw = process.env.APPS_BASE_DOMAIN;
  if (!raw || !raw.trim()) return null;
  return raw.replace(/^https?:\/\//, '').trim();
};

const buildExternalUrl = (subdomain: string): string | null => {
  const baseDomain = getAppsBaseDomain();
  if (!baseDomain) return null;
  const host = `${subdomain}.${baseDomain}`;
  return `https://${host}`;
};

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

interface ProductionProcessInfo {
  process: ChildProcess | null;
  port: number;
  url: string | null;
  status: string;
  startedAt: Date;
}

const productionProcesses = new Map<string, ProductionProcessInfo>();

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.trim()) {
        console.log(`[Deploy:${label}][stdout]`, text.trim());
      }
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      if (text.trim()) {
        console.error(`[Deploy:${label}][stderr]`, text.trim());
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

export async function deployProjectApp(projectId: string): Promise<DeploymentInfo> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const projectPath = project.repoPath
    ? path.resolve(project.repoPath)
    : path.join(process.cwd(), 'projects', projectId);

  await fs.mkdir(projectPath, { recursive: true });

  // Ensure dependencies and basic structure exist (re-use PreviewManager logic)
  await previewManager.installDependencies(projectId);

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
  };

  // Build the project in production mode
  await runCommand(npmCommand, ['run', 'build'], projectPath, baseEnv, `${projectId}:build`);

  // Choose a port for production server
  const port = await findAvailablePort();
  const internalUrl = `http://localhost:${port}`;

  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    PORT: String(port),
    WEB_PORT: String(port),
    NEXT_PUBLIC_APP_URL: internalUrl,
  };

  // Stop any existing production process for this project
  const existingProc = productionProcesses.get(projectId);
  if (existingProc?.process) {
    try {
      existingProc.process.kill('SIGTERM');
    } catch {
      // ignore
    }
    productionProcesses.delete(projectId);
  }

  const child = spawn(
    npmCommand,
    ['run', 'start', '--', '--port', String(port)],
    {
      cwd: projectPath,
      env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const procInfo: ProductionProcessInfo = {
    process: child,
    port,
    url: internalUrl,
    status: 'starting',
    startedAt: new Date(),
  };

  productionProcesses.set(projectId, procInfo);

  child.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) {
      console.log(`[Deploy:${projectId}][stdout]`, text.trim());
    }
    if (procInfo.status === 'starting') {
      procInfo.status = 'running';
    }
  });

  child.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.trim()) {
      console.error(`[Deploy:${projectId}][stderr]`, text.trim());
    }
  });

  child.on('exit', (code, signal) => {
    procInfo.status = code === 0 ? 'stopped' : 'error';
    productionProcesses.delete(projectId);
    console.log(
      `[Deploy:${projectId}] process exited (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`,
    );
    updateProjectStatus(projectId, 'idle').catch((error) => {
      console.error('[Deploy] Failed to reset project status:', error);
    });
  });

  child.on('error', (error) => {
    procInfo.status = 'error';
    console.error(`[Deploy:${projectId}] process failed:`, error);
  });

  await updateProjectStatus(projectId, 'running').catch((error) => {
    console.error('[Deploy] Failed to update project status:', error);
  });

  const subdomain = computeProjectSubdomain(projectId);

  const existing = await prisma.projectDeployment.findFirst({
    where: { projectId },
  });

  if (existing) {
    await prisma.projectDeployment.update({
      where: { id: existing.id },
      data: {
        subdomain,
        port,
        status: procInfo.status,
      },
    });
  } else {
    await prisma.projectDeployment.create({
      data: {
        projectId,
        subdomain,
        port,
        status: procInfo.status,
      },
    });
  }

  return {
    projectId,
    subdomain,
    port,
    status: procInfo.status,
    url: internalUrl,
    externalUrl: buildExternalUrl(subdomain),
  };
}

export async function getDeploymentForProject(projectId: string): Promise<DeploymentInfo | null> {
  const deployment = await prisma.projectDeployment.findFirst({
    where: { projectId },
  });
  if (!deployment) {
    return null;
  }
  return {
    projectId,
    subdomain: deployment.subdomain,
    port: deployment.port,
    status: deployment.status,
    url: null,
    externalUrl: buildExternalUrl(deployment.subdomain),
  };
}
