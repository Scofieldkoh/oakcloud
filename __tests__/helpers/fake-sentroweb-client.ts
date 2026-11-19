import { vi, type Mock } from 'vitest';
import type { SentrowebConfig } from '@/lib/sentroweb/config';
import type {
  SentrowebClient,
  SentrowebSearchOutcome,
  SentrowebSearchRequest,
  SentrowebSession,
} from '@/services/sentroweb/client';
import { SentrowebError } from '@/services/sentroweb/errors';
import { loadCase, type FixtureCase } from './sentroweb-fixtures';

/**
 * A scripted stand-in for the Sentroweb browser client, for service and route tests. It never
 * opens a browser. `scripts` decides what each searched name returns; `hold` keeps a run in
 * RUNNING until the test releases it.
 */

export type Script =
  | { fixture: FixtureCase; pdf?: boolean; png?: boolean; creditsCharged?: number }
  | { throws: SentrowebError }
  | { outcome: SentrowebSearchOutcome };

export interface FakeClient {
  openSession: Mock<SentrowebClient['openSession']>;
  searches: SentrowebSearchRequest[];
  closeCalls: number;
  scripts: Map<string, Script>;
  openError: SentrowebError | null;
  balance: number;
  /** When set, openSession waits for it before doing anything. */
  hold: Promise<void> | null;
  /** Runs inside every search, after it is recorded and before it answers (to race recovery). */
  duringSearch: ((request: SentrowebSearchRequest) => Promise<void>) | null;
}

export function makeClient(): FakeClient {
  const client = {
    searches: [] as SentrowebSearchRequest[],
    closeCalls: 0,
    scripts: new Map<string, Script>(),
    openError: null as SentrowebError | null,
    balance: 100,
    hold: null as Promise<void> | null,
    duringSearch: null as FakeClient['duringSearch'],
  } as FakeClient;

  client.openSession = vi.fn<SentrowebClient['openSession']>(async (_config: SentrowebConfig, options) => {
    if (client.hold) await client.hold;
    if (client.openError) throw client.openError;
    if (options?.requiredCredits !== undefined && client.balance < options.requiredCredits) {
      throw new SentrowebError('INSUFFICIENT_CREDITS');
    }
    const session: SentrowebSession = {
      balance: client.balance,
      async search(request) {
        client.searches.push(request);
        if (client.duringSearch) await client.duringSearch(request);
        const script =
          client.scripts.get(request.name) ??
          ({ fixture: request.searchType === 'ENTITY' ? 'entity-clear' : 'individual-clear' } as Script);
        if ('throws' in script) throw script.throws;
        if ('outcome' in script) return script.outcome;
        const loaded = loadCase(script.fixture);
        loaded.json[0].name = request.name;
        // Like the real answer, it echoes what the search was sent with.
        loaded.json[0].country = request.country ?? '';
        loaded.json[0].dateOfBirth = request.dateOfBirth ?? '';
        loaded.json[0].fuzzyValue = request.fuzzy === true;
        return {
          json: loaded.json,
          domTitles: loaded.titles,
          pdf: script.pdf === false ? null : Buffer.from(`%PDF-1.4\n% report for test\n${'x'.repeat(200)}`),
          png: script.png === false ? null : Buffer.from('89504e470d0a1a0a', 'hex'),
          ...(script.creditsCharged === undefined ? {} : { creditsCharged: script.creditsCharged }),
        };
      },
      async close() {
        client.closeCalls += 1;
      },
    };
    return session;
  });
  return client;
}
