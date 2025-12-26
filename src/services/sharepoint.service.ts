/**
 * SharePoint Service
 *
 * Provides file operations for SharePoint document libraries using Microsoft Graph API.
 * Supports upload, download, list, sync, and delete operations.
 */

import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

const log = createLogger('sharepoint');

// ============================================================================
// Types
// ============================================================================

export interface SharePointCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  siteId: string;
  driveId?: string;
}

export interface SharePointSettings {
  rootFolder?: string;
  syncEnabled?: boolean;
  documentLibraryName?: string;
}

export interface SharePointFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  webUrl: string;
  downloadUrl?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  parentPath: string;
  eTag?: string;
}

export interface SharePointFolder {
  id: string;
  name: string;
  webUrl: string;
  childCount: number;
  parentPath: string;
}

export interface ListResult {
  files: SharePointFile[];
  folders: SharePointFolder[];
  nextLink?: string; // For pagination
}

export interface UploadResult {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  eTag: string;
}

// ============================================================================
// Token Management
// ============================================================================

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

async function getAccessToken(credentials: SharePointCredentials): Promise<string> {
  const cacheKey = `${credentials.tenantId}:${credentials.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid (with 5 minute buffer)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to acquire access token');
  }

  const data = await response.json();

  // Cache the token
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Subtract 60s for safety
  });

  return data.access_token;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDriveUrl(credentials: SharePointCredentials): string {
  return credentials.driveId
    ? `https://graph.microsoft.com/v1.0/sites/${credentials.siteId}/drives/${credentials.driveId}`
    : `https://graph.microsoft.com/v1.0/sites/${credentials.siteId}/drive`;
}

async function graphRequest<T>(
  credentials: SharePointCredentials,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken(credentials);
  const url = path.startsWith('http') ? path : `${getDriveUrl(credentials)}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Graph API error: ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * List files and folders in a path
 */
export async function listFiles(
  connectorId: string,
  path: string = '/',
  pageSize: number = 100,
  nextLink?: string
): Promise<ListResult> {
  const { credentials, settings } = await getConnectorConfig(connectorId);

  // Combine root folder from settings with requested path
  const fullPath = settings?.rootFolder
    ? `${settings.rootFolder.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
    : path;

  const encodedPath = encodeURIComponent(fullPath === '/' ? '' : fullPath);
  const endpoint =
    nextLink ||
    (encodedPath
      ? `/root:/${encodedPath}:/children?$top=${pageSize}`
      : `/root/children?$top=${pageSize}`);

  const response = await graphRequest<{
    value: Array<{
      id: string;
      name: string;
      size?: number;
      file?: { mimeType: string };
      folder?: { childCount: number };
      webUrl: string;
      '@microsoft.graph.downloadUrl'?: string;
      createdDateTime: string;
      lastModifiedDateTime: string;
      parentReference?: { path: string };
      eTag?: string;
    }>;
    '@odata.nextLink'?: string;
  }>(credentials, endpoint);

  const files: SharePointFile[] = [];
  const folders: SharePointFolder[] = [];

  for (const item of response.value) {
    if (item.folder) {
      folders.push({
        id: item.id,
        name: item.name,
        webUrl: item.webUrl,
        childCount: item.folder.childCount,
        parentPath: item.parentReference?.path || '',
      });
    } else if (item.file) {
      files.push({
        id: item.id,
        name: item.name,
        size: item.size || 0,
        mimeType: item.file.mimeType,
        webUrl: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl'],
        createdDateTime: item.createdDateTime,
        lastModifiedDateTime: item.lastModifiedDateTime,
        parentPath: item.parentReference?.path || '',
        eTag: item.eTag,
      });
    }
  }

  return {
    files,
    folders,
    nextLink: response['@odata.nextLink'],
  };
}

/**
 * Download a file by ID or path
 */
export async function downloadFile(
  connectorId: string,
  fileIdOrPath: string
): Promise<{ buffer: Buffer; metadata: SharePointFile }> {
  const { credentials } = await getConnectorConfig(connectorId);

  // Determine if it's an ID or path
  const isPath = fileIdOrPath.includes('/');
  const metadataEndpoint = isPath
    ? `/root:/${encodeURIComponent(fileIdOrPath)}`
    : `/items/${fileIdOrPath}`;

  // Get file metadata with download URL
  const metadata = await graphRequest<{
    id: string;
    name: string;
    size: number;
    file: { mimeType: string };
    webUrl: string;
    '@microsoft.graph.downloadUrl': string;
    createdDateTime: string;
    lastModifiedDateTime: string;
    parentReference?: { path: string };
    eTag?: string;
  }>(credentials, metadataEndpoint);

  // Download the file content
  const downloadUrl = metadata['@microsoft.graph.downloadUrl'];
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  log.info(`Downloaded file ${metadata.name} (${buffer.length} bytes)`);

  return {
    buffer,
    metadata: {
      id: metadata.id,
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.file.mimeType,
      webUrl: metadata.webUrl,
      downloadUrl,
      createdDateTime: metadata.createdDateTime,
      lastModifiedDateTime: metadata.lastModifiedDateTime,
      parentPath: metadata.parentReference?.path || '',
      eTag: metadata.eTag,
    },
  };
}

/**
 * Upload a file to SharePoint
 * Uses simple upload for files < 4MB, resumable upload for larger files
 */
export async function uploadFile(
  connectorId: string,
  path: string,
  fileName: string,
  content: Buffer,
  mimeType: string = 'application/octet-stream',
  conflictBehavior: 'rename' | 'replace' | 'fail' = 'rename'
): Promise<UploadResult> {
  const { credentials, settings } = await getConnectorConfig(connectorId);

  // Combine root folder from settings with requested path
  const fullPath = settings?.rootFolder
    ? `${settings.rootFolder.replace(/\/$/, '')}/${path.replace(/^\//, '').replace(/\/$/, '')}`
    : path.replace(/\/$/, '');

  const filePath = fullPath ? `${fullPath}/${fileName}` : fileName;
  const encodedPath = encodeURIComponent(filePath);

  // Use simple upload for files < 4MB
  if (content.length < 4 * 1024 * 1024) {
    const endpoint = `/root:/${encodedPath}:/content?@microsoft.graph.conflictBehavior=${conflictBehavior}`;

    const result = await graphRequest<{
      id: string;
      name: string;
      webUrl: string;
      size: number;
      eTag: string;
    }>(credentials, endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      body: new Uint8Array(content),
    });

    log.info(`Uploaded file ${fileName} to ${fullPath} (${content.length} bytes)`);

    return {
      id: result.id,
      name: result.name,
      webUrl: result.webUrl,
      size: result.size,
      eTag: result.eTag,
    };
  }

  // Use resumable upload for larger files
  return uploadLargeFile(credentials, encodedPath, content, mimeType, conflictBehavior);
}

