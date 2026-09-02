'use client';

import { useContext, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { FormInput } from '@/components/ui/form-input';
import { Button } from '@/components/ui/button';
import { useConnectors } from '@/hooks/use-connectors';
import { useSharePointFilingSettings } from '@/hooks/use-sharepoint-folders';
import { SharePointFolderPicker, type SharePointFolderPickerValue } from '@/components/connectors/sharepoint/sharepoint-folder-picker';

export type PendingSharePointSelection =
  | { kind: 'unmapped' }
  | { kind: 'selected'; connectorId: string; folder: SharePointFolderPickerValue }
  | { kind: 'requested'; connectorId: string; name: string };

export function CompanyCreateSharePointField({ onChange }: { onChange: (selection: PendingSharePointSelection) => void }) {
  const queryClient = useContext(QueryClientContext);
  if (!queryClient) return null;
  return <CompanyCreateSharePointFieldWithQuery onChange={onChange} />;
}

function CompanyCreateSharePointFieldWithQuery({ onChange }: { onChange: (selection: PendingSharePointSelection) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [requestedName, setRequestedName] = useState('');
  const [selection, setSelection] = useState<PendingSharePointSelection>({ kind: 'unmapped' });
  const connectorsQuery = useConnectors({ provider: 'SHAREPOINT', isEnabled: true, includeSystem: false, limit: 100 });
  const connector = connectorsQuery.data?.connectors.find((item) => item.workspaceId);
  const settingsQuery = useSharePointFilingSettings(connector?.id);
  const settings = settingsQuery.data as { clientDocumentsRoot?: SharePointFolderPickerValue | null } | undefined;
  const update = (next: PendingSharePointSelection) => { setSelection(next); onChange(next); };
  return <section className="space-y-3 rounded-lg border border-border-primary bg-background-secondary p-4">
    <div>
      <h3 className="text-sm font-semibold text-text-primary">SharePoint company folder (optional)</h3>
      <p className="mt-1 text-xs text-text-secondary">This is saved after the company is created. A failure here will not roll back the company.</p>
    </div>
    {selection.kind === 'selected' ? (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-background-primary p-3 text-sm">
        <span className="truncate text-text-primary">{selection.folder.name}</span>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>Change</Button>
          <Button variant="ghost" size="sm" onClick={() => update({ kind: 'unmapped' })}>Clear</Button>
        </div>
      </div>
    ) : <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)} disabled={!connector?.id || !settings?.clientDocumentsRoot}>Select existing folder</Button>}
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <FormInput label="Or request a new folder" value={requestedName} onChange={(event) => setRequestedName(event.target.value)} placeholder="Company folder name" inputSize="md" />
      <Button variant="ghost" size="sm" onClick={() => requestedName.trim() && connector && update({ kind: 'requested', connectorId: connector.id, name: requestedName.trim() })} disabled={!requestedName.trim() || !connector}>Use new folder</Button>
    </div>
    {selection.kind === 'requested' && <div className="flex items-center justify-between gap-2 text-xs text-text-secondary"><span>New folder “{selection.name}” will be created under Client Documents after save.</span><Button variant="ghost" size="xs" onClick={() => update({ kind: 'unmapped' })}>Clear</Button></div>}
    <SharePointFolderPicker isOpen={pickerOpen} onCancel={() => setPickerOpen(false)} connectorId={connector?.id ?? ''} mode="client-folder" fixedRoot={settings?.clientDocumentsRoot} onConfirm={(folder) => { update({ kind: 'selected', connectorId: connector!.id, folder }); setPickerOpen(false); }} />
  </section>;
}
