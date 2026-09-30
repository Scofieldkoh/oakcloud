// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { routeErrorResponse } from '@/lib/api-route-errors';
import { ApiError, ConflictError, ErrorCodes, NotFoundError } from '@/lib/errors';

async function read(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe('routeErrorResponse', () => {
  it('maps auth and permission errors', async () => {
    await expect(read(routeErrorResponse(new Error('Unauthorized')))).resolves.toEqual({
      status: 401, body: { error: 'Unauthorized' },
    });
    await expect(read(routeErrorResponse(new Error('Forbidden')))).resolves.toEqual({
      status: 403, body: { error: 'Forbidden' },
    });
    await expect(read(routeErrorResponse(new Error('Permission denied: company:update')))).resolves.toEqual({
      status: 403, body: { error: 'Forbidden' },
    });
  });

  it('returns listed not-found and conflict messages', async () => {
    const options = { notFound: ['Company not found'], conflict: ['A tag with this name already exists'] };
    await expect(read(routeErrorResponse(new Error('Company not found'), options))).resolves.toEqual({
      status: 404, body: { error: 'Company not found' },
    });
    await expect(read(routeErrorResponse(new Error('A tag with this name already exists'), options))).resolves.toEqual({
      status: 409, body: { error: 'A tag with this name already exists' },
    });
    await expect(read(routeErrorResponse(new Error('Note tab not found'), { notFound: 'any' }))).resolves.toEqual({
      status: 404, body: { error: 'Note tab not found' },
    });
  });

  it('hides unrecognised errors unless the route falls back to 400', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(read(routeErrorResponse(new Error('db down'), { logLabel: 'Load failed:' }))).resolves.toEqual({
      status: 500, body: { error: 'Internal server error' },
    });
    expect(log).toHaveBeenCalledWith('Load failed:', expect.any(Error));
    await expect(read(routeErrorResponse(new Error('Company not found')))).resolves.toMatchObject({ status: 500 });
    await expect(read(routeErrorResponse('oops', { fallback: 'bad-request' }))).resolves.toMatchObject({ status: 500 });
    await expect(read(routeErrorResponse(new Error('Bad UEN'), { fallback: 'bad-request' }))).resolves.toEqual({
      status: 400, body: { error: 'Bad UEN' },
    });
    log.mockRestore();
  });

  it('keeps the status of application errors', async () => {
    const notFound = await read(routeErrorResponse(new NotFoundError('Deleted template not found')));
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toBe('Deleted template not found');
    const conflict = await read(routeErrorResponse(new ConflictError('In use'), { fallback: 'bad-request' }));
    expect(conflict.status).toBe(409);
    const internal = await read(routeErrorResponse(new ApiError(ErrorCodes.INTERNAL_ERROR, 'secret detail')));
    expect(internal).toEqual({ status: 500, body: { error: 'Internal server error' } });
  });
});
