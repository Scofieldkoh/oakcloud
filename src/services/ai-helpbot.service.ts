import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/prisma';
import { canAccessCompany, type SessionUser } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  AI_MODELS,
  callAIWithConnector,
  getBestAvailableModelForTenant,
  stripMarkdownCodeBlocks,
  type AIModel,
} from '@/lib/ai';
import {
  type AIAssistantContextSnapshot,
  type AIAssistantNavigationIntent,
} from '@/lib/validations/ai-helpbot';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-helpbot');

const HELPBOT_CONTEXT_TYPE = 'assistant_companies';
const HELPBOT_SCHEMA_VERSION = '1.0.0';
const DEFAULT_SESSION_TITLE = 'Eden Session';
const DOC_INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
const DOC_SOURCE_DIRS = ['docs/features', 'docs/guides', 'docs/reference'];
const SENSITIVE_FIELD_PATTERN = /(password|secret|token|api[_-]?key|credential|authorization|cookie|session)/i;

type AssistantMessageType = 'answer' | 'question' | 'proposal' | 'result' | 'error';
type AssistantRole = 'user' | 'assistant' | 'tool' | 'system';

interface AssistantCitation {
  sourcePath: string;
  heading: string;
}

interface AssistantMessage {
  id: string;
  role: AssistantRole;
  type: AssistantMessageType;
  content: string;
  citations?: AssistantCitation[];
  navigationIntent?: AIAssistantNavigationIntent;
  createdAt: string;
}

interface StoredConversationEnvelope {
  schemaVersion: string;
  meta: {
    title: string;
    archived: boolean;
    module: 'companies';
    createdAt: string;
    updatedAt: string;
  };
  items: AssistantMessage[];
}

interface DocChunk {
  sourcePath: string;
  heading: string;
  module: string;
  text: string;
  searchText: string;
}

interface ScoredChunk extends DocChunk {
  score: number;
}

interface DocCache {
  loadedAt: number;
  chunks: DocChunk[];
}

interface AssistantModelResponse {
  type?: AssistantMessageType;
  message?: string;
  confidence?: 'low' | 'medium' | 'high';
  navigationIntent?: AIAssistantNavigationIntent | null;
}

export interface AssistantSessionSummary {
  id: string;
  title: string;
  archived: boolean;
  contextId: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessagesResponse {
  sessionId: string;
  title: string;
  archived: boolean;
  messages: AssistantMessage[];
}

export interface AssistantRespondResponse {
  type: AssistantMessageType;
  messageId: string;
  sessionId: string;
  message: string;
  citations: AssistantCitation[];
  navigationIntent: AIAssistantNavigationIntent | null;
  confidence: 'low' | 'medium' | 'high';
}

let docsCache: DocCache | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampMessageType(value: unknown): AssistantMessageType {
  const allowed: AssistantMessageType[] = ['answer', 'question', 'proposal', 'result', 'error'];
  return allowed.includes(value as AssistantMessageType)
    ? (value as AssistantMessageType)
    : 'answer';
}

function buildDefaultEnvelope(title?: string): StoredConversationEnvelope {
  const now = nowIso();
  return {
    schemaVersion: HELPBOT_SCHEMA_VERSION,
    meta: {
      title: (title || DEFAULT_SESSION_TITLE).trim(),
      archived: false,
      module: 'companies',
      createdAt: now,
      updatedAt: now,
    },
    items: [],
  };
}

function parseLegacyMessageArray(raw: unknown): AssistantMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) && typeof entry.content === 'string'
    )
    .map((entry) => {
      const role = entry.role === 'assistant' || entry.role === 'tool' || entry.role === 'system'
        ? (entry.role as AssistantRole)
        : 'user';
      const content = String(entry.content || '');
      const createdAtRaw = typeof entry.timestamp === 'string' ? entry.timestamp : nowIso();
      return {
        id: crypto.randomUUID(),
        role,
        type: role === 'assistant' ? 'answer' : 'question',
        content,
        createdAt: createdAtRaw,
      } satisfies AssistantMessage;
    });
}

