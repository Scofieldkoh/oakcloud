'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dropdown, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import type { DocumentTemplateSummary } from '@/types/document-generation';
import type { DocumentTemplatePresetDto } from '@/types/document-template-preset';
import type { EditableBatchItem } from './batch-workspace-state';
import { describePresetLoad, planPresetLoad } from './template-preset-load';

export interface TemplatePresetsProps {
  templates: DocumentTemplateSummary[];
  selected: EditableBatchItem[];
  onAddMany: (templates: DocumentTemplateSummary[]) => void;
  disabled?: boolean;
  maxDocuments?: number;
}

const BASE_URL = '/api/document-template-presets';
const normalizedName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'The preset request failed');
  return payload as T;
}
const readPresets = async () => (await requestJson<{ presets: DocumentTemplatePresetDto[] }>(BASE_URL)).presets;

/** Management stays in the Documents picker; presets never hold input values. */
export function TemplatePresets(props: TemplatePresetsProps) {
  const { selected, disabled = false, maxDocuments = 20 } = props;
  // Selection can change while a request is in flight. Never use a stale cap or lock.
  const latest = useRef(props);
  latest.current = props;
  const { success, error: showError } = useToast();
  const [presets, setPresets] = useState<DocumentTemplatePresetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState<{ preset: DocumentTemplatePresetDto; ids: string[] } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleting, setDeleting] = useState<DocumentTemplatePresetDto | null>(null);
  const [notice, setNotice] = useState<ReturnType<typeof describePresetLoad> | null>(null);

  useEffect(() => {
    let active = true;
    readPresets().then((rows) => {
      if (active) { setPresets(rows); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const load = async (id: string) => {
    if (busy || latest.current.disabled) return;
    setBusy(true);
    try {
      // Resolve availability and Word replacements again at the actual load.
      const rows = await readPresets();
      setPresets(rows);
      setFailed(false);
      const preset = rows.find((row) => row.id === id);
      if (!preset) throw new Error('This preset is no longer available.');
      const current = latest.current;
      if (current.disabled) return;
      const plan = planPresetLoad(preset, current.templates, (current.maxDocuments ?? 20) - current.selected.length);
      if (plan.templates.length) current.onAddMany(plan.templates);
      const message = describePresetLoad(preset, plan);
      // Skips persist locally until dismissed; a toast alone disappears too soon.
      setNotice(message.variant === 'success' ? null : message);
      if (message.variant === 'success') success(message.text);
    } catch (caught) {
      setNotice({ variant: 'error', text: caught instanceof Error ? caught.message : 'Could not load the preset' });
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (busy || latest.current.disabled || !latest.current.selected.length || !name.trim()) return;
    setBusy(true);
    setSaveError(null);
    try {
      // Refresh before checking a name so another user's new preset isn't silently replaced.
      const rows = await readPresets();
      setPresets(rows);
      const current = latest.current;
      if (current.disabled || !current.selected.length) return;
      const ids = current.selected.map((item) => item.templateId);
      const existing = rows.find((row) => normalizedName(row.name) === normalizedName(name));
      if (existing) {
        setSaveOpen(false);
        setOverwrite({ preset: existing, ids });
        return;
      }
      await requestJson(BASE_URL, { method: 'POST', body: JSON.stringify({ name: name.trim(), templateIds: ids }) });
      success(`Saved preset “${name.trim()}”`);
      setSaveOpen(false);
      setPresets(await readPresets());
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save the preset');
    } finally { setBusy(false); }
  };

  const replace = async () => {
    if (!overwrite || latest.current.disabled) { setOverwrite(null); return; }
    setBusy(true);
    try {
      await requestJson(`${BASE_URL}/${encodeURIComponent(overwrite.preset.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ templateIds: overwrite.ids, expectedUpdatedAt: overwrite.preset.updatedAt }),
      });
      success(`Saved preset “${overwrite.preset.name}”`);
      setOverwrite(null);
      setPresets(await readPresets());
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : 'Could not replace the preset');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await requestJson(`${BASE_URL}/${encodeURIComponent(deleting.id)}`, { method: 'DELETE' });
      setPresets((rows) => rows.filter((row) => row.id !== deleting.id));
      success(`Deleted preset “${deleting.name}”`);
      setDeleting(null);
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : 'Could not delete the preset');
    } finally { setBusy(false); }
  };

  const availability = (preset: DocumentTemplatePresetDto) => {
    const count = preset.items.filter((item) => !item.available).length;
    return `${preset.items.length} templates${count ? ` · ${count} unavailable` : ''}`;
  };

  return (
    <div className="space-y-2 border-b border-border-secondary px-3 py-2">
      <Dropdown>
        <DropdownTrigger aria-label="Template presets">Presets</DropdownTrigger>
        <DropdownMenu align="left" className="max-h-96 min-w-64 overflow-y-auto">
          <DropdownLabel>Load preset (append)</DropdownLabel>
          {loading && <DropdownItem disabled>Loading presets…</DropdownItem>}
          {failed && <DropdownItem disabled>Presets could not be loaded</DropdownItem>}
          {!loading && !failed && presets.length === 0 && <DropdownItem disabled>No presets yet</DropdownItem>}
          {presets.map((preset) => (
            <DropdownItem key={preset.id} description={availability(preset)} disabled={disabled || busy || selected.length >= maxDocuments} onClick={() => void load(preset.id)}>
              {preset.name}
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <DropdownItem disabled={disabled || busy || selected.length === 0} onClick={() => { setName(''); setSaveError(null); setSaveOpen(true); }}>
            Save selection as preset…
          </DropdownItem>
          <DropdownItem disabled={busy} onClick={() => setManageOpen(true)}>Manage presets…</DropdownItem>
        </DropdownMenu>
      </Dropdown>
      {notice && <Alert variant={notice.variant} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Modal isOpen={saveOpen} onClose={() => { if (!busy) setSaveOpen(false); }} title="Save selection as preset" description="Shared with this workspace. Only the ordered templates are saved, not company choices or inputs." size="sm">
        <ModalBody>
          <FormInput label="Preset name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
          {saveError && <Alert variant="error" className="mt-3">{saveError}</Alert>}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" disabled={busy} onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={disabled || !selected.length || !name.trim()} isLoading={busy} onClick={() => void save()}>Save preset</Button>
        </ModalFooter>
      </Modal>
      <ConfirmDialog isOpen={overwrite !== null} onClose={() => setOverwrite(null)} onConfirm={replace} title="Replace preset?" description={`“${overwrite?.preset.name ?? ''}” already exists. Replace its templates with the current selection? This changes it for everyone in this workspace.`} confirmLabel="Replace preset" variant="warning" isLoading={busy} />

      <Modal isOpen={manageOpen} onClose={() => setManageOpen(false)} title="Manage presets" description="Workspace-shared template selections. Deleting a preset does not delete its templates or change any batch.">
        <ModalBody>
          {presets.length === 0 && <p className="text-sm text-text-muted">No presets yet</p>}
          <ul className="space-y-2">
            {presets.map((preset) => (
              <li key={preset.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-primary p-3">
                <div className="min-w-0"><p className="break-words text-sm font-medium text-text-primary">{preset.name}</p><p className="text-xs text-text-muted">{availability(preset)}</p></div>
                <Button variant="ghost" size="sm" aria-label={`Delete preset ${preset.name}`} disabled={busy} onClick={() => setDeleting(preset)}><Trash2 className="h-4 w-4 text-status-error" /></Button>
              </li>
            ))}
          </ul>
        </ModalBody>
      </Modal>
      <ConfirmDialog isOpen={deleting !== null} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete this preset?" description={`Delete “${deleting?.name ?? ''}” for this workspace? Templates and existing batches are not changed.`} confirmLabel="Delete preset" isLoading={busy} />
    </div>
  );
}
