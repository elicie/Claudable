import { prisma } from '@/lib/db/client';
import { previewManager } from '@/lib/services/preview';

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

export async function deployProjectApp(projectId: string): Promise<DeploymentInfo> {
  const preview = await previewManager.start(projectId);
  const port = preview.port ?? 0;
  const url = preview.url ?? null;
  const status = preview.status;

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
        status,
      },
    });
  } else {
    await prisma.projectDeployment.create({
      data: {
        projectId,
        subdomain,
        port,
        status,
      },
    });
  }

  return {
    projectId,
    subdomain,
    port,
    status,
    url,
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