function parseEnvelope(raw: Prisma.JsonValue | null): StoredConversationEnvelope {
  const fallback = buildDefaultEnvelope();

  if (!isRecord(raw)) {
    const legacyItems = parseLegacyMessageArray(raw);
    return {
      ...fallback,
      items: legacyItems,
    };
  }

  const metaRaw = isRecord(raw.meta) ? raw.meta : {};
  const itemsRaw = Array.isArray(raw.items) ? raw.items : parseLegacyMessageArray(raw);

  const items: AssistantMessage[] = [];
  for (const candidate of itemsRaw as unknown[]) {
    if (!isRecord(candidate) || typeof candidate.content !== 'string') {
      continue;
    }

    const role = candidate.role === 'assistant' || candidate.role === 'tool' || candidate.role === 'system'
      ? (candidate.role as AssistantRole)
      : 'user';

    const citations: AssistantCitation[] = [];
    if (Array.isArray(candidate.citations)) {
      for (const citationCandidate of candidate.citations) {
        if (
          isRecord(citationCandidate) &&
          typeof citationCandidate.sourcePath === 'string' &&
          typeof citationCandidate.heading === 'string'
        ) {
          citations.push({
            sourcePath: citationCandidate.sourcePath,
            heading: citationCandidate.heading,
          });
        }
      }
    }

    const navigationIntent = isRecord(candidate.navigationIntent)
      ? (candidate.navigationIntent as AIAssistantNavigationIntent)
      : undefined;

    items.push({
      id: typeof candidate.id === 'string' ? candidate.id : crypto.randomUUID(),
      role,
      type: clampMessageType(candidate.type),
      content: String(candidate.content || ''),
      citations: citations.length > 0 ? citations : undefined,
      navigationIntent,
      createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : nowIso(),
    });
  }

  return {
    schemaVersion:
      typeof raw.schemaVersion === 'string' ? raw.schemaVersion : HELPBOT_SCHEMA_VERSION,
    meta: {
      title:
        typeof metaRaw.title === 'string' && metaRaw.title.trim().length > 0
          ? metaRaw.title.trim()
          : DEFAULT_SESSION_TITLE,
      archived: Boolean(metaRaw.archived),
      module: 'companies',
      createdAt:
        typeof metaRaw.createdAt === 'string' ? metaRaw.createdAt : nowIso(),
      updatedAt:
        typeof metaRaw.updatedAt === 'string' ? metaRaw.updatedAt : nowIso(),
    },
    items,
  };
}

function toSessionSummary(
  conversation: {
    id: string;
    contextId: string | null;
    createdAt: Date;
    updatedAt: Date;
    messages: Prisma.JsonValue;
  }
): AssistantSessionSummary {
  const envelope = parseEnvelope(conversation.messages);
  const lastMessage = [...envelope.items].reverse().find((item) => item.role === 'assistant' || item.role === 'user');

  return {
    id: conversation.id,
    title: envelope.meta.title,
    archived: envelope.meta.archived,
    contextId: conversation.contextId,
    messageCount: envelope.items.length,
    lastMessagePreview: lastMessage ? lastMessage.content.slice(0, 140) : null,
    lastMessageAt: lastMessage?.createdAt ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

function sanitizeTitleFromFirstMessage(message: string): string {
  const compact = message.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return DEFAULT_SESSION_TITLE;
  }
  return compact.length > 64 ? `${compact.slice(0, 64)}...` : compact;
}

function redactObject(value: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_FIELD_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }

    if (isRecord(entry)) {
      output[key] = redactObject(entry);
      continue;
    }

    output[key] = entry;
  }

  return output;
}

