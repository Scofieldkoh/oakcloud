'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, History, Loader2, Plus, Search } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import {
  useArchiveDeadlineRule,
  useCreateDeadlineRule,
  useDeadlineRule,
  useDeadlineRules,
  usePreviewDeadlineRuleImpact,
  usePublishDeadlineRule,
  useUpdateDeadlineRule,
} from '@/hooks/use-deadline-rules';
import type { DeadlineRuleDraftInput } from '@/lib/validations/deadline-rule';
import type { DeadlineRuleArchiveInput, DeadlineRuleImpactInput, DeadlineRulePublishInput } from '@/services/deadline-rule';
import type { DeadlineRuleDto, DeadlineRuleImpact } from '@/services/deadline-rule';
import { DeadlineRuleForm } from './deadline-rule-form';
import { RuleImpactDialog } from './rule-impact-dialog';

interface DeadlineRulesPanelProps {
  workspaceId?: string;
  canAdminister?: boolean;
  featureEnabled?: boolean;
  active?: boolean;
}

type StatusFilter = 'all' | 'active' | 'inactive';

function ruleDraftIdentity(rule: DeadlineRuleDto, operation: 'PUBLISH' | 'ARCHIVE'): DeadlineRuleImpactInput {
  const draft = rule.draft ?? rule.currentVersion;
  return {
    operation,
    expectedCurrentVersion: rule.currentVersion?.version ?? null,
    expectedDraftRevision: draft?.draftRevision ?? 1,
    draftConfigHash: draft?.configHash ?? '',
  };
}

function formatDate(value: Date | string | null): string {
  if (!value) return 'Not published';
  return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium' }).format(new Date(value));
}

