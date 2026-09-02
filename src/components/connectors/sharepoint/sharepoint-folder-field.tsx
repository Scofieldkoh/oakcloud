'use client';

import { ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SharePointFolderPickerValue } from './sharepoint-folder-picker';

export function SharePointFolderField({ label, value, onSelect, onClear, disabled = false }: { label: string; value?: SharePointFolderPickerValue | null; onSelect: () => void; onClear?: () => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-text-secondary">{label}</div>
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border-primary bg-background-primary p-3">
          <div className="min-w-0 flex-1">
            <a
              href={value.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in SharePoint"
              aria-label={`Open ${value.name} in SharePoint`}
              className="inline-flex min-h-10 max-w-full items-center gap-1 truncate text-sm font-medium text-oak-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-oak-primary/30"
            >
              <span className="truncate">{value.name}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a>
          </div>
          {onClear && <Button variant="ghost" size="sm" iconOnly aria-label={`Clear ${label}`} onClick={onClear} disabled={disabled} leftIcon={<X className="h-4 w-4" />} />}
          <Button variant="secondary" size="sm" onClick={onSelect} disabled={disabled}>{value ? 'Change' : 'Select'}</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={onSelect} disabled={disabled}>Select folder</Button>
      )}
    </div>
  );
}