/**
 * Resumable upload for large files (>4MB)
 */
async function uploadLargeFile(
  credentials: SharePointCredentials,
  encodedPath: string,
  content: Buffer,
  mimeType: string,
  conflictBehavior: string
): Promise<UploadResult> {
  // Create upload session
  const sessionEndpoint = `/root:/${encodedPath}:/createUploadSession`;
  const session = await graphRequest<{ uploadUrl: string }>(credentials, sessionEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': conflictBehavior,
      },
    }),
  });

  // Upload in chunks (10MB each)
  const chunkSize = 10 * 1024 * 1024;
  let offset = 0;

  while (offset < content.length) {
    const end = Math.min(offset + chunkSize, content.length);
    const chunk = content.subarray(offset, end);

    const response = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': chunk.length.toString(),
        'Content-Range': `bytes ${offset}-${end - 1}/${content.length}`,
      },
      body: new Uint8Array(chunk),
    });

    if (!response.ok && response.status !== 202) {
      throw new Error(`Upload chunk failed: ${response.status}`);
    }

    // If upload complete, return the result
    if (response.status === 200 || response.status === 201) {
      const result = await response.json();
      log.info(`Completed large file upload (${content.length} bytes)`);
      return {
        id: result.id,
        name: result.name,
        webUrl: result.webUrl,
        size: result.size,
        eTag: result.eTag,
      };
    }

    offset = end;
  }

  throw new Error('Upload session completed without returning file info');
}

/**
 * Delete a file or folder
 */
export async function deleteFile(connectorId: string, fileIdOrPath: string): Promise<void> {
  const { credentials } = await getConnectorConfig(connectorId);

  const isPath = fileIdOrPath.includes('/');
  const endpoint = isPath
    ? `/root:/${encodeURIComponent(fileIdOrPath)}`
    : `/items/${fileIdOrPath}`;

  await graphRequest(credentials, endpoint, { method: 'DELETE' });
  log.info(`Deleted item: ${fileIdOrPath}`);
}

/**
 * Create a folder
 */
