/**
 * Sentroweb check: queues a run for a company, drives the browser client, stores every result as
 * soon as its search returns, files Sentroweb's PDF report as a company Document and recovers
 * runs that were interrupted. Rules (see docs/features/SENTROWEB_CHECK.md):
 *
 * - Fail closed: a result is CLEAR only through the parser, and a CLEAR needs the PDF as evidence.
 * - 1 credit per confirmed search, at most 10 per run, one active run per company, a cooldown
 *   after a run that spent credits unless `force` is set.
 * - A search is never submitted again after CONFIRM: not on a retry, not by recovery.
 * - Tenant and company scoping on every read and write.
 */
import { randomUUID } from 'node:crypto';
import { v5 as uuidv5 } from 'uuid';
import { Prisma } from '@/generated/prisma';
import type {
  SentrowebCheckOverallResult,
  SentrowebCheckResult,
  SentrowebCheckRun,
  SentrowebResultStatus,
} from '@/generated/prisma';
import { createAuditLog } from '@/lib/audit';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { storage, StorageKeys } from '@/lib/storage';
import {
  SENTROWEB_COOLDOWN_MS,
  SENTROWEB_CREDITS_PER_SEARCH,
  SENTROWEB_DEFAULT_TIMEOUTS,
  SENTROWEB_LEASE_GRACE_MS,
  SENTROWEB_MAX_ENTITIES_PER_RUN,
  SENTROWEB_QUEUED_PICKUP_MS,
  getSentrowebConfig,
  isSentrowebConfigured,
  type SentrowebConfig,
} from '@/lib/sentroweb/config';
import { sentrowebErrorMessage, type SentrowebErrorCode } from '@/lib/sentroweb/error-codes';
import type {
  SentrowebCandidatesResponse,
  SentrowebCategoryCounts,
  SentrowebMatch,
  SentrowebOverallValue,
  SentrowebResultDto,
  SentrowebRunDto,
  SentrowebRunListResponse,
} from '@/lib/sentroweb/types';
import { sentrowebClient, type SentrowebClient, type SentrowebSession } from './client';
import { listCandidateEntities, searchDetailsFor, type CandidateEntity } from './entities';
import { SentrowebError, SentrowebRequestError, toSentrowebError } from './errors';
import { parseSentrowebResult } from './result-parser';

const log = createLogger('sentroweb-check');

/** Namespace for the deterministic ids of the filed report Documents. */
const REPORT_NAMESPACE = 'b3a1c2f4-5d6e-4f70-8a91-2b3c4d5e6f70';
export const SENTROWEB_REPORT_DOCUMENT_TYPE = 'SENTROWEB_REPORT';

/**
 * Errors after which the run stops. Searching on after a layout change, an unexpected credit
 * cost or a lost session would only spend credits on results we cannot read. A missing PDF is
 * the one failure that leaves the next search unaffected.
 */
const CONTINUE_AFTER: ReadonlySet<SentrowebErrorCode> = new Set<SentrowebErrorCode>(['EVIDENCE_MISSING']);

export interface ServiceOptions {
  client?: SentrowebClient;
  now?: () => Date;
  /** Overrides the environment configuration (tests). `null` means "not configured". */
  config?: SentrowebConfig | null;
}

export interface QueueRunInput {
  tenantId: string;
  companyId: string;
  userId: string;
  entityKeys: string[];
  force?: boolean;
  /** Tick Fuzzy Search for every search of this run. Off unless asked for. */
  fuzzy?: boolean;
}

export interface QueueRunOptions extends ServiceOptions {
  /** Start processing in this process right away. Defaults to true; tests pass false. */
  autoStart?: boolean;
}

// --- one browser at a time ---------------------------------------------------------------------

let mutexTail: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = mutexTail.then(task, task);
  mutexTail = run.catch(() => undefined);
  return run;
}

// --- pure helpers ------------------------------------------------------------------------------

/**
 * Decision D15. Any possible match wins; otherwise anything unresolved is INCOMPLETE; CLEAR only
 * when every selected entity is CLEAR and the run itself did not fail.
 */
export function computeOverallResult(
  statuses: readonly SentrowebResultStatus[],
  runFailed: boolean,
): SentrowebCheckOverallResult {
  if (statuses.includes('POSSIBLE_MATCH')) return 'POSSIBLE_MATCH';
  if (statuses.length === 0 || runFailed) return 'INCOMPLETE';
  if (statuses.every((status) => status === 'CLEAR')) return 'CLEAR';
  return 'INCOMPLETE';
}

