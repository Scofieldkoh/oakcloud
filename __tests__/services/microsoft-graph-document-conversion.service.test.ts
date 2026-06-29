import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveConnector: vi.fn(),
  incrementConnectorUsage: vi.fn(),
}));

vi.mock('@/services/connector.service', () => ({
  resolveConnector: mocks.resolveConnector,
  incrementConnectorUsage: mocks.incrementConnectorUsage,
}));

import { convertOfficeDocumentToPdfWithMicrosoftGraph } from '@/services/microsoft-graph-document-conversion.service';
import { hasMicrosoftGraphDocumentConversionConnector } from '@/services/microsoft-graph-document-conversion.service';

function response(body: unknown, init: ResponseInit = {}): Response {
  if (body instanceof Uint8Array) {
    const arrayBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(arrayBuffer).set(body);
    return new Response(arrayBuffer, init);
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

describe('microsoft-graph-document-conversion.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a Word document to SharePoint, downloads it as PDF, and deletes the temporary file', async () => {
    mocks.resolveConnector.mockResolvedValueOnce({
      source: 'workspace',
      connector: {
        id: 'connector-sharepoint',
        provider: 'SHAREPOINT',
        credentials: {
          clientId: 'client-id',
          clientSecret: 'client-secret',
          tenantId: 'tenant-ms',
          siteId: 'site-id',
          driveId: 'drive-id',
        },
        settings: {
          rootFolder: 'OakcloudTemp',
        },
      },
    });

    const pdfBuffer = Buffer.from('%PDF-1.7\nfrom graph');
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = url.toString();

      if (target.includes('/oauth2/v2.0/token')) {
        return response({ access_token: 'graph-token', expires_in: 3600 });
      }

      if (target.includes('/root:/OakcloudTemp/') && init?.method === 'PUT') {
        expect(init.headers).toMatchObject({
          Authorization: 'Bearer graph-token',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        return response({ id: 'uploaded-item-id', name: 'uploaded.docx' });
      }

      if (target.endsWith('/items/uploaded-item-id/content?format=pdf')) {
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer graph-token' });
        return response(new Uint8Array(pdfBuffer), {
          headers: { 'Content-Type': 'application/pdf' },
        });
      }

      if (target.endsWith('/items/uploaded-item-id') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    const result = await convertOfficeDocumentToPdfWithMicrosoftGraph({
      tenantId: 'workspace-id',
      fileName: 'Agreement.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx bytes'),
      fetchImpl,
    });

    expect(result).toEqual(pdfBuffer);
    expect(mocks.resolveConnector).toHaveBeenCalledWith('workspace-id', 'STORAGE', 'SHAREPOINT');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/sites/site-id/drives/drive-id/items/uploaded-item-id',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(mocks.incrementConnectorUsage).toHaveBeenCalledWith('connector-sharepoint');
  });

  it('falls back to a OneDrive connector when it has a drive target', async () => {
    mocks.resolveConnector
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        source: 'system',
        connector: {
          id: 'connector-onedrive',
          provider: 'ONEDRIVE',
          credentials: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            tenantId: 'tenant-ms',
            driveId: 'drive-id',
          },
          settings: null,
        },
      });

    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = url.toString();

      if (target.includes('/oauth2/v2.0/token')) {
        return response({ access_token: 'graph-token', expires_in: 3600 });
      }
      if (target.includes('/drives/drive-id/root:/') && init?.method === 'PUT') {
        return response({ id: 'onedrive-item-id' });
      }
      if (target.endsWith('/drives/drive-id/items/onedrive-item-id/content?format=pdf')) {
        return response(new Uint8Array(Buffer.from('%PDF-1.7\nonedrive')));
      }
      if (target.endsWith('/drives/drive-id/items/onedrive-item-id') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      throw new Error(`Unexpected fetch: ${target}`);
    });

    const result = await convertOfficeDocumentToPdfWithMicrosoftGraph({
      tenantId: 'workspace-id',
      fileName: 'Agreement.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx bytes'),
      fetchImpl,
    });

    expect(result.toString('utf8')).toContain('%PDF');
    expect(mocks.resolveConnector).toHaveBeenNthCalledWith(1, 'workspace-id', 'STORAGE', 'SHAREPOINT');
    expect(mocks.resolveConnector).toHaveBeenNthCalledWith(2, 'workspace-id', 'STORAGE', 'ONEDRIVE');
    expect(mocks.incrementConnectorUsage).toHaveBeenCalledWith('connector-onedrive');
  });

  it('throws a clear error when no Microsoft Graph storage connector is available', async () => {
    mocks.resolveConnector.mockResolvedValue(null);

    await expect(
      convertOfficeDocumentToPdfWithMicrosoftGraph({
        tenantId: 'workspace-id',
        fileName: 'Agreement.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('docx bytes'),
      })
    ).rejects.toThrow('Configure a SharePoint or OneDrive connector before uploading Word documents');
  });

  it('reports conversion unavailable when no Microsoft storage connector resolves', async () => {
    mocks.resolveConnector.mockResolvedValue(null);

    await expect(hasMicrosoftGraphDocumentConversionConnector('workspace-id')).resolves.toBe(false);
  });

  it('reports conversion available for a SharePoint connector with a site target', async () => {
    mocks.resolveConnector.mockResolvedValueOnce({
      connector: {
        provider: 'SHAREPOINT',
        credentials: {
          siteId: 'site-id',
          tenantId: 'tenant-ms',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        },
        settings: null,
      },
    });

    await expect(hasMicrosoftGraphDocumentConversionConnector('workspace-id')).resolves.toBe(true);
  });

  it('reports conversion unavailable for a OneDrive connector without a drive or user target', async () => {
    mocks.resolveConnector
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        connector: {
          provider: 'ONEDRIVE',
          credentials: {
            tenantId: 'tenant-ms',
            clientId: 'client-id',
            clientSecret: 'client-secret',
          },
          settings: null,
        },
      });

    await expect(hasMicrosoftGraphDocumentConversionConnector('workspace-id')).resolves.toBe(false);
  });
});
