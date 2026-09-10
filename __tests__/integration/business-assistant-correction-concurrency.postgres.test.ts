// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

const connectionString = process.env.BUSINESS_ASSISTANT_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

suite('Business Assistant correction concurrency on PostgreSQL', () => {
  let control: Client;

  beforeAll(async () => {
    const url = new URL(connectionString!);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !/(?:^|[_-])test(?:[_-]|$)/i.test(url.pathname.slice(1))
      || url.port === '5433') {
      throw new Error('Correction concurrency tests require the isolated disposable PostgreSQL database.');
    }
    control = new Client({ connectionString });
    await control.connect();
  });

  afterAll(async () => {
    await control?.end();
  });

  it('measures the shared correction barrier wait and releases promptly after the competing transaction commits', async () => {
    const blocker = new Client({ connectionString });
    const correction = new Client({ connectionString });
    await Promise.all([blocker.connect(), correction.connect()]);
    try {
      await blocker.query('BEGIN');
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('oakcloud:business-operation:correction-test', 0))");

      await correction.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await correction.query("SET LOCAL statement_timeout = '2000ms'");
      const startedAt = Date.now();
      const waiting = correction.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('oakcloud:business-operation:correction-test', 0))");
      await delay(120);
      let settled = false;
      void waiting.then(() => { settled = true; });
      await delay(20);
      expect(settled).toBe(false);

      await blocker.query('COMMIT');
      await waiting;
      const waitedMs = Date.now() - startedAt;
      expect(waitedMs).toBeGreaterThanOrEqual(100);
      expect(waitedMs).toBeLessThan(1_500);
      await correction.query('COMMIT');
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await correction.query('ROLLBACK').catch(() => undefined);
      await Promise.all([blocker.end(), correction.end()]);
    }
  });

  it('fails closed on a bounded PostgreSQL lock timeout without applying a later statement', async () => {
    const blocker = new Client({ connectionString });
    const correction = new Client({ connectionString });
    await Promise.all([blocker.connect(), correction.connect()]);
    try {
      await blocker.query('BEGIN');
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('oakcloud:business-operation:correction-timeout', 0))");

      await correction.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await correction.query("SET LOCAL statement_timeout = '150ms'");
      const startedAt = Date.now();
      await expect(correction.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('oakcloud:business-operation:correction-timeout', 0))"))
        .rejects.toMatchObject({ code: '57014' });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
      await expect(correction.query('SELECT 1')).rejects.toMatchObject({ code: '25P02' });
      await correction.query('ROLLBACK');
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await correction.query('ROLLBACK').catch(() => undefined);
      await Promise.all([blocker.end(), correction.end()]);
    }
  });
});
