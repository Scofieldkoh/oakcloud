/**
 * AI proposals for the OakCloud Filing Assistant browser extension.
 *
 * The extension sends a value-free snapshot of a Bizfile screen (field labels, control types,
 * sections, button names, each with a reference such as "f3" or "a1") and the keys of the filing
 * details it wants to fill. The AI answers only with references to fields in that snapshot; the
 * extension builds and verifies the actual locators, and staff approve every proposal before it
 * changes a screen map. Filing values never reach this service.
 *
 * Tasks:
 * - map-screen:  which field fills which filing-details key, and which reveal buttons to click
 * - repair-step: where a field went after a step that used to work failed
 */
import { z } from 'zod';
import { callAIWithConnector, getBestAvailableModelForWorkspace, stripMarkdownCodeBlocks } from '@/lib/ai';
import { ApiError, ErrorCodes } from '@/lib/errors';
import { createLogger } from '@/lib/logger';

const log = createLogger('filing-assistant-ai');

export const FIELD_KINDS = ['text', 'date', 'native-select', 'combobox', 'typeahead', 'radio', 'checkbox'] as const;
export const VALUE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'D MMM YYYY', 'DD-MM-YYYY', 'DD MMMM YYYY', 'DDMMYYYY', 'upper', 'digits'] as const;
export const STEP_FAILURES = ['not-found', 'ambiguous', 'not-kept', 'validation-error', 'option-missing', 'not-revealed'] as const;

/** Bizfile shows person and company names in capitals; anything that looks like one is masked before the AI sees it. */
const LIKELY_NAME = /\b[A-Z][A-Z'.-]+(?:\s+[A-Z][A-Z'.-]+)+\b/g;

export function redactLikelyNames(text: string): string {
  return text.replace(LIKELY_NAME, (match) => (/^(NRIC|FIN|UEN|SSIC|ACRA|CPF|IRAS)\b/.test(match) ? match : '[name]'));
}

const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((value) => redactLikelyNames(value.replace(/\s+/g, ' ').trim()).slice(0, max));

const key = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/);
const fieldRef = z.string().regex(/^f\d{1,4}$/);
const actionRef = z.string().regex(/^a\d{1,4}$/);

const snapshotFieldSchema = z.object({
  ref: fieldRef,
  kind: z.enum(FIELD_KINDS),
  tag: text(20),
  type: text(30).optional(),
  label: text(200),
  labelSource: text(30).optional(),
  group: text(200).optional(),
  section: text(200).optional(),
  placeholder: text(200).optional(),
  required: z.boolean().optional(),
  hasValue: z.boolean().optional(),
  options: z.array(text(120)).max(60).optional(),
  /** From exploring: the field appears only when each listed field has the listed option. */
  shownWhen: z.array(z.object({ ref: fieldRef, option: text(120) })).max(6).optional(),
});

const snapshotSchema = z.object({
  path: z.string().max(300).regex(/^\//),
  title: text(200).optional(),
  headings: z.array(text(200)).max(40),
  fields: z.array(snapshotFieldSchema).max(300),
  actions: z
    .array(z.object({ ref: actionRef, label: text(120), section: text(200).optional(), allowed: z.boolean(), reveals: z.array(fieldRef).max(200).optional() }))
    .max(60),
});

const targetSchema = z.object({
  key,
  label: text(120),
  type: z.enum(['text', 'date', 'choice', 'phone', 'email']),
  options: z.array(text(120)).max(40).optional(),
});

const transaction = z.string().regex(/^[a-z0-9-]{1,60}$/);

export const proposalRequestSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('map-screen'),
    transaction,
    snapshot: snapshotSchema,
    targets: z.array(targetSchema).min(1).max(40),
  }),
  z.object({
    task: z.literal('repair-step'),
    transaction,
    snapshot: snapshotSchema,
    target: targetSchema,
    step: z.object({
      key,
      kind: z.enum(FIELD_KINDS),
      label: text(200),
      group: text(200).optional(),
      section: text(200).optional(),
      method: text(60),
      format: z.enum(VALUE_FORMATS).nullable(),
      failure: z.enum(STEP_FAILURES),
      errorText: text(300).optional(),
      options: z.array(text(120)).max(60).optional(),
    }),
  }),
]);

export type ProposalRequest = z.infer<typeof proposalRequestSchema>;
type Snapshot = z.infer<typeof snapshotSchema>;

const confidence = z.number().min(0).max(1);
const reason = z.string().max(600).transform((value) => value.trim().slice(0, 300));
const valueMap = z.record(z.string().max(120), z.string().max(120)).optional();

const mapScreenReplySchema = z.object({
  steps: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('fill'), key, ref: fieldRef, kind: z.enum(FIELD_KINDS), format: z.enum(VALUE_FORMATS).nullable().optional(), valueMap, confidence, reason }),
        z.object({ type: z.literal('action'), ref: actionRef, revealsKey: key, confidence, reason }),
      ]),
    )
    .max(80),
  unmappedKeys: z.array(z.string().max(60)).max(60).optional(),
  notes: z.string().max(1000).optional(),
});

const repairReplySchema = z.object({
  ref: fieldRef.nullable(),
  kind: z.enum(FIELD_KINDS),
  format: z.enum(VALUE_FORMATS).nullable().optional(),
  valueMap,
  confidence,
  reason,
});

export type MapScreenProposal = z.infer<typeof mapScreenReplySchema>;
export type RepairProposal = z.infer<typeof repairReplySchema>;

