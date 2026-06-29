import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { incrementConnectorUsage, resolveConnector } from '@/services/connector.service';

type FetchLike = typeof fetch;

interface MicrosoftGraphCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  siteId?: string;
  driveId?: string;
  userId?: string;
}

interface MicrosoftGraphSettings {
  rootFolder?: string;
  driveId?: string;
  userId?: string;
}

interface GraphResolvedConnector {
  connector: {
    id: string;
    provider: string;
    credentials: Record<string, unknown>;
    settings: unknown;
  };
}

const WORD_DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function toBodyArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function asSettings(value: unknown): MicrosoftGraphSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as MicrosoftGraphSettings;
}

function asCredentials(value: Record<string, unknown>): MicrosoftGraphCredentials {
  return value as unknown as MicrosoftGraphCredentials;
}

async function readGraphError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null) as
    | { error?: { message?: string }; error_description?: string; errorMessage?: string }
    | null;

  return body?.error?.message || body?.error_description || body?.errorMessage || fallback;
}

async function acquireGraphToken(
  credentials: MicrosoftGraphCredentials,
  fetchImpl: FetchLike
): Promise<string> {
  const response = await fetchImpl(
    `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!response.ok) {
    throw new Error(await readGraphError(response, 'Failed to acquire Microsoft Graph access token'));
  }

  const data = await response.json() as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Microsoft Graph token response did not include an access token');
  }

  return data.access_token;
}

function getDriveBaseUrl(input: {
  provider: string;
  credentials: MicrosoftGraphCredentials;
  settings: MicrosoftGraphSettings;
}): string {
  const driveId = input.credentials.driveId || input.settings.driveId;
  const userId = input.credentials.userId || input.settings.userId;

  if (input.provider === 'SHAREPOINT') {
    if (!input.credentials.siteId) {
      throw new Error('SharePoint connector must include a siteId for Word-to-PDF conversion');
    }

    return driveId
      ? `https://graph.microsoft.com/v1.0/sites/${input.credentials.siteId}/drives/${driveId}`
      : `https://graph.microsoft.com/v1.0/sites/${input.credentials.siteId}/drive`;
  }

  if (driveId) {
    return `https://graph.microsoft.com/v1.0/drives/${driveId}`;
  }

  if (userId) {
    return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/drive`;
  }

  throw new Error('OneDrive connector must include driveId or userId for Word-to-PDF conversion');
}

function encodeGraphPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function sanitizeTempFileName(fileName: string): string {
  const extension = extname(fileName) || '.docx';
  const rawBaseName = basename(fileName, extension) || 'document';
  const safeBaseName = rawBaseName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
  return `.oakcloud-esigning-${randomUUID()}-${safeBaseName}${extension}`;
}

function getTemporaryUploadPath(settings: MicrosoftGraphSettings, fileName: string): string {
  const rootFolder = settings.rootFolder?.replace(/^\/+|\/+$/g, '');
  const tempFileName = sanitizeTempFileName(fileName);
  return rootFolder ? `${rootFolder}/${tempFileName}` : tempFileName;
}

async function resolveMicrosoftGraphStorageConnector(tenantId: string): Promise<GraphResolvedConnector> {
  const resolved =
    (await resolveConnector(tenantId, 'STORAGE', 'SHAREPOINT')) ??
    (await resolveConnector(tenantId, 'STORAGE', 'ONEDRIVE'));

  if (!resolved) {
    throw new Error('Configure a SharePoint or OneDrive connector before uploading Word documents');
  }
  if (!isGraphConversionConnectorUsable(resolved as GraphResolvedConnector)) {
    throw new Error('Configure a SharePoint or OneDrive connector with a valid document library before uploading Word documents');
  }

  return resolved as GraphResolvedConnector;
}

function isGraphConversionConnectorUsable(resolved: GraphResolvedConnector | null): boolean {
  if (!resolved) {
    return false;
  }

  const credentials = asCredentials(resolved.connector.credentials);
  const settings = asSettings(resolved.connector.settings);

  if (resolved.connector.provider === 'SHAREPOINT') {
    return Boolean(credentials.siteId);
  }

  if (resolved.connector.provider === 'ONEDRIVE') {
    return Boolean(credentials.driveId || settings.driveId || credentials.userId || settings.userId);
  }

  return false;
}

export async function hasMicrosoftGraphDocumentConversionConnector(tenantId: string): Promise<boolean> {
  const sharePointConnector = await resolveConnector(tenantId, 'STORAGE', 'SHAREPOINT') as GraphResolvedConnector | null;
  if (isGraphConversionConnectorUsable(sharePointConnector)) {
    return true;
  }

  const oneDriveConnector = await resolveConnector(tenantId, 'STORAGE', 'ONEDRIVE') as GraphResolvedConnector | null;
  return isGraphConversionConnectorUsable(oneDriveConnector);
}

async function graphJson<T>(
  fetchImpl: FetchLike,
  url: string,
  token: string,
  options: RequestInit
): Promise<T> {
  const response = await fetchImpl(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readGraphError(response, `Microsoft Graph request failed: ${response.status}`));
  }

  return response.json() as Promise<T>;
}

async function graphDelete(fetchImpl: FetchLike, url: string, token: string): Promise<void> {
  const response = await fetchImpl(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(await readGraphError(response, `Failed to delete temporary Graph item: ${response.status}`));
  }
}

export async function convertOfficeDocumentToPdfWithMicrosoftGraph(input: {
  tenantId: string;
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
  fetchImpl?: FetchLike;
}): Promise<Buffer> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const resolved = await resolveMicrosoftGraphStorageConnector(input.tenantId);
  const credentials = asCredentials(resolved.connector.credentials);
  const settings = asSettings(resolved.connector.settings);
  const token = await acquireGraphToken(credentials, fetchImpl);
  const driveBaseUrl = getDriveBaseUrl({
    provider: resolved.connector.provider,
    credentials,
    settings,
  });
  const temporaryPath = getTemporaryUploadPath(settings, input.fileName);

  let uploadedItemId: string | null = null;

  try {
    const uploaded = await graphJson<{ id: string }>(
      fetchImpl,
      `${driveBaseUrl}/root:/${encodeGraphPath(temporaryPath)}:/content?@microsoft.graph.conflictBehavior=replace`,
      token,
      {
        method: 'PUT',
        headers: {
          'Content-Type': input.mimeType || WORD_DOCX_MIME_TYPE,
        },
        body: toBodyArrayBuffer(input.buffer),
      }
    );
    uploadedItemId = uploaded.id;

    const pdfResponse = await fetchImpl(`${driveBaseUrl}/items/${uploaded.id}/content?format=pdf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!pdfResponse.ok) {
      throw new Error(await readGraphError(pdfResponse, `Microsoft Graph PDF conversion failed: ${pdfResponse.status}`));
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    if (!pdfBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      throw new Error('Microsoft Graph conversion response was not a PDF');
    }

    await incrementConnectorUsage(resolved.connector.id);
    return pdfBuffer;
  } finally {
    if (uploadedItemId) {
      await graphDelete(fetchImpl, `${driveBaseUrl}/items/${uploadedItemId}`, token);
    }
  }
}
