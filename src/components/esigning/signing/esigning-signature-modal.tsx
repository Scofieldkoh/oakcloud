'use client';

import { useState } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/forms/signature-pad';

interface EsigningSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdopt: (result: { dataUrl: string; applyToAll: boolean }) => void;
  mode: 'SIGNATURE' | 'INITIALS';
  recipientName: string;
  existingSignature?: string | null;
  isSubmitting?: boolean;
}

type ActiveTab = 'draw' | 'type';

function textToDataUrl(text: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, 400, 120);
  ctx.fillStyle = '#111827';
  ctx.font = 'italic 48px cursive';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 60);
  return canvas.toDataURL('image/png');
}

export function EsigningSignatureModal({
  isOpen,
  onClose,
  onAdopt,
  mode,
  recipientName,
  existingSignature,
  isSubmitting = false,
}: EsigningSignatureModalProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('draw');
  const [drawDataUrl, setDrawDataUrl] = useState<string>(existingSignature ?? '');
  const [typedText, setTypedText] = useState('');
  const [applyToAll, setApplyToAll] = useState(true);

  const isSignature = mode === 'SIGNATURE';
  const title = isSignature ? 'Adopt Your Signature' : 'Adopt Your Initials';
  const fieldLabel = isSignature ? 'Signature' : 'Initials';

  const currentDataUrl = activeTab === 'draw' ? drawDataUrl : (typedText.trim() ? textToDataUrl(typedText.trim()) : '');
  const canAdopt = currentDataUrl.length > 0;

  function handleAdopt() {
    if (!canAdopt) return;
    onAdopt({ dataUrl: currentDataUrl, applyToAll });
    // Reset for next open
    setDrawDataUrl('');
    setTypedText('');
    setApplyToAll(true);
    setActiveTab('draw');
  }

  function handleClose() {
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="2xl">
      <ModalBody className="space-y-4">
        {/* Full Name display */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Full Name</label>
          <div className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-text-primary">
            {recipientName}
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex rounded-xl border border-border-primary bg-background-tertiary p-1">
          {(['draw', 'type'] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={
                activeTab === tab
                  ? 'flex-1 rounded-lg bg-background-secondary px-4 py-1.5 text-sm font-medium text-text-primary shadow-sm'
                  : 'flex-1 px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary'
              }
            >
              {tab === 'draw' ? 'Draw' : 'Type'}
            </button>
          ))}
        </div>

        {/* Draw tab */}
        {activeTab === 'draw' && (
          <div>
            <p className="mb-2 text-xs text-text-muted">
              Draw your {fieldLabel.toLowerCase()} in the box below.
            </p>
            <SignaturePad
              value={drawDataUrl || undefined}
              onChange={(url) => setDrawDataUrl(url)}
              ariaLabel={`${fieldLabel} draw pad`}
            />
          </div>
        )}

        {/* Type tab */}
        {activeTab === 'type' && (
          <div>
            <p className="mb-2 text-xs text-text-muted">
              Type your {fieldLabel.toLowerCase()} below.
            </p>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={`Type your ${fieldLabel.toLowerCase()}...`}
              className="w-full rounded-lg border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-oak-primary focus:ring-1 focus:ring-oak-primary/30"
            />
            {/* Preview */}
            <div className="mt-3 flex min-h-16 items-center justify-center rounded-lg border border-dashed border-border-primary bg-background-tertiary px-4 py-3">
              {typedText.trim() ? (
                <span
                  style={{ fontFamily: 'cursive', fontSize: '2rem', fontStyle: 'italic', color: '#111827' }}
                >
                  {typedText}
                </span>
              ) : (
                <span className="text-sm text-text-muted italic">Preview will appear here</span>
              )}
            </div>
          </div>
        )}

        {/* Apply to all checkbox */}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-primary accent-oak-primary"
          />
          <span className="text-sm text-text-secondary">
            Apply to all {fieldLabel} fields in this document
          </span>
        </label>

        {/* Legal text */}
        <p className="text-xs text-text-muted leading-relaxed">
          By selecting &ldquo;Adopt and Sign&rdquo;, I agree that the signature and initials will be
          the electronic representation of my signature for all purposes when I use them on
          documents.
        </p>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleAdopt} disabled={!canAdopt || isSubmitting} isLoading={isSubmitting}>
          Adopt and Sign
        </Button>
      </ModalFooter>
    </Modal>
  );
}