const SYSTEM_PROMPT = [
  'You help a browser extension fill Singapore ACRA Bizfile forms for a corporate secretarial firm.',
  'You see a structural snapshot of one Bizfile screen: fields and buttons with references like "f3" and "a1",',
  'their labels, control types, sections and options. You never see what is typed in a field.',
  'Rules:',
  '- Refer to fields and buttons only by the references in the snapshot. Never invent a reference.',
  '- Use each field for at most one filing-details key, and each key at most once.',
  '- "kind" must describe the control: text, date, native-select, combobox (pick from a list), typeahead (type to search, then pick), radio or checkbox.',
  '- For dates give "format": the one the placeholder or label suggests; Bizfile normally uses "DD MMM YYYY".',
  '- For choices whose screen options are listed, give "valueMap" from a filing-details option to the exact screen option text when the two differ.',
  '- Only propose buttons with allowed=true, and only when they reveal fields needed for keys not yet on the screen.',
  '- A snapshot made by exploring lists fields from every option of the screen. "shownWhen" says a field appears only when',
  '  another field (by ref) has a given option; map those fields too, and map the controlling field (for example a',
  '  Category or Address type radio) to its filing-details key so the conditions can be checked.',
  '- Leave a key unmapped rather than guess. "confidence" is between 0 and 1. Keep "reason" to one short sentence.',
  'Reply with JSON only.',
].join('\n');

function mapScreenPrompt(request: Extract<ProposalRequest, { task: 'map-screen' }>): string {
  return [
    'Map these filing-details keys to fields on the screen.',
    'Reply as {"steps":[{"type":"fill","key":"...","ref":"f1","kind":"text","format":null,"valueMap":{},"confidence":0.9,"reason":"..."},{"type":"action","ref":"a1","revealsKey":"...","confidence":0.8,"reason":"..."}],"unmappedKeys":["..."],"notes":"..."}',
    '',
    'Filing-details keys:',
    JSON.stringify(request.targets),
    '',
    'Screen snapshot:',
    JSON.stringify(request.snapshot),
  ].join('\n');
}

function repairPrompt(request: Extract<ProposalRequest, { task: 'repair-step' }>): string {
  return [
    'A step that fills one filing-details key used to work on this screen and has now failed.',
    'Find the field that should hold the key on the current screen, or answer "ref": null if it is not there.',
    'Reply as {"ref":"f1","kind":"text","format":null,"valueMap":{},"confidence":0.8,"reason":"..."}',
    '',
    'Filing-details key:',
    JSON.stringify(request.target),
    '',
    'The step as learned, and how it failed:',
    JSON.stringify(request.step),
    '',
    'Screen snapshot now:',
    JSON.stringify(request.snapshot),
  ].join('\n');
}

function parseReply<T>(content: string, schema: z.ZodType<T>): T {
  let data: unknown;
  try {
    data = JSON.parse(stripMarkdownCodeBlocks(content));
  } catch {
    throw new ApiError(ErrorCodes.SERVICE_UNAVAILABLE, 'The AI reply was not valid JSON. Try again.', 502);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    log.warn('Filing assistant AI reply did not match the expected shape', { issues: parsed.error.issues.slice(0, 5) });
    throw new ApiError(ErrorCodes.SERVICE_UNAVAILABLE, 'The AI reply could not be used. Try again.', 502);
  }
  return parsed.data;
}

/** Drops anything the AI pointed at that the snapshot does not contain, or that may not be clicked. */
export function keepValidMapSteps(proposal: MapScreenProposal, snapshot: Snapshot, keys: Set<string>): MapScreenProposal {
  const fieldRefs = new Set(snapshot.fields.map((field) => field.ref));
  const allowedActions = new Set(snapshot.actions.filter((action) => action.allowed).map((action) => action.ref));
  const usedKeys = new Set<string>();
  const usedRefs = new Set<string>();
  const steps = [...proposal.steps]
    .sort((a, b) => b.confidence - a.confidence)
    .filter((step) => {
      if (step.type === 'action') return allowedActions.has(step.ref) && keys.has(step.revealsKey);
      if (!fieldRefs.has(step.ref) || !keys.has(step.key) || usedKeys.has(step.key) || usedRefs.has(step.ref)) return false;
      usedKeys.add(step.key);
      usedRefs.add(step.ref);
      return true;
    });
  const order = new Map(proposal.steps.map((step, index) => [step, index]));
  steps.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const mapped = new Set(steps.filter((step) => step.type === 'fill').map((step) => (step as { key: string }).key));
  return { ...proposal, steps, unmappedKeys: Array.from(keys).filter((item) => !mapped.has(item)) };
}

export interface ProposalContext {
  tenantId: string;
  userId: string;
}

export async function createProposal(request: ProposalRequest, context: ProposalContext): Promise<MapScreenProposal | RepairProposal> {
  const model = await getBestAvailableModelForWorkspace(context.tenantId);
  if (!model) throw new ApiError(ErrorCodes.SERVICE_UNAVAILABLE, 'No AI provider is configured for this workspace (Connectors).', 503);

  const response = await callAIWithConnector({
    tenantId: context.tenantId,
    userId: context.userId,
    model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: request.task === 'map-screen' ? mapScreenPrompt(request) : repairPrompt(request),
    jsonMode: true,
    temperature: 0,
    operation: 'filing_assistant_' + request.task.replace('-', '_'),
    usageMetadata: { transaction: request.transaction, task: request.task },
  });

  if (request.task === 'map-screen') {
    const proposal = parseReply(response.content, mapScreenReplySchema);
    return keepValidMapSteps(proposal, request.snapshot, new Set(request.targets.map((target) => target.key)));
  }
  const proposal = parseReply(response.content, repairReplySchema);
  if (proposal.ref && !request.snapshot.fields.some((field) => field.ref === proposal.ref)) {
    return { ...proposal, ref: null, confidence: 0, reason: 'The AI pointed at a field that is not on the screen.' };
  }
  return proposal;
}
