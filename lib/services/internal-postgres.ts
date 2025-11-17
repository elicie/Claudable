import { randomBytes } from 'crypto';
import { Client } from 'pg';
import { URL } from 'url';
import { getProjectService, upsertProjectServiceConnection } from '@/lib/services/project-services';

export interface ProjectDatabaseInfo {
  projectId: string;
  databaseName: string;
  username: string;
  password: string;
  host: string;
  port: number;
  databaseUrl: string;
}

const ADMIN_URL_ENV = 'DB_ADMIN_URL';

const getAdminDatabaseUrl = (): string => {
  const url = process.env[ADMIN_URL_ENV];
  if (!url) {
    throw new Error(`${ADMIN_URL_ENV} is not configured`);
  }
  return url;
};

const sanitizeIdentifier = (value: string, prefix: string, maxLength = 60): string => {
  const safe = value.replace(/[^a-zA-Z0-9_]/g, '_');
  const base = `${prefix}${safe || 'default'}`;
  if (base.length <= maxLength) {
    return base;
  }
  return base.slice(0, maxLength);
};

const generatePassword = (length = 32): string => {
  return randomBytes(length).toString('base64url');
};

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = getAdminDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const createDatabaseUrl = (adminUrl: string, databaseName: string, username: string, password: string): string => {
  const url = new URL(adminUrl);
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(password);
  url.pathname = `/${databaseName}`;
  return url.toString();
};

export async function provisionProjectDatabase(
  projectId: string,
  ownerId: string,
): Promise<ProjectDatabaseInfo> {
  const existing = await getProjectService(projectId, 'internal_db');
  if (existing && existing.serviceData && typeof existing.serviceData === 'object') {
    const data = existing.serviceData as Record<string, unknown>;
    const host = String(data.host ?? '');
    const port = Number(data.port ?? 5432) || 5432;
    const databaseName = String(data.database_name ?? '');
    const username = String(data.username ?? '');
    const databaseUrl = String(data.database_url ?? '');

    if (host && databaseName && username && databaseUrl) {
      return {
        projectId,
        databaseName,
        username,
        password: '',
        host,
        port,
        databaseUrl,
      };
    }
  }

  const adminUrl = getAdminDatabaseUrl();
  const parsed = new URL(adminUrl);
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : 5432;

  const databaseName = sanitizeIdentifier(projectId, 'app_db_');
  const username = sanitizeIdentifier(ownerId, 'app_u_');
  const password = generatePassword();

  await withAdminClient(async (client) => {
    try {
      await client.query(`CREATE ROLE "${username}" LOGIN PASSWORD $1`, [password]);
    } catch (error: any) {
      if (error && typeof error === 'object' && (error as any).code === '42710') {
        await client.query(`ALTER ROLE "${username}" WITH LOGIN PASSWORD $1`, [password]);
      } else {
        throw error;
      }
    }

    try {
      await client.query(`CREATE DATABASE "${databaseName}" OWNER "${username}"`);
    } catch (error: any) {
      if (!(error && typeof error === 'object' && (error as any).code === '42P04')) {
        throw error;
      }
    }
  });

  const databaseUrl = createDatabaseUrl(adminUrl, databaseName, username, password);

  await upsertProjectServiceConnection(projectId, 'internal_db', {
    host,
    port,
    database_name: databaseName,
    username,
    database_url: databaseUrl,
    created_at: new Date().toISOString(),
    owner_id: ownerId,
  });

  return {
    projectId,
    databaseName,
    username,
    password,
    host,
    port,
    databaseUrl,
  };
}