export async function createFolder(
  connectorId: string,
  parentPath: string,
  folderName: string
): Promise<SharePointFolder> {
  const { credentials, settings } = await getConnectorConfig(connectorId);

  const fullPath = settings?.rootFolder
    ? `${settings.rootFolder.replace(/\/$/, '')}/${parentPath.replace(/^\//, '')}`
    : parentPath;

  const encodedPath = encodeURIComponent(fullPath === '/' ? '' : fullPath);
  const endpoint = encodedPath ? `/root:/${encodedPath}:/children` : '/root/children';

  const result = await graphRequest<{
    id: string;
    name: string;
    webUrl: string;
    folder: { childCount: number };
    parentReference?: { path: string };
  }>(credentials, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      '@microsoft.graph.conflictBehavior': 'rename',
    }),
  });

  log.info(`Created folder: ${folderName} in ${fullPath}`);

  return {
    id: result.id,
    name: result.name,
    webUrl: result.webUrl,
    childCount: result.folder.childCount,
    parentPath: result.parentReference?.path || '',
  };
}

/**
 * Get delta changes for sync
 */
export async function getDeltaChanges(
  connectorId: string,
  deltaLink?: string
): Promise<{
  changes: Array<{
    id: string;
    name: string;
    deleted?: boolean;
    file?: { mimeType: string };
    folder?: { childCount: number };
    lastModifiedDateTime: string;
    parentReference?: { path: string };
  }>;
  deltaLink: string;
}> {
  const { credentials, settings } = await getConnectorConfig(connectorId);

  const endpoint =
    deltaLink ||
    (settings?.rootFolder
      ? `/root:/${encodeURIComponent(settings.rootFolder)}:/delta`
      : '/root/delta');

  const response = await graphRequest<{
    value: Array<{
      id: string;
      name: string;
      deleted?: { state: string };
      file?: { mimeType: string };
      folder?: { childCount: number };
      lastModifiedDateTime: string;
      parentReference?: { path: string };
    }>;
    '@odata.deltaLink': string;
  }>(credentials, endpoint);

  return {
    changes: response.value.map((item) => ({
      id: item.id,
      name: item.name,
      deleted: !!item.deleted,
      file: item.file,
      folder: item.folder,
      lastModifiedDateTime: item.lastModifiedDateTime,
      parentReference: item.parentReference,
    })),
    deltaLink: response['@odata.deltaLink'],
  };
}

/**
 * Get site and drive information for display
 */
