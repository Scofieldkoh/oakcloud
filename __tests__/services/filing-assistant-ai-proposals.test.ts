import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai', () => ({
  callAIWithConnector: vi.fn(),
  getBestAvailableModelForWorkspace: vi.fn(() => Promise.resolve('test-model')),
  stripMarkdownCodeBlocks: (content: string) => content.replace(/^```(?:json)?\s*|\s*```$/g, ''),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { callAIWithConnector, getBestAvailableModelForWorkspace } from '@/lib/ai';
import { createProposal, proposalRequestSchema, redactLikelyNames } from '@/services/filing-assistant/ai-proposals';

const callAI = vi.mocked(callAIWithConnector);
const context = { tenantId: 'tenant-1', userId: 'user-1' };

function snapshot() {
  return {
    path: '/registry/update-personnel/appoint-withdraw-position-holder-form',
    title: 'Bizfile',
    headings: ['Appoint/Withdraw position holders', '1. KOH ZHI YONG'],
    fields: [
      { ref: 'f1', kind: 'radio', tag: 'input', label: 'Category', group: 'Category', section: 'Appoint position holder', options: ['Individual', 'Corporate'], hasValue: false },
      { ref: 'f2', kind: 'combobox', tag: 'input', label: 'Select position', placeholder: 'Select position', section: 'Appoint position holder', hasValue: false },
      { ref: 'f3', kind: 'date', tag: 'input', label: 'Date of appointment', section: 'Appoint position holder', hasValue: false },
      { ref: 'f4', kind: 'text', tag: 'input', label: 'Identification number', section: 'Appoint position holder', hasValue: true, value: 'S1234567D' },
    ],
    actions: [
      { ref: 'a1', label: 'Add position holder', section: 'Appoint position holder', allowed: true },
      { ref: 'a2', label: 'Review and confirm', section: '', allowed: false },
    ],
  };
}

const targets = [
  { key: 'category', label: 'Category', type: 'choice', options: ['Individual', 'Corporate'] },
  { key: 'position', label: 'Position held', type: 'choice' },
  { key: 'appointmentDate', label: 'Date of appointment', type: 'date' },
  { key: 'idNumber', label: 'Identification number', type: 'text' },
  { key: 'name', label: 'Name', type: 'text' },
];

function aiReplies(content: unknown) {
  callAI.mockResolvedValueOnce({ content: JSON.stringify(content), model: 'test-model', provider: 'openai' });
}

beforeEach(() => {
  callAI.mockReset();
  vi.mocked(getBestAvailableModelForWorkspace).mockResolvedValue('test-model');
});

describe('proposalRequestSchema', () => {
  it('drops anything that is not structure, such as a field value, and masks capitalised names', () => {
    const parsed = proposalRequestSchema.parse({ task: 'map-screen', transaction: 'appoint-position-holder', snapshot: snapshot(), targets });
    expect(JSON.stringify(parsed)).not.toContain('S1234567D');
    expect(parsed.snapshot.headings[1]).toBe('1. [name]');
  });

  it('rejects references and keys that do not have the expected shape', () => {
    const bad = snapshot();
    bad.fields[0].ref = 'field-1';
    expect(() => proposalRequestSchema.parse({ task: 'map-screen', transaction: 'appoint-position-holder', snapshot: bad, targets })).toThrow();
    expect(() => proposalRequestSchema.parse({ task: 'map-screen', transaction: 'Bad Name', snapshot: snapshot(), targets })).toThrow();
  });
});

describe('redactLikelyNames', () => {
  it('keeps common identifiers in capitals', () => {
    expect(redactLikelyNames('NRIC (Citizen)')).toBe('NRIC (Citizen)');
    expect(redactLikelyNames('TAN WEI JIE, Director')).toBe('[name], Director');
    expect(redactLikelyNames('Enter as DD MMM YYYY')).toBe('Enter as DD MMM YYYY');
  });
});

