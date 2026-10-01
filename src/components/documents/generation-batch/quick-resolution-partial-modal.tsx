'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { partialKeys, saveWordPartial } from '@/hooks/use-template-partials';
import { buildOakDocFromHtml } from '@/lib/document-editor/oakdoc-html-import';
import { OAKDOC_MIME_TYPE } from '@/lib/document-editor/oakdoc-template';
import { customResolutionParagraphs } from '@/lib/resolution-composition';
import { cn } from '@/lib/utils';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A partial name from its display name: letters, digits and hyphens, starting with a letter. */
export function partialNameFromDisplayName(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return /^[a-z]/.test(slug) ? slug : `resolution-${slug || 'partial'}`;
}

/** Plain resolution text as Word partial bytes: a blank line starts a new paragraph. */
export function resolutionPartialBytes(text: string): Uint8Array {
  const html = customResolutionParagraphs(text)
    .map((lines) => `<p style="text-align: justify">${lines.map(escapeHtml).join('<br>')}</p>`)
    .join('');
  return buildOakDocFromHtml(html).bytes;
}

function resolutionPartialFile(name: string, text: string): File {
  const bytes = resolutionPartialBytes(text);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], `${name}.docx`, { type: OAKDOC_MIME_TYPE });
}

export interface QuickResolutionPartialModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the new partial so it can be added to the resolutions. */
  onCreated: (partial: { id: string; name: string; displayName: string | null }) => void;
}

/** Create a Resolutions partial from plain text without leaving Configure. */
export function QuickResolutionPartialModal({ isOpen, onClose, onCreated }: QuickResolutionPartialModalProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const canSave = displayName.trim().length > 0 && customResolutionParagraphs(text).length > 0;

  const close = () => {
    if (busy) return;
    setDisplayName('');
    setText('');
    onClose();
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const name = partialNameFromDisplayName(displayName);
      const saved = await saveWordPartial({
        name,
        displayName: displayName.trim(),
        category: 'RESOLUTION',
        file: resolutionPartialFile(name, text),
      });
      await queryClient.invalidateQueries({ queryKey: partialKeys.all });
      success(`Created partial "${displayName.trim()}"`);
      onCreated({ id: saved.id, name: saved.name, displayName: saved.displayName });
      setDisplayName('');
      setText('');
      onClose();
    } catch (caught) {
      showError(caught instanceof Error ? caught.message : 'Could not create the partial');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="lg"
      title="New resolution partial"
      description="Saved under Partials as a Resolutions partial and added to this list. Open it on the Partials page later to add formatting or fields."
    >
      <ModalBody>
        <div className="space-y-4">
          <FormInput
            label="Name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Appointment of Secretary"
            hint="Also the default heading, in capitals."
            maxLength={200}
            required
          />
          <label className="block">
            <span className="text-sm font-medium text-text-primary">Resolution text</span>
            <span className="ml-1 text-status-error" aria-hidden="true">*</span>
            <textarea
              value={text}
              rows={8}
              onChange={(event) => setText(event.target.value)}
              maxLength={20000}
              placeholder="RESOLVED that ..."
              aria-label="New partial text"
              className={cn(
                'mt-1 w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary',
                'focus:border-oak-primary focus:outline-none focus:ring-2 focus:ring-oak-primary/30',
              )}
            />
            <span className="mt-1 block text-xs text-text-muted">A blank line starts a new paragraph.</span>
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} isLoading={busy} disabled={!canSave}>
          Create partial
        </Button>
      </ModalFooter>
    </Modal>
  );
}
