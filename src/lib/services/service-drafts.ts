import type { DeadlineExclusionInput, DeadlineRuleInput } from '@/lib/validations/service';

const SERVICE_DRAFTS_STORAGE_PREFIX = 'company-service-drafts:';
const LEGACY_SERVICE_DRAFT_STORAGE_PREFIX = 'company-service-draft:';

export interface PersistedServiceDraft<TFormValues = Record<string, unknown>> {
  id: string;
  companyId: string;
  contractId: string | null;
  title: string;
  formValues: TFormValues;
  deadlineRules: DeadlineRuleInput[];
  excludedDeadlines: DeadlineExclusionInput[];
  selectedTemplate: string | null;
  fyeYearInput: string;
  createdAt: string;
  updatedAt: string;
}

interface LegacyServiceDraftSnapshot<TFormValues = Record<string, unknown>> {
  formValues?: TFormValues;
  deadlineRules?: DeadlineRuleInput[];
  excludedDeadlines?: DeadlineExclusionInput[];
  selectedTemplate?: string | null;
  fyeYearInput?: string;
  savedAt?: string;
}

function buildDraftsStorageKey(companyId: string): string {
  return `${SERVICE_DRAFTS_STORAGE_PREFIX}${companyId}`;
}

function readDrafts<TFormValues = Record<string, unknown>>(companyId: string): PersistedServiceDraft<TFormValues>[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(buildDraftsStorageKey(companyId));
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<PersistedServiceDraft<TFormValues>>;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.updatedAt === 'string')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

function writeDrafts<TFormValues = Record<string, unknown>>(
  companyId: string,
  drafts: PersistedServiceDraft<TFormValues>[]
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(buildDraftsStorageKey(companyId), JSON.stringify(drafts));
}

function normalizeDraftTitle(rawName: unknown): string {
  if (typeof rawName === 'string' && rawName.trim()) {
    return rawName.trim();
  }
  return 'Untitled Service Draft';
}

function legacyDraftContractIdFromKey(companyId: string, key: string): string | null {
  const prefix = `${LEGACY_SERVICE_DRAFT_STORAGE_PREFIX}${companyId}:`;
  if (!key.startsWith(prefix)) return null;
  const suffix = key.slice(prefix.length);
  if (!suffix || suffix === 'default') return null;
  return suffix;
}

export function migrateLegacyServiceDrafts<TFormValues = Record<string, unknown>>(companyId: string): number {
  if (typeof window === 'undefined') return 0;

  const existingDrafts = readDrafts<TFormValues>(companyId);
  const existingIds = new Set(existingDrafts.map((draft) => draft.id));
  const migrated: PersistedServiceDraft<TFormValues>[] = [];
  const keysToRemove: string[] = [];

  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(`${LEGACY_SERVICE_DRAFT_STORAGE_PREFIX}${companyId}:`)) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      let parsed: LegacyServiceDraftSnapshot<TFormValues> | null = null;
      try {
        parsed = JSON.parse(raw) as LegacyServiceDraftSnapshot<TFormValues>;
      } catch {
        parsed = null;
      }

      if (!parsed?.formValues) {
        keysToRemove.push(key);
        continue;
      }

      const timestamp = parsed.savedAt && !Number.isNaN(new Date(parsed.savedAt).getTime())
        ? parsed.savedAt
        : new Date().toISOString();
      const candidateId = `legacy-${new Date(timestamp).getTime()}-${Math.random().toString(36).slice(2, 8)}`;
      if (existingIds.has(candidateId)) {
        keysToRemove.push(key);
        continue;
      }

      const formValues = parsed.formValues as Record<string, unknown>;
      const draft: PersistedServiceDraft<TFormValues> = {
        id: candidateId,
        companyId,
        contractId: legacyDraftContractIdFromKey(companyId, key),
        title: normalizeDraftTitle(formValues?.name),
        formValues: parsed.formValues,
        deadlineRules: Array.isArray(parsed.deadlineRules) ? parsed.deadlineRules : [],
        excludedDeadlines: Array.isArray(parsed.excludedDeadlines) ? parsed.excludedDeadlines : [],
        selectedTemplate: typeof parsed.selectedTemplate === 'string' ? parsed.selectedTemplate : null,
        fyeYearInput: typeof parsed.fyeYearInput === 'string' ? parsed.fyeYearInput : String(new Date().getFullYear()),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      migrated.push(draft);
      existingIds.add(candidateId);
      keysToRemove.push(key);
    }

    if (migrated.length > 0) {
      const nextDrafts = [...existingDrafts, ...migrated]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      writeDrafts(companyId, nextDrafts);
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    return 0;
  }

  return migrated.length;
}

export function listServiceDrafts<TFormValues = Record<string, unknown>>(companyId: string): PersistedServiceDraft<TFormValues>[] {
  return readDrafts<TFormValues>(companyId);
}

export function getServiceDraft<TFormValues = Record<string, unknown>>(
  companyId: string,
  draftId: string
): PersistedServiceDraft<TFormValues> | null {
  const drafts = readDrafts<TFormValues>(companyId);
  return drafts.find((draft) => draft.id === draftId) ?? null;
}

export function saveServiceDraft<TFormValues = Record<string, unknown>>(
  companyId: string,
  draft: PersistedServiceDraft<TFormValues>
): void {
  const drafts = readDrafts<TFormValues>(companyId);
  const withoutCurrent = drafts.filter((item) => item.id !== draft.id);
  writeDrafts(companyId, [draft, ...withoutCurrent]);
}

export function deleteServiceDraft(companyId: string, draftId: string): void {
  const drafts = readDrafts(companyId);
  const next = drafts.filter((draft) => draft.id !== draftId);
  writeDrafts(companyId, next);
}

export function buildServiceDraftRecord<TFormValues = Record<string, unknown>>(args: {
  id?: string;
  companyId: string;
  contractId?: string | null;
  title?: string;
  formValues: TFormValues;
  deadlineRules: DeadlineRuleInput[];
  excludedDeadlines: DeadlineExclusionInput[];
  selectedTemplate: string | null;
  fyeYearInput: string;
  createdAt?: string;
  updatedAt?: string;
}): PersistedServiceDraft<TFormValues> {
  const now = new Date().toISOString();
  const id =
    args.id ??
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const formValues = args.formValues as Record<string, unknown>;
  return {
    id,
    companyId: args.companyId,
    contractId: args.contractId ?? null,
    title: args.title || normalizeDraftTitle(formValues?.name),
    formValues: args.formValues,
    deadlineRules: args.deadlineRules,
    excludedDeadlines: args.excludedDeadlines,
    selectedTemplate: args.selectedTemplate,
    fyeYearInput: args.fyeYearInput,
    createdAt: args.createdAt ?? now,
    updatedAt: args.updatedAt ?? now,
  };
}