export function DeadlineRulesPanel({
  workspaceId,
  canAdminister = true,
  featureEnabled = true,
  active = true,
}: DeadlineRulesPanelProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<DeadlineRuleImpact | null>(null);
  const [archivePreview, setArchivePreview] = useState<DeadlineRuleImpact | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveImpactOpen, setArchiveImpactOpen] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<DeadlineRuleDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = useMemo(() => ({
    query: query || undefined,
    isActive: status === 'all' ? undefined : status === 'active',
    includeArchived: status === 'inactive',
    page,
    limit: 20,
  }), [page, query, status]);
  const panelEnabled = Boolean(active && featureEnabled && canAdminister && workspaceId);
  const list = useDeadlineRules(workspaceId, filters, panelEnabled);
  const firstId = list.data?.rules[0]?.id;
  const activeId = selectedId ?? firstId;
  const detail = useDeadlineRule(workspaceId, activeId, panelEnabled);
  const selected = selectedOverride?.id === activeId
    ? selectedOverride
    : detail.data ?? list.data?.rules.find((rule) => rule.id === activeId) ?? null;
  const create = useCreateDeadlineRule(workspaceId);
  const update = useUpdateDeadlineRule(workspaceId);
  const previewMutation = usePreviewDeadlineRuleImpact(workspaceId);
  const publish = usePublishDeadlineRule(workspaceId);
  const archive = useArchiveDeadlineRule(workspaceId);

  const syncAuthoritativeRule = async (result: DeadlineRuleDto | undefined) => {
    if (result) {
      setSelectedOverride(result);
      return;
    }
    try {
      await detail.refetch();
    } catch {
      // The mutation succeeded; the query error state will expose a failed
      // refetch without retaining the pre-mutation override.
    } finally {
      setSelectedOverride(null);
    }
  };

  useEffect(() => {
    if (!activeId && firstId) setSelectedId(firstId);
    if (selectedId && list.data && !list.data.rules.some((rule) => rule.id === selectedId)) setSelectedId(firstId);
  }, [activeId, firstId, list.data, selectedId]);

  useEffect(() => {
    setPreview(null);
    setArchivePreview(null);
    setArchiveImpactOpen(false);
    setSelectedOverride((current) => current?.id === activeId ? current : null);
    setDraftDirty(false);
  }, [activeId]);

  const handlePreview = async (operation: 'PUBLISH' | 'ARCHIVE') => {
    if (!selected || draftDirty) return;
    setActionError(null);
    try {
      const impact = await previewMutation.mutateAsync({ id: selected.id, input: ruleDraftIdentity(selected, operation) });
      if (operation === 'ARCHIVE') {
        setArchivePreview(impact);
        setPreview(null);
        setArchiveImpactOpen(true);
      } else {
        setPreview(impact);
        setArchivePreview(null);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to preview impact.');
    }
  };

  const handleDraftSubmit = async (input: DeadlineRuleDraftInput) => {
    setActionError(null);
    try {
      if (creating) {
        const created = await create.mutateAsync(input);
        setCreating(false);
        setSelectedId(created.id);
        setSelectedOverride(created);
      } else if (selected) {
        const updated = await update.mutateAsync({ id: selected.id, input });
        if (updated) setSelectedOverride(updated);
        setEditing(false);
      }
      setDraftDirty(false);
      setPreview(null);
      setArchivePreview(null);
      setArchiveImpactOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to save the deadline rule.');
      throw error;
    }
  };

  const handlePublish = async () => {
    if (!selected || !preview || draftDirty) return;
    const identity = ruleDraftIdentity(selected, 'PUBLISH');
    const input: DeadlineRulePublishInput = { ...identity, operation: 'PUBLISH', previewFingerprint: preview.previewFingerprint };
    setActionError(null);
    try {
      const published = await publish.mutateAsync({ id: selected.id, input });
      await syncAuthoritativeRule(published);
      setPreview(null);
      setEditing(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to publish the deadline rule. The preview may be stale.');
      setPreview(null);
    }
  };

  const handleArchive = async () => {
    if (!selected || !archivePreview || archiveReason.trim().length < 10) return;
    const identity = ruleDraftIdentity(selected, 'ARCHIVE');
    const input: DeadlineRuleArchiveInput = { ...identity, operation: 'ARCHIVE', previewFingerprint: archivePreview.previewFingerprint, reason: archiveReason.trim() };
    setActionError(null);
    try {
      const archived = await archive.mutateAsync({ id: selected.id, input });
      await syncAuthoritativeRule(archived);
      setArchiveDialogOpen(false);
      setArchiveReason('');
      setArchivePreview(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to archive the deadline rule. The preview may be stale.');
      setArchivePreview(null);
    }
  };

  const confirmArchiveImpact = () => {
    if (!archivePreview) return;
    setArchiveImpactOpen(false);
    setArchiveDialogOpen(true);
  };

  const clearArchiveFlow = () => {
    if (archive.isPending) return;
    setArchiveDialogOpen(false);
    setArchiveImpactOpen(false);
    setArchiveReason('');
    setArchivePreview(null);
  };

  if (!featureEnabled) {
    return <section aria-labelledby="deadline-rules-heading" className="card p-6"><h2 id="deadline-rules-heading" className="text-lg font-semibold text-text-primary">Deadline rules</h2><p className="mt-2 text-sm text-text-secondary">Deadline rule administration is not enabled for this workspace.</p></section>;
  }

  if (!canAdminister) {
    return <section aria-labelledby="deadline-rules-heading" className="card p-6"><h2 id="deadline-rules-heading" className="text-lg font-semibold text-text-primary">Deadline rules</h2><p className="mt-2 text-sm text-text-secondary">Tenant Admin access is required to manage deadline rules.</p></section>;
  }

  if (!workspaceId) {
    return <section aria-labelledby="deadline-rules-heading" className="card p-6"><h2 id="deadline-rules-heading" className="text-lg font-semibold text-text-primary">Deadline rules</h2><p className="mt-2 text-sm text-text-secondary">Select a workspace to administer deadline rules.</p></section>;
  }

  if (creating) {
    return <section aria-labelledby="deadline-rules-heading"><div className="mb-4"><h2 id="deadline-rules-heading" className="text-lg font-semibold text-text-primary">Deadline rules</h2><p className="mt-1 text-sm text-text-secondary">Create a versioned rule set for any service family.</p></div><div className="rounded-lg border border-border-primary bg-background-secondary"><DeadlineRuleForm onCancel={() => { setCreating(false); setDraftDirty(false); }} onSubmit={handleDraftSubmit} onDirtyChange={() => { setDraftDirty(true); setPreview(null); setArchivePreview(null); }} isSubmitting={create.isPending} /></div></section>;
  }

  return (
    <section aria-labelledby="deadline-rules-heading">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 id="deadline-rules-heading" className="text-lg font-semibold text-text-primary">Deadline rules</h2><p className="mt-1 text-sm text-text-secondary">Versioned rule sets, eligibility, milestones, and future-impact previews.</p></div>
        <Button type="button" size="sm" className="min-h-[44px] sm:min-h-8" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setCreating(true); setDraftDirty(false); setPreview(null); }}>Add deadline rule</Button>
      </div>
      {actionError ? <Alert variant="error" title="Action failed" onClose={() => setActionError(null)}>{actionError}</Alert> : null}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border-primary bg-background-secondary" aria-label="Deadline rule list">
          <div className="space-y-3 border-b border-border-primary p-3">
            <FormInput aria-label="Search deadline rules" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search code or name" leftIcon={<Search className="h-4 w-4" />} className="min-h-[44px]" />
            <label className="block text-xs font-medium text-text-secondary">Status<select aria-label="Deadline rule status" className="input mt-2 min-h-[44px] w-full" value={status} onChange={(event) => { setStatus(event.target.value as StatusFilter); setPage(1); }}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive / archived</option></select></label>
          </div>
          {list.isLoading ? <div role="status" className="flex items-center gap-2 p-6 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading deadline rules…</div> : list.error ? <div className="space-y-2 p-6 text-sm"><p className="font-medium text-status-error">Unable to load deadline rules.</p><p className="text-text-muted">{list.error instanceof Error ? list.error.message : 'Try again shortly.'}</p><Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => void list.refetch()}>Retry</Button></div> : list.data?.rules.length ? <div className="divide-y divide-border-secondary">{list.data.rules.map((rule) => <button key={rule.id} type="button" className={`flex min-h-[68px] w-full flex-col items-start gap-1 px-3 py-3 text-left transition-colors hover:bg-background-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30 ${rule.id === activeId ? 'border-l-2 border-oak-primary bg-background-tertiary' : ''}`} aria-pressed={rule.id === activeId} onClick={() => { setSelectedId(rule.id); setSelectedOverride(null); setEditing(false); setDraftDirty(false); setPreview(null); setArchivePreview(null); setArchiveImpactOpen(false); }}><span className="flex flex-wrap items-center gap-2 font-medium text-text-primary">{rule.name}<span className={rule.isActive ? 'badge badge-success' : 'badge badge-neutral'}>{rule.isActive ? 'Active' : 'Inactive'}</span></span><span className="text-xs text-text-muted">{rule.code}{rule.currentVersion ? ` · Published v${rule.currentVersion.version}` : ' · Draft only'}</span></button>)}</div> : <div className="p-6 text-center"><p className="text-sm font-medium text-text-primary">No deadline rules found</p><p className="mt-1 text-xs text-text-muted">Create a rule or adjust the search and status filters.</p></div>}
          {!list.isLoading && !list.error ? <Pagination page={list.data?.page ?? page} totalPages={Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.limit ?? 20)))} total={list.data?.total ?? 0} limit={list.data?.limit ?? 20} onPageChange={setPage} showPageSize={false} showJumpToPage={false} largeTouchTargets /> : null}
        </aside>

        <div className="min-w-0 rounded-lg border border-border-primary bg-background-secondary">
          {detail.isLoading && activeId ? <div role="status" className="flex items-center gap-2 p-8 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading rule detail…</div> : detail.error ? <div className="space-y-2 p-8"><p className="font-medium text-status-error">Unable to load rule detail.</p><Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => void detail.refetch()}>Retry</Button></div> : selected ? <>
            <div className="flex flex-col gap-3 border-b border-border-primary p-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-text-primary">{selected.name}<span className={selected.isActive ? 'badge badge-success' : 'badge badge-neutral'}>{selected.isActive ? `Active v${selected.currentVersion?.version ?? 'draft'}` : 'Inactive'}</span></h3><p className="mt-1 text-sm text-text-secondary">{selected.description || selected.code}</p><p className="mt-1 text-xs text-text-muted">Published {formatDate(selected.currentVersion?.publishedAt ?? null)} · Draft revision {selected.draft?.draftRevision ?? '—'}</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="xs" className="min-h-[44px]" aria-label={`Edit ${selected.name}`} onClick={() => { setEditing(true); setDraftDirty(false); setPreview(null); setArchivePreview(null); }}>Edit rule</Button><Button type="button" variant="ghost" size="xs" className="min-h-[44px]" onClick={() => void handlePreview('PUBLISH')} disabled={previewMutation.isPending || draftDirty}>Preview impact</Button><Button type="button" variant="ghost" size="xs" className="min-h-[44px]" onClick={() => void handlePreview('ARCHIVE')} disabled={previewMutation.isPending || draftDirty}><Archive className="h-3.5 w-3.5" /> Preview archive impact</Button></div></div>
            {editing ? <><div className="border-b border-border-primary"><DeadlineRuleForm initialValue={selected} onCancel={() => { setEditing(false); setDraftDirty(false); }} onSubmit={handleDraftSubmit} onDirtyChange={() => { setDraftDirty(true); setPreview(null); setArchivePreview(null); setArchiveImpactOpen(false); }} isSubmitting={update.isPending} /></div><div className="flex justify-end border-b border-border-primary p-4"><Button type="button" className="min-h-[44px]" onClick={handlePublish} disabled={draftDirty || !preview || preview.operation !== 'PUBLISH' || publish.isPending} isLoading={publish.isPending}>Publish rule</Button></div></> : <>
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3"><div className="rounded-lg border border-border-primary bg-background-primary p-3"><p className="text-xs text-text-muted">Recurrence</p><p className="mt-1 text-sm text-text-primary">{String((selected.draft ?? selected.currentVersion)?.recurrence && ((selected.draft ?? selected.currentVersion)?.recurrence as { kind?: string }).kind).replaceAll('_', ' ')}</p></div><div className="rounded-lg border border-border-primary bg-background-primary p-3"><p className="text-xs text-text-muted">Applicability</p><p className="mt-1 text-sm text-text-primary">{String(((selected.draft ?? selected.currentVersion)?.applicability as { kind?: string } | undefined)?.kind ?? '—')} conditions</p></div><div className="rounded-lg border border-border-primary bg-background-primary p-3"><p className="text-xs text-text-muted">Milestones</p><p className="mt-1 text-sm text-text-primary">{(selected.draft ?? selected.currentVersion)?.milestones.length ?? 0} configured</p></div></div>
              <div className="border-t border-border-primary p-4"><div className="mb-3 flex items-center gap-2"><History className="h-4 w-4 text-text-muted" /><h4 className="text-sm font-semibold text-text-primary">Immutable version history</h4></div>{selected.versions.filter((version) => version.state === 'PUBLISHED').length === 0 ? <p className="text-sm text-text-muted">No immutable versions yet.</p> : <ol className="space-y-2">{selected.versions.filter((version) => version.state === 'PUBLISHED').map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-secondary p-3 text-sm"><span>Published version {version.version}</span><span className="text-xs text-text-muted">{formatDate(version.publishedAt)}</span></li>)}</ol>}</div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-primary p-4"><Button type="button" className="min-h-[44px]" onClick={handlePublish} disabled={draftDirty || !preview || preview.operation !== 'PUBLISH' || publish.isPending} isLoading={publish.isPending}>Publish rule</Button><Button type="button" variant="danger" className="min-h-[44px]" onClick={() => { if (archivePreview) { setArchiveImpactOpen(true); } else void handlePreview('ARCHIVE'); }} disabled={archive.isPending || draftDirty}>Archive rule</Button></div>
            </>}
          </> : <div className="p-8 text-center text-sm text-text-muted">Select a deadline rule to inspect its versioned configuration.</div>}
        </div>
      </div>

      <RuleImpactDialog impact={preview} onClose={() => setPreview(null)} onConfirm={() => void handlePublish()} confirmLabel="Publish rule" isConfirming={publish.isPending} />
      <RuleImpactDialog impact={archiveImpactOpen ? archivePreview : null} onClose={clearArchiveFlow} onConfirm={confirmArchiveImpact} confirmLabel="Continue to archive" />
      <Modal isOpen={archiveDialogOpen} onClose={clearArchiveFlow} title="Archive deadline rule" description="Archiving preserves history and cancels only eligible future open occurrences.">
        <div className="space-y-4 p-4"><FormInput label="Archive reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} hint="At least 10 characters are required for the audit trail." disabled={archive.isPending} className="min-h-[44px]" /><p className="text-xs text-text-muted">Current archive impact fingerprint: {archivePreview?.previewFingerprint.slice(0, 12)}…</p><div className="flex justify-end gap-2"><Button type="button" variant="secondary" className="min-h-[44px]" onClick={clearArchiveFlow} disabled={archive.isPending}>Cancel</Button><Button type="button" variant="danger" className="min-h-[44px]" onClick={() => void handleArchive()} disabled={archiveReason.trim().length < 10 || !archivePreview} isLoading={archive.isPending}>Archive rule</Button></div></div>
      </Modal>
    </section>
  );
}
