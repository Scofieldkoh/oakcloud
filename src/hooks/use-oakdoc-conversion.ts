'use client';

import { useMutation } from '@tanstack/react-query';

type ConversionAction =
  | { action: 'convert'; expectedRevision: number }
  | { action: 'accept'; expectedRevision: number; acknowledgedCodes: string[] }
  | { action: 'reject'; expectedRevision: number };

export interface OakDocConversionResponse {
  document: { id: string; revision?: number; metadata?: Record<string, unknown> | null };
  reused?: boolean;
  decision?: 'accept' | 'reject';
}

async function postConversion(
  documentId: string,
  body: ConversionAction,
): Promise<OakDocConversionResponse> {
  const response = await fetch(`/api/generated-documents/${documentId}/oakdoc-conversion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The OakDoc conversion request failed');
  return data as OakDocConversionResponse;
}

/** Convert an A4 draft, or accept/reject a converted copy (P8). */
export function useOakDocConversion(documentId: string) {
  return useMutation({
    mutationFn: (body: ConversionAction) => postConversion(documentId, body),
  });
}