function reportFileName(name: string, date: Date): string {
  const cleaned = name
    .replace(/[\u0000-\u001f/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(date);
  return `Sentroweb - ${cleaned || 'report'} - ${day}.pdf`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new SentrowebError('TIMEOUT');
  if (ms <= 0) return;
  await Promise.race([
    sleep(ms),
    new Promise<void>((_, reject) => {
      if (signal.aborted) reject(new SentrowebError('TIMEOUT'));
      signal.addEventListener('abort', () => reject(new SentrowebError('TIMEOUT')), { once: true });
    }),
  ]);
  if (signal.aborted) throw new SentrowebError('TIMEOUT');
}

function countStatuses(statuses: readonly SentrowebResultStatus[]) {
  return {
    clear: statuses.filter((s) => s === 'CLEAR').length,
    possibleMatch: statuses.filter((s) => s === 'POSSIBLE_MATCH').length,
    error: statuses.filter((s) => s === 'ERROR').length,
    notRun: statuses.filter((s) => s === 'NOT_RUN').length,
  };
}

// --- candidates and queueing -------------------------------------------------------------------

/**
 * The latest run that spent, or may have spent, credits: it used credits, or at least one of its
 * names was submitted to Sentroweb (`searchSubmittedAt`) and not cleared again. An interrupted
 * run whose in-flight search may have been charged therefore keeps the cooldown; only runs known
 * to have submitted nothing (a failed login, a cancelled confirm) are exempt.
 */
async function latestCreditSpendingRun(tenantId: string, companyId: string) {
  return prisma.sentrowebCheckRun.findFirst({
    where: {
      tenantId,
      companyId,
      OR: [{ creditsUsed: { gt: 0 } }, { results: { some: { searchSubmittedAt: { not: null } } } }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true, finishedAt: true },
  });
}

function cooldownEnd(run: { createdAt: Date; finishedAt: Date | null } | null): Date | null {
  if (!run) return null;
  return new Date((run.finishedAt ?? run.createdAt).getTime() + SENTROWEB_COOLDOWN_MS);
}

/** What the confirm dialog needs: who can be screened, and whether a run may start now. */
export async function getCandidatesInfo(
  tenantId: string,
  companyId: string,
  options: Pick<ServiceOptions, 'now'> = {},
): Promise<SentrowebCandidatesResponse> {
  const now = (options.now ?? (() => new Date()))();
  const candidates = await listCandidateEntities(tenantId, companyId);
  const [active, latest] = await Promise.all([
    prisma.sentrowebCheckRun.findFirst({
      where: { tenantId, companyId, status: { in: ['QUEUED', 'RUNNING'] } },
      select: { id: true },
    }),
    latestCreditSpendingRun(tenantId, companyId),
  ]);
  const until = cooldownEnd(latest);
  return {
    configured: isSentrowebConfigured(),
    maxEntities: SENTROWEB_MAX_ENTITIES_PER_RUN,
    creditsPerSearch: SENTROWEB_CREDITS_PER_SEARCH,
    candidates: candidates.map(({ sourceRefs: _sourceRefs, contactId: _contactId, country, dateOfBirth, gender, ...dto }) => ({
      ...dto,
      searchDetails: searchDetailsFor({ country, dateOfBirth, gender }),
    })),
    activeRunId: active?.id ?? null,
    cooldownUntil: until && until > now ? until.toISOString() : null,
  };
}

export async function queueRun(
  input: QueueRunInput,
  options: QueueRunOptions = {},
): Promise<{ runId: string }> {
  const now = (options.now ?? (() => new Date()))();
  const config = options.config !== undefined ? options.config : getSentrowebConfig();
  if (!config) throw new SentrowebRequestError('SENTROWEB_NOT_CONFIGURED');

  const keys = [...new Set(input.entityKeys)];
  if (keys.length === 0) throw new SentrowebRequestError('NO_ENTITIES_SELECTED');
  if (keys.length > SENTROWEB_MAX_ENTITIES_PER_RUN) {
    throw new SentrowebRequestError('TOO_MANY_ENTITIES', { max: SENTROWEB_MAX_ENTITIES_PER_RUN });
  }

  // Throws NotFoundError for another tenant's (or a deleted) company.
  const candidates = await listCandidateEntities(input.tenantId, input.companyId);
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const selected: CandidateEntity[] = [];
  for (const key of keys) {
    const candidate = byKey.get(key);
    if (!candidate) {
      throw new ValidationError('Some of the selected people or companies are no longer current. Reload and try again.');
    }
    selected.push(candidate);
  }
  // Keep the order people see in the dialog (company first).
  selected.sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b));

  const active = await prisma.sentrowebCheckRun.findFirst({
    where: { tenantId: input.tenantId, companyId: input.companyId, status: { in: ['QUEUED', 'RUNNING'] } },
    select: { id: true },
  });
  if (active) throw new SentrowebRequestError('ALREADY_RUNNING', { runId: active.id });

  if (!input.force) {
    const until = cooldownEnd(await latestCreditSpendingRun(input.tenantId, input.companyId));
    if (until && until > now) throw new SentrowebRequestError('COOLDOWN', { cooldownUntil: until.toISOString() });
  }

  const company = await prisma.company.findFirst({
    where: { id: input.companyId, tenantId: input.tenantId, deletedAt: null },
    select: { name: true },
  });
  if (!company) throw new NotFoundError('Company not found');

  let runId: string;
  try {
    runId = await prisma.$transaction(async (tx) => {
      const run = await tx.sentrowebCheckRun.create({
        data: {
          tenantId: input.tenantId,
          companyId: input.companyId,
          requestedById: input.userId,
          status: 'QUEUED',
          entityCount: selected.length,
          fuzzy: input.fuzzy === true,
          results: {
            create: selected.map((candidate, position) => ({
              tenantId: input.tenantId,
              companyId: input.companyId,
              position,
              entityKind: candidate.entityKind,
              searchType: candidate.searchType,
              roles: candidate.roles,
              sourceRefs: candidate.sourceRefs as unknown as Prisma.InputJsonValue,
              contactId: candidate.contactId,
              name: candidate.name,
              identifierType: candidate.identifierType,
              identifier: candidate.identifier,
              requestedCountry: candidate.country,
              requestedDateOfBirth: candidate.dateOfBirth,
              requestedGender: candidate.gender,
            })),
          },
        },
        select: { id: true },
      });
      await createAuditLog(
        {
          tenantId: input.tenantId,
          userId: input.userId,
          companyId: input.companyId,
          action: 'CREATE',
          entityType: 'SentrowebCheckRun',
          entityId: run.id,
          entityName: company.name,
          summary: `Queued a Sentroweb check of ${selected.length} ${selected.length === 1 ? 'name' : 'names'}`,
          metadata: { entityCount: selected.length, force: input.force === true, fuzzy: input.fuzzy === true },
        },
        tx,
      );
      return run.id;
    });
  } catch (error) {
    // The partial unique index allows one QUEUED or RUNNING run per company, even under a race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new SentrowebRequestError('ALREADY_RUNNING');
    }
    throw error;
  }

  if (options.autoStart !== false) {
    setImmediate(() => {
      processRun(runId, options).catch((error: unknown) => {
        log.error('Sentroweb run failed to process', { runId, code: toSentrowebError(error).code });
      });
    });
  }
  return { runId };
}