describe('createProposal: map-screen', () => {
  it('keeps only steps that point at real fields, allowed buttons and requested keys', async () => {
    aiReplies({
      steps: [
        { type: 'action', ref: 'a1', revealsKey: 'name', confidence: 0.8, reason: 'Reveals the person card' },
        { type: 'action', ref: 'a2', revealsKey: 'name', confidence: 0.9, reason: 'Not allowed' },
        { type: 'fill', key: 'category', ref: 'f1', kind: 'radio', confidence: 0.95, reason: 'Category radios' },
        { type: 'fill', key: 'position', ref: 'f2', kind: 'combobox', confidence: 0.9, reason: 'Select position' },
        { type: 'fill', key: 'appointmentDate', ref: 'f3', kind: 'date', format: 'DD MMM YYYY', confidence: 0.9, reason: 'Date label' },
        { type: 'fill', key: 'idNumber', ref: 'f9', kind: 'text', confidence: 0.9, reason: 'Invented reference' },
        { type: 'fill', key: 'unknownKey', ref: 'f4', kind: 'text', confidence: 0.9, reason: 'Not requested' },
        { type: 'fill', key: 'name', ref: 'f3', kind: 'text', confidence: 0.4, reason: 'Field already used' },
      ],
      notes: 'ok',
    });
    const request = proposalRequestSchema.parse({ task: 'map-screen', transaction: 'appoint-position-holder', snapshot: snapshot(), targets });
    const proposal = await createProposal(request, context);
    expect('steps' in proposal && proposal.steps.map((step) => step.ref)).toEqual(['a1', 'f1', 'f2', 'f3']);
    expect('unmappedKeys' in proposal && proposal.unmappedKeys).toEqual(['idNumber', 'name']);

    const call = callAI.mock.calls[0][0];
    expect(call).toMatchObject({ tenantId: 'tenant-1', userId: 'user-1', jsonMode: true, operation: 'filing_assistant_map_screen' });
    expect(call.userPrompt).not.toContain('S1234567D');
    expect(call.userPrompt).not.toContain('KOH ZHI YONG');
  });

  it('refuses when no AI provider is configured', async () => {
    vi.mocked(getBestAvailableModelForWorkspace).mockResolvedValueOnce(null);
    const request = proposalRequestSchema.parse({ task: 'map-screen', transaction: 'appoint-position-holder', snapshot: snapshot(), targets });
    await expect(createProposal(request, context)).rejects.toMatchObject({ statusCode: 503 });
    expect(callAI).not.toHaveBeenCalled();
  });

  it('reports an unusable AI reply as a temporary failure', async () => {
    callAI.mockResolvedValueOnce({ content: 'Sure! Here is the mapping.', model: 'test-model', provider: 'openai' });
    const request = proposalRequestSchema.parse({ task: 'map-screen', transaction: 'appoint-position-holder', snapshot: snapshot(), targets });
    await expect(createProposal(request, context)).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe('createProposal: repair-step', () => {
  const repairRequest = () =>
    proposalRequestSchema.parse({
      task: 'repair-step',
      transaction: 'appoint-position-holder',
      snapshot: snapshot(),
      target: targets[2],
      step: { key: 'appointmentDate', kind: 'date', label: 'Appointment date', section: 'Appoint position holder', method: 'set-value-events', format: 'DD/MM/YYYY', failure: 'not-found' },
    });

  it('returns the field the AI found', async () => {
    aiReplies({ ref: 'f3', kind: 'date', format: 'DD MMM YYYY', confidence: 0.85, reason: 'The label changed to Date of appointment' });
    const proposal = await createProposal(repairRequest(), context);
    expect(proposal).toMatchObject({ ref: 'f3', kind: 'date', format: 'DD MMM YYYY' });
    expect(callAI.mock.calls[0][0].operation).toBe('filing_assistant_repair_step');
  });

  it('turns an invented reference into "not found"', async () => {
    aiReplies({ ref: 'f42', kind: 'date', confidence: 0.9, reason: 'Guess' });
    const proposal = await createProposal(repairRequest(), context);
    expect(proposal).toMatchObject({ ref: null, confidence: 0 });
  });
});