function sanitizeContextSnapshot(
  snapshot: AIAssistantContextSnapshot,
  session: SessionUser
): AIAssistantContextSnapshot {
  const sanitized: AIAssistantContextSnapshot = {
    ...snapshot,
    tenantId: snapshot.tenantId || session.tenantId || undefined,
    userId: snapshot.userId || session.id,
    uiState: {
      ...snapshot.uiState,
      formDraft: snapshot.uiState.formDraft
        ? redactObject(snapshot.uiState.formDraft)
        : undefined,
    },
  };

  return sanitized;
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listMarkdownFiles(fullPath);
      files.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

function splitIntoHeadingSections(markdown: string): Array<{ heading: string; text: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; text: string }> = [];

  let currentHeading = 'Overview';
  let buffer: string[] = [];

  const pushCurrent = () => {
    const text = buffer.join('\n').trim();
    if (text.length > 60) {
      sections.push({ heading: currentHeading, text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      pushCurrent();
      currentHeading = headingMatch[1].trim();
      continue;
    }

    buffer.push(line);
  }

  pushCurrent();
  return sections;
}

function inferModuleName(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, '/').toLowerCase();
  const featureMatch = normalized.match(/docs\/features\/([^/]+)/);
  if (featureMatch) {
    return featureMatch[1];
  }

  if (normalized.includes('/docs/reference/')) {
    return 'reference';
  }

  if (normalized.includes('/docs/guides/')) {
    return 'guides';
  }

  return 'general';
}

async function getDocChunks(): Promise<DocChunk[]> {
  const now = Date.now();
  if (docsCache && now - docsCache.loadedAt < DOC_INDEX_CACHE_TTL_MS) {
    return docsCache.chunks;
  }

  const repoRoot = process.cwd();
  const chunks: DocChunk[] = [];

  for (const sourceDir of DOC_SOURCE_DIRS) {
    const absoluteDir = path.join(repoRoot, sourceDir);
    const markdownFiles = await listMarkdownFiles(absoluteDir);

    for (const filePath of markdownFiles) {
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      const moduleName = inferModuleName(relativePath);

      let markdown: string;
      try {
        markdown = await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      const sections = splitIntoHeadingSections(markdown);
      for (const section of sections) {
        const text = section.text.replace(/\s+/g, ' ').trim();
        if (text.length < 80) {
          continue;
        }

        const clipped = text.length > 1500 ? `${text.slice(0, 1500)}...` : text;

        chunks.push({
          sourcePath: relativePath,
          heading: section.heading,
          module: moduleName,
          text: clipped,
          searchText: `${section.heading} ${clipped}`.toLowerCase(),
        });
      }
    }
  }

  docsCache = {
    loadedAt: now,
    chunks,
  };

  return chunks;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function scoreChunk(
  chunk: DocChunk,
  tokens: string[],
  moduleHint: string
): number {
  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;
  for (const token of tokens) {
    if (chunk.searchText.includes(token)) {
      score += 1;
      if (chunk.heading.toLowerCase().includes(token)) {
        score += 1;
      }
    }
  }

  const moduleMatch = moduleHint && chunk.module.includes(moduleHint);
  if (moduleMatch) {
    score += 3;
  }

  if (chunk.module === 'reference') {
    score += 0.5;
  }

  return score;
}

async function retrieveEvidence(
  userMessage: string,
  snapshot: AIAssistantContextSnapshot
): Promise<ScoredChunk[]> {
  const chunks = await getDocChunks();
  const moduleHint = snapshot.route.module.toLowerCase();
  const tokens = tokenize(
    `${userMessage} ${snapshot.route.path} ${snapshot.selection.activeTab ?? ''} ${moduleHint}`
  );

  return chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, tokens, moduleHint),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function mergeNavigationPath(
  pathValue: string,
  query?: Record<string, string>
): string {
  const search = new URLSearchParams(query || {}).toString();
  return search ? `${pathValue}?${search}` : pathValue;
}

function normalizeNavigationIntent(
  intent: AIAssistantNavigationIntent | null | undefined,
  companyId: string | null
): AIAssistantNavigationIntent | null {
  if (!intent) {
    return null;
  }

  if (!intent.target.path.startsWith('/companies')) {
    return null;
  }

  if (companyId && !intent.target.path.includes(companyId)) {
    return null;
  }

  return {
    ...intent,
    target: {
      ...intent.target,
      path: mergeNavigationPath(intent.target.path, intent.target.query),
      query: intent.target.query,
    },
  };
}

function inferNavigationIntent(
  message: string,
  companyId: string | null
): AIAssistantNavigationIntent | null {
  if (!companyId) {
    return null;
  }

  const normalized = message.toLowerCase();

  if (normalized.includes('contact') && (normalized.includes('tab') || normalized.includes('detail'))) {
    return {
      type: 'navigate',
      target: { path: `/companies/${companyId}`, query: { tab: 'contacts' } },
      reason: 'Open contact details tab for this company',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('audit')) {
    return {
      type: 'navigate',
      target: { path: `/companies/${companyId}/audit` },
      reason: 'Open the company audit history page',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('document')) {
    return {
      type: 'navigate',
      target: { path: `/companies/${companyId}/documents` },
      reason: 'Open company documents',
      requiresConfirmation: false,
    };
  }

  if (normalized.includes('profile') || normalized.includes('company details')) {
    return {
      type: 'navigate',
      target: { path: `/companies/${companyId}` },
      reason: 'Open the company profile tab',
      requiresConfirmation: false,
    };
  }

  return null;
}

async function findConversationOrThrow(
  sessionId: string,
  tenantId: string,
  userId: string
) {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: sessionId,
      tenantId,
      userId,
      contextType: HELPBOT_CONTEXT_TYPE,
    },
  });

  if (!conversation) {
    throw new Error('Session not found');
  }

  return conversation;
}

async function assertCompanyReadAccess(
  session: SessionUser,
  tenantId: string,
  snapshot: AIAssistantContextSnapshot
): Promise<string | null> {
  const companyId = snapshot.scope.companyId || snapshot.route.params?.id || null;
  if (!companyId) {
    return null;
  }

  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!company) {
    throw new Error('Company not found');
  }

  await requirePermission(session, 'company', 'read', companyId);
  const allowed = await canAccessCompany(session, companyId);
  if (!allowed) {
    throw new Error('Forbidden');
  }

  return companyId;
}

function buildEvidenceBlock(evidence: ScoredChunk[]): string {
  if (evidence.length === 0) {
    return 'No document evidence found for this query.';
  }

  return evidence
    .map(
      (chunk, index) =>
        `Source ${index + 1}: ${chunk.sourcePath} | ${chunk.heading}\n${chunk.text}`
    )
    .join('\n\n');
}

function parseAssistantResponse(rawContent: string): AssistantModelResponse {
  const cleaned = stripMarkdownCodeBlocks(rawContent);

  try {
    const parsed = JSON.parse(cleaned) as AssistantModelResponse;
    if (parsed && typeof parsed.message === 'string') {
      return parsed;
    }
  } catch {
    // fall through to plain text response
  }

  return {
    type: 'answer',
    message: cleaned.trim(),
    confidence: 'medium',
    navigationIntent: null,
  };
}

function getModelId(model?: string): AIModel | null {
  if (!model) {
    return null;
  }

  if (model in AI_MODELS) {
    return model as AIModel;
  }

  return null;
}

export async function createAssistantSession(
  tenantId: string,
  userId: string,
  contextId?: string,
  title?: string
): Promise<AssistantSessionSummary> {
  const envelope = buildDefaultEnvelope(title);

  const created = await prisma.aiConversation.create({
    data: {
      tenantId,
      userId,
      contextType: HELPBOT_CONTEXT_TYPE,
      contextId: contextId || null,
      messages: envelope as unknown as Prisma.InputJsonValue,
    },
  });

  return toSessionSummary(created);
}

export async function listAssistantSessions(
  tenantId: string,
  userId: string,
  options: {
    contextId?: string;
    includeArchived?: boolean;
    limit?: number;
  }
): Promise<AssistantSessionSummary[]> {
  const { contextId, includeArchived = false, limit = 20 } = options;

  const conversations = await prisma.aiConversation.findMany({
    where: {
      tenantId,
      userId,
      contextType: HELPBOT_CONTEXT_TYPE,
      ...(contextId ? { contextId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(limit * 3, 150),
  });

  const mapped = conversations.map(toSessionSummary);
  const filtered = includeArchived ? mapped : mapped.filter((session) => !session.archived);

  return filtered.slice(0, limit);
}

export async function updateAssistantSession(
  tenantId: string,
  userId: string,
  sessionId: string,
  input: { title?: string; archived?: boolean }
): Promise<AssistantSessionSummary> {
  const conversation = await findConversationOrThrow(sessionId, tenantId, userId);
  const envelope = parseEnvelope(conversation.messages);

  if (input.title !== undefined) {
    envelope.meta.title = input.title.trim();
  }

  if (input.archived !== undefined) {
    envelope.meta.archived = input.archived;
  }

  envelope.meta.updatedAt = nowIso();

  const updated = await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      messages: envelope as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  return toSessionSummary(updated);
}

export async function getAssistantMessages(
  tenantId: string,
  userId: string,
  sessionId: string,
  limit?: number
): Promise<AssistantMessagesResponse> {
  const conversation = await findConversationOrThrow(sessionId, tenantId, userId);
  const envelope = parseEnvelope(conversation.messages);

  const items = typeof limit === 'number' ? envelope.items.slice(-limit) : envelope.items;

  return {
    sessionId: conversation.id,
    title: envelope.meta.title,
    archived: envelope.meta.archived,
    messages: items,
  };
}

export async function respondAssistant(
  session: SessionUser,
  tenantId: string,
  input: {
    sessionId: string;
    message: string;
    contextSnapshot: AIAssistantContextSnapshot;
    model?: string;
  }
): Promise<AssistantRespondResponse> {
  const conversation = await findConversationOrThrow(input.sessionId, tenantId, session.id);
  const envelope = parseEnvelope(conversation.messages);

  const contextSnapshot = sanitizeContextSnapshot(input.contextSnapshot, session);
  const routeModule = contextSnapshot.route.module.toLowerCase();

  if (routeModule !== 'companies') {
    throw new Error('MVP supports Companies module only');
  }

  const scopedCompanyId = await assertCompanyReadAccess(session, tenantId, contextSnapshot);

  const evidence = await retrieveEvidence(input.message, contextSnapshot);
  const citations: AssistantCitation[] = evidence.map((chunk) => ({
    sourcePath: chunk.sourcePath,
    heading: chunk.heading,
  }));

  const selectedModel = getModelId(input.model) || (await getBestAvailableModelForTenant(tenantId));
  if (!selectedModel) {
    throw new Error('No AI model available. Configure a connector first.');
  }

  const companySummary = scopedCompanyId
    ? await prisma.company.findFirst({
        where: { id: scopedCompanyId, tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          uen: true,
          entityType: true,
          status: true,
          financialYearEndDay: true,
          financialYearEndMonth: true,
          nextArDueDate: true,
          nextAgmDueDate: true,
        },
      })
    : null;

  const prompt = [
    'User request:',
    input.message,
    '',
    'Context snapshot (JSON):',
    JSON.stringify(contextSnapshot),
    '',
    'Company summary (JSON):',
    JSON.stringify(companySummary),
    '',
    'Evidence:',
    buildEvidenceBlock(evidence),
    '',
    'Respond ONLY as JSON with this schema:',
    '{"type":"answer|question|error","message":"string","confidence":"low|medium|high","navigationIntent":null|{"type":"navigate","target":{"path":"/companies/...","query":{"tab":"contacts"}},"reason":"string","requiresConfirmation":false}}',
    '',
    'Rules:',
    '1) Eden is read-only in MVP; never suggest write actions as completed.',
    '2) Ground answer in provided evidence and company context.',
    '3) If confidence is low, ask a focused clarifying question (type=question).',
    '4) Only include navigation intent when user explicitly asks where to go.',
  ].join('\n');

  const systemPrompt = [
    'You are Eden, Oakcloud\'s in-app assistant for Companies module.',
    'You operate in MVP mode: read-only ask/check/navigation workflows.',
    'Do not claim undocumented APIs or schema.',
    'Use plain language and concise action-oriented guidance.',
  ].join('\n');

  const aiResponse = await callAIWithConnector({
    tenantId,
    userId: session.id,
    model: selectedModel,
    systemPrompt,
    userPrompt: prompt,
    temperature: 0.2,
    maxTokens: 1600,
    jsonMode: true,
    operation: 'ai_helpbot_companies_respond',
    usageMetadata: {
      sessionId: input.sessionId,
      companyId: scopedCompanyId,
      routePath: contextSnapshot.route.path,
      evidenceCount: evidence.length,
    },
  });

  const parsed = parseAssistantResponse(aiResponse.content);
  const inferredNav = inferNavigationIntent(input.message, scopedCompanyId);
  const normalizedModelNav = normalizeNavigationIntent(parsed.navigationIntent ?? null, scopedCompanyId);
  const finalNavigationIntent = normalizedModelNav || inferredNav;

  const assistantMessageText = (parsed.message || 'I could not generate a response.').trim();
  const assistantMessageType = clampMessageType(parsed.type);
  const confidence: 'low' | 'medium' | 'high' =
    parsed.confidence === 'low' || parsed.confidence === 'high' ? parsed.confidence : 'medium';

  const userMessage: AssistantMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    type: 'question',
    content: input.message,
    createdAt: nowIso(),
  };

  const assistantMessage: AssistantMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    type: assistantMessageType,
    content: assistantMessageText,
    citations,
    navigationIntent: finalNavigationIntent || undefined,
    createdAt: nowIso(),
  };

  envelope.items.push(userMessage, assistantMessage);

  const shouldAutoTitle =
    envelope.meta.title === DEFAULT_SESSION_TITLE &&
    envelope.items.filter((item) => item.role === 'user').length <= 1;
  if (shouldAutoTitle) {
    envelope.meta.title = sanitizeTitleFromFirstMessage(input.message);
  }

  envelope.meta.updatedAt = nowIso();

  await prisma.aiConversation.update({
    where: { id: conversation.id },
    data: {
      contextId: conversation.contextId || scopedCompanyId || null,
      messages: envelope as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  return {
    type: assistantMessage.type,
    messageId: assistantMessage.id,
    sessionId: conversation.id,
    message: assistantMessage.content,
    citations: assistantMessage.citations || [],
    navigationIntent: assistantMessage.navigationIntent || null,
    confidence,
  };
}

export function getHelpbotContextType(): string {
  return HELPBOT_CONTEXT_TYPE;
}

export function resetHelpbotDocCache(): void {
  docsCache = null;
  log.debug('Helpbot doc cache reset');
}
