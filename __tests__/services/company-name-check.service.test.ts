import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompanyNameCheckUnavailableError,
  checkCompanyNameAvailability,
} from '@/lib/external/company-name-check';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('checkCompanyNameAvailability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns available when no similar ACRA records are returned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { businessNameService: { status: 'OK', records: [] } },
      hasError: false,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCompanyNameAvailability('  Zxqkqw   Vmxqkq  ');

    expect(result.available).toBe(true);
    expect(result.records).toEqual([]);
    expect(typeof result.checkedAt).toBe('string');
    expect(result.checkedAt.length).toBeGreaterThan(0);
  });

  it('returns similar records and marks the name unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        businessNameService: {
          status: 'OK',
          records: [
            { uen: '201904999E', entityName: 'BIF IV ACME HOLDINGS PTE. LTD.', entityStatus: 'LIVE COMPANY' },
          ],
        },
      },
      hasError: false,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCompanyNameAvailability('Acme Holdings');

    expect(result.available).toBe(false);
    expect(result.records).toEqual([
      { uen: '201904999E', entityName: 'BIF IV ACME HOLDINGS PTE. LTD.', entityStatus: 'LIVE COMPANY' },
    ]);
  });

  it('caps records and ignores malformed entries', async () => {
    const records: Array<Record<string, unknown>> = Array.from({ length: 15 }, (_, index) => ({
      uen: `UEN-${index}`,
      entityName: `Company ${index}`,
      entityStatus: 'LIVE COMPANY',
    }));
    records.push({ uen: '', entityName: '', entityStatus: '' });
    records.push({ notARealRecord: true });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { businessNameService: { status: 'OK', records } },
      hasError: false,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkCompanyNameAvailability('Acme Holdings');

    expect(result.records).toHaveLength(10);
  });

  it('encodes the search term as a query parameter', async () => {
    let capturedUrl = '';
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ data: { businessNameService: { status: 'OK', records: [] } }, hasError: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    await checkCompanyNameAvailability('Acme Holdings');

    expect(capturedUrl).toContain('search-term=Acme+Holdings');
  });

  it('throws a typed error after retrying a 5xx response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
      .mockResolvedValueOnce(new Response('upstream error', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkCompanyNameAvailability('Acme Holdings')).rejects.toBeInstanceOf(
      CompanyNameCheckUnavailableError
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error when the request times out twice', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn().mockRejectedValue(aborted);
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkCompanyNameAvailability('Acme Holdings')).rejects.toBeInstanceOf(
      CompanyNameCheckUnavailableError
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects empty names', async () => {
    await expect(checkCompanyNameAvailability('   ')).rejects.toThrow('Company name is required');
  });
});
