interface SerializableTransactionClient<TTransaction> {
  $transaction<TResult>(
    work: (transaction: TTransaction) => Promise<TResult>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<TResult>;
}

export function isSerializationConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'P2034',
  );
}

export async function runSerializableTransaction<TTransaction, TResult>(
  client: SerializableTransactionClient<TTransaction>,
  work: (transaction: TTransaction) => Promise<TResult>,
  maxAttempts = 3,
): Promise<TResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error('Serializable transaction retry limit reached');
}
