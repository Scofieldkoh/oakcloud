import type {
  SentrowebCandidateDto,
  SentrowebCandidatesResponse,
  SentrowebResultDto,
  SentrowebRunDto,
} from '@/lib/sentroweb/types';

export function candidate(index: number, overrides: Partial<SentrowebCandidateDto> = {}): SentrowebCandidateDto {
  return {
    key: `key-${index}`,
    name: `Person ${index}`,
    entityKind: 'INDIVIDUAL',
    searchType: 'INDIVIDUAL',
    roles: ['DIRECTOR'],
    identifierType: null,
    identifier: null,
    searchDetails: { country: null, dateOfBirth: false, gender: false },
    ...overrides,
  };
}

export function candidatesResponse(
  count: number,
  overrides: Partial<SentrowebCandidatesResponse> = {},
): SentrowebCandidatesResponse {
  return {
    configured: true,
    maxEntities: 10,
    creditsPerSearch: 1,
    candidates: Array.from({ length: count }, (_, index) => candidate(index + 1)),
    activeRunId: null,
    cooldownUntil: null,
    ...overrides,
  };
}

export function result(overrides: Partial<SentrowebResultDto> = {}): SentrowebResultDto {
  return {
    id: 'result-1',
    position: 0,
    name: 'Alice Tan',
    entityKind: 'INDIVIDUAL',
    searchType: 'INDIVIDUAL',
    roles: ['DIRECTOR'],
    identifierType: null,
    identifier: null,
    searchDetails: { country: null, dateOfBirth: false, gender: false },
    status: 'CLEAR',
    matchCount: 0,
    categoryCounts: {},
    matches: [],
    monitorEnabled: true,
    errorCode: null,
    errorMessage: null,
    documentId: null,
    hasScreenshot: false,
    checkedAt: '2026-11-18T01:00:00.000Z',
    ...overrides,
  };
}

export function run(overrides: Partial<SentrowebRunDto> = {}): SentrowebRunDto {
  return {
    id: 'run-1',
    companyId: 'company-1',
    status: 'COMPLETED',
    overallResult: 'CLEAR',
    errorCode: null,
    errorMessage: null,
    entityCount: 1,
    creditsUsed: 1,
    requestedBy: { id: 'user-1', name: 'Sam Lee' },
    createdAt: '2026-11-18T01:00:00.000Z',
    startedAt: '2026-11-18T01:00:05.000Z',
    finishedAt: '2026-11-18T01:01:00.000Z',
    ...overrides,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
