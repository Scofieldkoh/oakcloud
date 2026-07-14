import type { ContactIdentityCandidate, ContactMatchPreview } from '@/types/contact-identity';

const MAX_PREVIEW_BATCH_SIZE = 100;
type ContactPreviewFetcher = (input: string, init: RequestInit) => Promise<Response>;

export async function fetchBizFileContactMatchPreviews(
  candidates: ContactIdentityCandidate[],
  fetcher: ContactPreviewFetcher = fetch,
): Promise<Record<string, ContactMatchPreview | null>> {
  const batches: ContactIdentityCandidate[][] = [];
  for (let index = 0; index < candidates.length; index += MAX_PREVIEW_BATCH_SIZE) {
    batches.push(candidates.slice(index, index + MAX_PREVIEW_BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(async (batch) => {
    const response = await fetcher('/api/contacts/match-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidates: batch }),
    });
    if (!response.ok) throw new Error('Unable to preview contact matches');
    const result = await response.json() as { matches?: Record<string, ContactMatchPreview | null> };
    if (!result.matches) throw new Error('Unable to preview contact matches');
    return result.matches;
  }));

  return Object.assign({}, ...results);
}
