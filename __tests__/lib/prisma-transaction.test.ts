import { describe, expect, it, vi } from 'vitest';

import { runSerializableTransaction } from '@/lib/prisma-transaction';

describe('runSerializableTransaction', () => {
  it('retries serialization conflicts and returns the successful result', async () => {
    const transaction = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
      .mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
      .mockImplementationOnce(async (work) => work({}));

    await expect(
      runSerializableTransaction(
        { $transaction: transaction },
        async () => 'committed',
      ),
    ).resolves.toBe('committed');

    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-serialization failures', async () => {
    const failure = new Error('audit unavailable');
    const transaction = vi.fn().mockRejectedValue(failure);

    await expect(
      runSerializableTransaction(
        { $transaction: transaction },
        async () => 'never',
      ),
    ).rejects.toBe(failure);

    expect(transaction).toHaveBeenCalledOnce();
  });
});