// --- processing --------------------------------------------------------------------------------

export type ProcessOutcome =
  | { status: 'not-claimed' }
  | { status: 'stale-worker' }
  | { status: 'completed' | 'failed'; errorCode: SentrowebErrorCode | null };

export function processRun(runId: string, options: ServiceOptions = {}): Promise<ProcessOutcome> {
  return runExclusive(() => processRunLocked(runId, options));
}

/** This worker no longer owns the run (recovery took it). Nothing more may be written. */
class StaleClaimError extends Error {
  constructor() {
    super('The run is no longer claimed by this worker');
    this.name = 'StaleClaimError';
  }
}

/**
 * Runs `work` in a transaction that holds the run's row lock, after proving this worker still owns
 * the run (same claim token, still RUNNING). Recovery flips the run with an UPDATE on the same
 * row, so the two are serialised: a write either lands before recovery (and recovery sees it) or
 * is refused with StaleClaimError and rolls back completely (no result change, no Document row, no
 * audit row). Every result, Document and audit write of a run goes through here.
 */
async function withLiveClaim<T>(
  runId: string,
  claimToken: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "sentroweb_check_runs"
      WHERE "id" = ${runId} AND "claimToken" = ${claimToken} AND "status" = 'RUNNING'
      FOR UPDATE`;
    if (owned.length !== 1) throw new StaleClaimError();
    return work(tx);
  });
}

async function processRunLocked(runId: string, options: ServiceOptions): Promise<ProcessOutcome> {
  const now = options.now ?? (() => new Date());
  const client = options.client ?? sentrowebClient;
  const config = options.config !== undefined ? options.config : getSentrowebConfig();
  const timeouts = config?.timeouts ?? SENTROWEB_DEFAULT_TIMEOUTS;
  const claimToken = randomUUID();

  const claimed = await prisma.sentrowebCheckRun.updateMany({
    where: { id: runId, status: 'QUEUED' },
    data: {
      status: 'RUNNING',
      claimToken,
      startedAt: now(),
      leaseExpiresAt: new Date(now().getTime() + timeouts.runMs + SENTROWEB_LEASE_GRACE_MS),
    },
  });
  if (claimed.count !== 1) return { status: 'not-claimed' };

  const run = await prisma.sentrowebCheckRun.findUniqueOrThrow({
    where: { id: runId },
    include: { results: { orderBy: { position: 'asc' } }, company: { select: { name: true } } },
  });

  if (!config) return finishRun(run, claimToken, 'SENTROWEB_NOT_CONFIGURED', now());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeouts.runMs);
  let session: SentrowebSession | null = null;
  let fatal: SentrowebErrorCode | null = null;
  let stale = false;
  try {
    session = await client.openSession(config, {
      signal: controller.signal,
      requiredCredits: run.results.length * SENTROWEB_CREDITS_PER_SEARCH,
    });
    await prisma.sentrowebCheckRun.updateMany({
      where: { id: runId, claimToken },
      data: { balanceBefore: session.balance },
    });

    for (const [index, result] of run.results.entries()) {
      // The run's time is up: no new search starts, whatever the pause between searches is.
      await pause(index > 0 ? config.timeouts.searchDelayMs : 0, controller.signal);
      fatal = await processEntity({ run, result, session, signal: controller.signal, now, claimToken });
      if (fatal) break;
    }
  } catch (error) {
    if (error instanceof StaleClaimError) stale = true;
    else {
      fatal = toSentrowebError(error).code;
      if (!(error instanceof SentrowebError)) log.error('Sentroweb run hit an unexpected error', { runId });
    }
  } finally {
    clearTimeout(timer);
    await session?.close().catch(() => undefined);
  }

  if (stale) return { status: 'stale-worker' };
  return finishRun(run, claimToken, fatal, now());
}

interface EntityContext {
  run: SentrowebCheckRun & { company: { name: string } };
  result: SentrowebCheckResult;
  session: SentrowebSession;
  signal: AbortSignal;
  now: () => Date;
  claimToken: string;
}

interface UploadedReport {
  documentId: string;
  fileName: string;
  originalFileName: string;
  storageKey: string;
  size: number;
}

/**
 * Searches one entity and stores the outcome. Returns the code that stops the run, if any.
 * Throws StaleClaimError (and writes nothing) when recovery has taken the run.
 */
async function processEntity(context: EntityContext): Promise<SentrowebErrorCode | null> {
  const { run, result, session, signal, now, claimToken } = context;

  // Marked before the call, and only while this worker still owns the run: if this process dies
  // mid-search, recovery knows a credit may have been spent and never searches this name again,
  // and a worker that lost the run never starts another search.
  await withLiveClaim(run.id, claimToken, (tx) =>
    tx.sentrowebCheckResult.update({ where: { id: result.id }, data: { searchSubmittedAt: now() } }),
  );

  let outcome: Awaited<ReturnType<SentrowebSession['search']>>;
  try {
    outcome = await session.search(
      {
        name: result.name,
        searchType: result.searchType,
        country: result.requestedCountry,
        dateOfBirth: result.requestedDateOfBirth,
        gender: result.requestedGender === 'MALE' || result.requestedGender === 'FEMALE' ? result.requestedGender : null,
        fuzzy: run.fuzzy,
      },
      { signal },
    );
  } catch (error) {
    const failure = toSentrowebError(error);
    await withLiveClaim(run.id, claimToken, async (tx) => {
      await tx.sentrowebCheckResult.update({
        where: { id: result.id },
        data: {
          status: 'ERROR',
          errorCode: failure.code,
          checkedAt: now(),
          // A search that was cancelled before CONFIRM spent nothing.
          searchSubmittedAt: failure.searchSubmitted ? undefined : null,
        },
      });
      if (failure.searchSubmitted) {
        await tx.sentrowebCheckRun.update({
          where: { id: run.id },
          data: { creditsUsed: { increment: failure.creditsCharged ?? SENTROWEB_CREDITS_PER_SEARCH } },
        });
      }
    });
    return CONTINUE_AFTER.has(failure.code) ? null : failure.code;
  }

  const parsed = parseSentrowebResult(result.searchType, outcome.json, outcome.domTitles, {
    expectedName: result.name,
    // What the search was sent with must come back unchanged in Sentroweb's answer.
    expectedCountry: result.requestedCountry,
    expectedDateOfBirth: result.requestedDateOfBirth,
    expectedFuzzy: run.fuzzy,
  });
  const checkedAt = now();

  // Files first (they are only reachable through the rows written below), rows second, under the
  // claim. A worker that lost the run removes what it uploaded.
  const uploaded: string[] = [];
  let evidencePngKey: string | null = null;
  if (outcome.png) {
    const key = StorageKeys.sentrowebEvidence(run.tenantId, run.companyId, run.id, result.id);
    try {
      await storage.upload(key, outcome.png, { contentType: 'image/png' });
      evidencePngKey = key;
      uploaded.push(key);
    } catch {
      log.warn('Sentroweb screenshot could not be stored', { runId: run.id });
    }
  }

  let report: UploadedReport | null = null;
  if (outcome.pdf && parsed.status !== 'ERROR') {
    try {
      report = await uploadReport({ run, result, pdf: outcome.pdf, filedAt: checkedAt });
      uploaded.push(report.storageKey);
    } catch {
      log.error('Sentroweb report could not be stored', { runId: run.id });
    }
  }

  const publish = (filed: UploadedReport | null) =>
    withLiveClaim(run.id, claimToken, async (tx) => {
      let status: SentrowebResultStatus = parsed.status;
      let errorCode: SentrowebErrorCode | null =
        parsed.status === 'ERROR' ? (parsed.errorCode ?? 'RESULT_MISMATCH') : null;
      if (filed) await recordReport(tx, { run, result, report: filed, filedAt: checkedAt });
      if (parsed.status === 'CLEAR' && !filed) {
        // Without Sentroweb's own report a clear result has no evidence behind it (decision D5).
        status = 'ERROR';
        errorCode = 'EVIDENCE_MISSING';
      } else if (parsed.status === 'POSSIBLE_MATCH' && !filed) {
        errorCode = 'EVIDENCE_MISSING';
      }
      await tx.sentrowebCheckResult.update({
        where: { id: result.id },
        data: {
          status,
          matchCount: parsed.matchCount,
          categoryCounts: parsed.categoryCounts as Prisma.InputJsonValue,
          matches: parsed.matches as unknown as Prisma.InputJsonValue,
          sentrowebReportId: parsed.sentrowebReportId,
          monitorEnabled: parsed.monitorEnabled,
          errorCode,
          documentId: filed?.documentId ?? null,
          evidencePngKey,
          checkedAt,
        },
      });
      await tx.sentrowebCheckRun.update({
        where: { id: run.id },
        data: { creditsUsed: { increment: outcome.creditsCharged ?? SENTROWEB_CREDITS_PER_SEARCH } },
      });
      return errorCode;
    });

  let errorCode: SentrowebErrorCode | null;
  try {
    try {
      errorCode = await publish(report);
    } catch (error) {
      if (error instanceof StaleClaimError || !report) throw error;
      // The Document could not be filed: keep the result, without a report (a would-be CLEAR
      // becomes EVIDENCE_MISSING). The first attempt rolled back completely.
      log.error('Sentroweb report could not be filed', { runId: run.id });
      errorCode = await publish(null);
    }
  } catch (error) {
    if (error instanceof StaleClaimError) {
      await Promise.all(uploaded.map((key) => storage.delete(key).catch(() => undefined)));
    }
    throw error;
  }

  return errorCode && !CONTINUE_AFTER.has(errorCode) ? errorCode : null;
}

/** Stores Sentroweb's PDF the way e-signing stores signed packages (deterministic id and key). */
async function uploadReport(input: {
  run: SentrowebCheckRun;
  result: SentrowebCheckResult;
  pdf: Buffer;
  filedAt: Date;
}): Promise<UploadedReport> {
  const { run, result, pdf, filedAt } = input;
  const documentId = uuidv5(`${run.id}:${result.id}:sentroweb-report`, REPORT_NAMESPACE);
  const originalFileName = reportFileName(result.name, filedAt);
  const storageKey = StorageKeys.documentOriginal(run.tenantId, run.companyId, documentId, '.pdf');

  await storage.upload(storageKey, pdf, {
    contentType: 'application/pdf',
    metadata: {
      tenantId: run.tenantId,
      companyId: run.companyId,
      sentrowebRunId: run.id,
      sentrowebResultId: result.id,
      originalFileName,
    },
  });
  return { documentId, fileName: `${documentId}.pdf`, originalFileName, storageKey, size: pdf.byteLength };
}

/** Files the Document row and its audit entry (inside the claim transaction). */
async function recordReport(
  tx: Prisma.TransactionClient,
  input: { run: SentrowebCheckRun; result: SentrowebCheckResult; report: UploadedReport; filedAt: Date },
): Promise<void> {
  const { run, result, report, filedAt } = input;
  const fields = {
    tenantId: run.tenantId,
    companyId: run.companyId,
    uploadedById: run.requestedById,
    documentType: SENTROWEB_REPORT_DOCUMENT_TYPE,
    fileName: report.fileName,
    originalFileName: report.originalFileName,
    storageKey: report.storageKey,
    fileSize: report.size,
    mimeType: 'application/pdf',
    extractionStatus: 'COMPLETED',
    extractedAt: filedAt,
    isLatest: true,
  };
  await tx.document.upsert({
    where: { id: report.documentId },
    update: { ...fields, deletedAt: null, deletedReason: null },
    create: { id: report.documentId, ...fields, version: 1 },
  });
  await createAuditLog(
    {
      tenantId: run.tenantId,
      userId: run.requestedById,
      companyId: run.companyId,
      action: 'UPLOAD',
      entityType: 'Document',
      entityId: report.documentId,
      entityName: report.originalFileName,
      summary: `Filed Sentroweb report "${report.originalFileName}"`,
      changeSource: 'SYSTEM',
      metadata: { sentrowebRunId: run.id, sentrowebResultId: result.id },
    },
    tx,
  );
}

async function finishRun(
  run: Pick<SentrowebCheckRun, 'id' | 'tenantId' | 'companyId' | 'requestedById'> & { company: { name: string } },
  claimToken: string,
  errorCode: SentrowebErrorCode | null,
  finishedAt: Date,
): Promise<ProcessOutcome> {
  const failed = errorCode !== null;
  try {
    await withLiveClaim(run.id, claimToken, async (tx) => {
      // A name that was submitted but never got a result (an unexpected failure between the
      // search and the write) must not look "not run": its credit may be spent.
      await tx.sentrowebCheckResult.updateMany({
        where: { runId: run.id, status: 'NOT_RUN', searchSubmittedAt: { not: null } },
        data: { status: 'ERROR', errorCode: errorCode ?? 'UNEXPECTED_ERROR', checkedAt: finishedAt },
      });
      const rows = await tx.sentrowebCheckResult.findMany({ where: { runId: run.id }, select: { status: true } });
      const statuses = rows.map((row) => row.status);
      const overall = computeOverallResult(statuses, failed);
      await tx.sentrowebCheckRun.update({
        where: { id: run.id },
        data: {
          status: failed ? 'FAILED' : 'COMPLETED',
          overallResult: overall,
          errorCode,
          finishedAt,
          claimToken: null,
          leaseExpiresAt: null,
        },
      });
      await createAuditLog(
        {
          tenantId: run.tenantId,
          userId: run.requestedById,
          companyId: run.companyId,
          action: 'UPDATE',
          entityType: 'SentrowebCheckRun',
          entityId: run.id,
          entityName: run.company.name,
          summary: `Sentroweb check ${failed ? 'failed' : 'completed'}: ${overall.replace('_', ' ').toLowerCase()}`,
          changeSource: 'SYSTEM',
          metadata: { overallResult: overall, errorCode, ...countStatuses(statuses) },
        },
        tx,
      );
      return overall;
    });
    return { status: failed ? 'failed' : 'completed', errorCode };
  } catch (error) {
    if (error instanceof StaleClaimError) return { status: 'stale-worker' };
    throw error;
  }
}

// --- recovery ----------------------------------------------------------------------------------

/**
 * A RUNNING run whose lease expired is not resumed: it becomes FAILED INTERRUPTED. A name whose
 * search was in flight is marked ERROR INTERRUPTED (its credit may be spent); names never reached
 * stay NOT_RUN. This never calls the Sentroweb client, so nothing is searched twice.
 */
export async function recoverStaleRuns(now: Date = new Date()): Promise<{ recovered: string[] }> {
  const stale = await prisma.sentrowebCheckRun.findMany({
    where: { status: 'RUNNING', leaseExpiresAt: { lt: now } },
    select: { id: true, tenantId: true, companyId: true, requestedById: true, company: { select: { name: true } } },
  });

  const recovered: string[] = [];
  for (const run of stale) {
    const done = await prisma.$transaction(async (tx) => {
      const flipped = await tx.sentrowebCheckRun.updateMany({
        where: { id: run.id, status: 'RUNNING', leaseExpiresAt: { lt: now } },
        data: { status: 'FAILED', errorCode: 'INTERRUPTED', finishedAt: now, claimToken: null, leaseExpiresAt: null },
      });
      if (flipped.count !== 1) return false;
      await tx.sentrowebCheckResult.updateMany({
        where: { runId: run.id, status: 'NOT_RUN', searchSubmittedAt: { not: null } },
        data: { status: 'ERROR', errorCode: 'INTERRUPTED', checkedAt: now },
      });
      const rows = await tx.sentrowebCheckResult.findMany({ where: { runId: run.id }, select: { status: true } });
      const statuses = rows.map((row) => row.status);
      const overallResult = computeOverallResult(statuses, true);
      await tx.sentrowebCheckRun.update({ where: { id: run.id }, data: { overallResult } });
      await createAuditLog(
        {
          tenantId: run.tenantId,
          userId: run.requestedById,
          companyId: run.companyId,
          action: 'UPDATE',
          entityType: 'SentrowebCheckRun',
          entityId: run.id,
          entityName: run.company.name,
          summary: 'Sentroweb check was interrupted before it finished',
          changeSource: 'SYSTEM',
          metadata: { overallResult, errorCode: 'INTERRUPTED', ...countStatuses(statuses) },
        },
        tx,
      );
      return true;
    });
    if (done) recovered.push(run.id);
  }
  return { recovered };
}

/** Starts QUEUED runs the in-process start missed (for example after a restart). Not awaited. */
export async function startStaleQueuedRuns(
  now: Date = new Date(),
  options: ServiceOptions = {},
): Promise<{ started: string[] }> {
  const queued = await prisma.sentrowebCheckRun.findMany({
    where: { status: 'QUEUED', createdAt: { lt: new Date(now.getTime() - SENTROWEB_QUEUED_PICKUP_MS) } },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true },
  });
  for (const { id } of queued) {
    processRun(id, options).catch((error: unknown) => {
      log.error('Sentroweb queued run failed to process', { runId: id, code: toSentrowebError(error).code });
    });
  }
  return { started: queued.map((run) => run.id) };
}

// --- reading -----------------------------------------------------------------------------------

type RunRow = SentrowebCheckRun & {
  requestedBy: { id: string; firstName: string | null; lastName: string | null } | null;
};

function toResultDto(row: SentrowebCheckResult): SentrowebResultDto {
  return {
    id: row.id,
    position: row.position,
    name: row.name,
    entityKind: row.entityKind,
    searchType: row.searchType,
    roles: row.roles,
    identifierType: row.identifierType,
    identifier: row.identifier,
    searchDetails: {
      country: row.requestedCountry,
      dateOfBirth: row.requestedDateOfBirth !== null,
      gender: row.requestedGender === 'MALE' || row.requestedGender === 'FEMALE' ? row.requestedGender : null,
    },
    // These are the details the search was requested with. They count as sent only for a result
    // that was read back: a search that was never run, failed before SEARCH or ended in an error
    // proves nothing about what reached Sentroweb.
    searchDetailsSent: row.searchSubmittedAt !== null && (row.status === 'CLEAR' || row.status === 'POSSIBLE_MATCH'),
    status: row.status,
    matchCount: row.matchCount,
    categoryCounts: (row.categoryCounts ?? {}) as SentrowebCategoryCounts,
    matches: (row.matches ?? []) as unknown as SentrowebMatch[],
    monitorEnabled: row.monitorEnabled,
    errorCode: row.errorCode,
    errorMessage: sentrowebErrorMessage(row.errorCode),
    documentId: row.documentId,
    hasScreenshot: row.evidencePngKey !== null,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}

function toRunDto(row: RunRow, results?: SentrowebCheckResult[]): SentrowebRunDto {
  const name = row.requestedBy ? [row.requestedBy.firstName, row.requestedBy.lastName].filter(Boolean).join(' ') : '';
  return {
    id: row.id,
    companyId: row.companyId,
    status: row.status,
    overallResult: (row.overallResult as SentrowebOverallValue | null) ?? null,
    errorCode: row.errorCode,
    errorMessage: sentrowebErrorMessage(row.errorCode),
    entityCount: row.entityCount,
    fuzzy: row.fuzzy,
    creditsUsed: row.creditsUsed,
    requestedBy: row.requestedBy ? { id: row.requestedBy.id, name: name || 'Unknown user' } : null,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    ...(results ? { results: results.map(toResultDto) } : {}),
  };
}

const REQUESTED_BY = { select: { id: true, firstName: true, lastName: true } } as const;

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) throw new ValidationError('Invalid cursor');
  return { createdAt, id };
}

/** Run history, newest first, paginated by `(createdAt, id)`. */
export async function listRuns(
  tenantId: string,
  companyId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<SentrowebRunListResponse> {
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;
  const rows = await prisma.sentrowebCheckRun.findMany({
    where: {
      tenantId,
      companyId,
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: { requestedBy: REQUESTED_BY },
  });
  const page = rows.slice(0, limit);
  return {
    runs: page.map((row) => toRunDto(row)),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getRun(tenantId: string, companyId: string, runId: string): Promise<SentrowebRunDto> {
  const row = await prisma.sentrowebCheckRun.findFirst({
    where: { id: runId, tenantId, companyId },
    include: { requestedBy: REQUESTED_BY, results: { orderBy: { position: 'asc' } } },
  });
  if (!row) throw new NotFoundError('Sentroweb check not found');
  return toRunDto(row, row.results);
}

/** The PDF report Sentroweb produced for a result, scoped by tenant, company and run. */
export async function getResultReport(
  tenantId: string,
  companyId: string,
  runId: string,
  resultId: string,
): Promise<{ pdf: Buffer; fileName: string; documentId: string }> {
  const result = await prisma.sentrowebCheckResult.findFirst({
    where: { id: resultId, runId, tenantId, companyId, documentId: { not: null } },
    select: { documentId: true },
  });
  if (!result?.documentId) throw new NotFoundError('Report not found');
  const document = await prisma.document.findFirst({
    where: {
      id: result.documentId,
      tenantId,
      companyId,
      documentType: SENTROWEB_REPORT_DOCUMENT_TYPE,
      deletedAt: null,
    },
    select: { id: true, storageKey: true, originalFileName: true },
  });
  if (!document) throw new NotFoundError('Report not found');
  return { pdf: await storage.download(document.storageKey), fileName: document.originalFileName, documentId: document.id };
}

/** The result's screenshot bytes, scoped by tenant, company and run. */
export async function getResultScreenshot(
  tenantId: string,
  companyId: string,
  runId: string,
  resultId: string,
): Promise<{ png: Buffer; fileName: string; runId: string; resultName: string }> {
  const row = await prisma.sentrowebCheckResult.findFirst({
    where: { id: resultId, runId, tenantId, companyId },
    select: { evidencePngKey: true, name: true },
  });
  if (!row?.evidencePngKey) throw new NotFoundError('Screenshot not found');
  const png = await storage.download(row.evidencePngKey);
  return { png, fileName: `sentroweb-${resultId}.png`, runId, resultName: row.name };
}