export async function getSiteInfo(connectorId: string): Promise<{
  siteName: string;
  siteUrl: string;
  driveName: string;
  driveQuota: {
    total: number;
    used: number;
    remaining: number;
  };
}> {
  const { credentials } = await getConnectorConfig(connectorId);
  const token = await getAccessToken(credentials);

  // Get site info
  const siteResponse = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${credentials.siteId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const siteData = await siteResponse.json();

  // Get drive info
  const driveUrl = getDriveUrl(credentials);
  const driveResponse = await fetch(driveUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const driveData = await driveResponse.json();

  return {
    siteName: siteData.displayName || siteData.name,
    siteUrl: siteData.webUrl,
    driveName: driveData.name,
    driveQuota: {
      total: driveData.quota?.total || 0,
      used: driveData.quota?.used || 0,
      remaining: driveData.quota?.remaining || 0,
    },
  };
}

/**
 * Copy a file or folder to a new location
 */
export async function copyItem(
  connectorId: string,
  itemIdOrPath: string,
  destinationPath: string,
  newName?: string
): Promise<{ id: string; webUrl: string }> {
  const { credentials, settings } = await getConnectorConfig(connectorId);
  const token = await getAccessToken(credentials);

  const isPath = itemIdOrPath.includes('/');
  const endpoint = isPath
    ? `${getDriveUrl(credentials)}/root:/${encodeURIComponent(itemIdOrPath)}:/copy`
    : `${getDriveUrl(credentials)}/items/${itemIdOrPath}/copy`;

  // Build destination path
  const fullDestPath = settings?.rootFolder
    ? `${settings.rootFolder.replace(/\/$/, '')}/${destinationPath.replace(/^\//, '')}`
    : destinationPath;

  const body: Record<string, unknown> = {
    parentReference: {
      driveId: credentials.driveId || 'root',
      path: `/drive/root:/${encodeURIComponent(fullDestPath)}`,
    },
  };

  if (newName) {
    body.name = newName;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Copy failed: ${response.status}`);
  }

  // Copy returns 202 with a Location header for async operation
  // For simplicity, we return the location header
  const location = response.headers.get('Location');
  log.info(`Copy initiated: ${itemIdOrPath} -> ${destinationPath}`);

  return {
    id: '', // Will be available when operation completes
    webUrl: location || '',
  };
}

/**
 * Move a file or folder to a new location
 */
export async function moveItem(
  connectorId: string,
  itemIdOrPath: string,
  destinationPath: string,
  newName?: string
): Promise<{ id: string; webUrl: string }> {
  const { credentials, settings } = await getConnectorConfig(connectorId);

  const isPath = itemIdOrPath.includes('/');
  const endpoint = isPath
    ? `/root:/${encodeURIComponent(itemIdOrPath)}`
    : `/items/${itemIdOrPath}`;

  // Build destination path
  const fullDestPath = settings?.rootFolder
    ? `${settings.rootFolder.replace(/\/$/, '')}/${destinationPath.replace(/^\//, '')}`
    : destinationPath;

  const body: Record<string, unknown> = {
    parentReference: {
      path: `/drive/root:/${encodeURIComponent(fullDestPath)}`,
    },
  };

  if (newName) {
    body.name = newName;
  }

  const result = await graphRequest<{
    id: string;
    webUrl: string;
  }>(credentials, endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  log.info(`Moved item: ${itemIdOrPath} -> ${destinationPath}`);

  return {
    id: result.id,
    webUrl: result.webUrl,
  };
}

/**
 * Rename a file or folder
 */
export async function renameItem(
  connectorId: string,
  itemIdOrPath: string,
  newName: string
): Promise<{ id: string; name: string; webUrl: string }> {
  const { credentials } = await getConnectorConfig(connectorId);

  const isPath = itemIdOrPath.includes('/');
  const endpoint = isPath
    ? `/root:/${encodeURIComponent(itemIdOrPath)}`
    : `/items/${itemIdOrPath}`;

  const result = await graphRequest<{
    id: string;
    name: string;
    webUrl: string;
  }>(credentials, endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });

  log.info(`Renamed item: ${itemIdOrPath} -> ${newName}`);

  return {
    id: result.id,
    name: result.name,
    webUrl: result.webUrl,
  };
}

/**
 * Search for files and folders
 */
export async function searchItems(
  connectorId: string,
  query: string,
  pageSize: number = 25
): Promise<{
  items: Array<SharePointFile | SharePointFolder>;
  nextLink?: string;
}> {
  const { credentials } = await getConnectorConfig(connectorId);

  const endpoint = `/root/search(q='${encodeURIComponent(query)}')?$top=${pageSize}`;

  const response = await graphRequest<{
    value: Array<{
      id: string;
      name: string;
      size?: number;
      file?: { mimeType: string };
      folder?: { childCount: number };
      webUrl: string;
      '@microsoft.graph.downloadUrl'?: string;
      createdDateTime: string;
      lastModifiedDateTime: string;
      parentReference?: { path: string };
      eTag?: string;
    }>;
    '@odata.nextLink'?: string;
  }>(credentials, endpoint);

  const items: Array<SharePointFile | SharePointFolder> = response.value.map((item) => {
    if (item.folder) {
      return {
        id: item.id,
        name: item.name,
        webUrl: item.webUrl,
        childCount: item.folder.childCount,
        parentPath: item.parentReference?.path || '',
      } as SharePointFolder;
    }
    return {
      id: item.id,
      name: item.name,
      size: item.size || 0,
      mimeType: item.file?.mimeType || 'application/octet-stream',
      webUrl: item.webUrl,
      downloadUrl: item['@microsoft.graph.downloadUrl'],
      createdDateTime: item.createdDateTime,
      lastModifiedDateTime: item.lastModifiedDateTime,
      parentPath: item.parentReference?.path || '',
      eTag: item.eTag,
    } as SharePointFile;
  });

  return {
    items,
    nextLink: response['@odata.nextLink'],
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function getConnectorConfig(connectorId: string): Promise<{
  credentials: SharePointCredentials;
  settings: SharePointSettings | null;
}> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId, deletedAt: null },
  });

  if (!connector) {
    throw new Error('Connector not found');
  }

  if (connector.provider !== 'SHAREPOINT') {
    throw new Error('Invalid connector type');
  }

  const credentials = JSON.parse(decrypt(connector.credentials)) as SharePointCredentials;
  const settings = connector.settings as SharePointSettings | null;

  return { credentials, settings };
}
