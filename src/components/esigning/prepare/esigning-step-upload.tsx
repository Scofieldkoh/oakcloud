'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, UserPlus, MoreVertical, Pencil, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { EsigningRecipientAccessMode, EsigningRecipientType } from '@/generated/prisma';
import type { EsigningEnvelopeDetailDto, EsigningEnvelopeDocumentDto } from '@/types/esigning';
import type { UpdateEsigningEnvelopeInput } from '@/lib/validations/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';
import { ESIGNING_LIMITS } from '@/lib/validations/esigning';
import {
  ESIGNING_SIGNING_ORDER_LABELS,
  ESIGNING_RECIPIENT_TYPE_LABELS,
  ESIGNING_ACCESS_MODE_LABELS,
  formatEsigningFileSize,
} from '@/components/esigning/esigning-shared';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { CompanySearchableSelect } from '@/components/ui/company-searchable-select';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { EsigningSigningOrder } from '@/generated/prisma';

const RECIPIENT_ACCENT_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316'];

interface EsigningStepUploadProps {
  envelope: EsigningEnvelopeDetailDto;
  currentUser?: { firstName: string; lastName: string; email: string } | null;
  onUpdateSettings: (settings: UpdateEsigningEnvelopeInput) => Promise<void>;
  isUpdating: boolean;
  onUploadDocuments: (files: FileList) => Promise<void>;
  isUploading: boolean;
  onDeleteDocument: (documentId: string) => void;
  onAddRecipient: (data: EsigningRecipientInput) => Promise<void>;
  onEditRecipient: (recipientId: string) => void;
  onRemoveRecipient: (recipientId: string) => void;
  companies: Array<{ id: string; name: string; uen: string }>;
  companiesLoading: boolean;
  onNext: () => void;
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ——— PDF thumbnail canvas ———

function PdfThumbnailCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const pdf = await pdfjs.getDocument(url).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;
        await page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
        if (!cancelled) setIsLoaded(true);
      } catch {
        // thumbnail unavailable
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="flex h-full w-full items-center justify-center bg-background-tertiary">
      {!isLoaded && <FileText className="h-8 w-8 text-text-muted" />}
      <canvas ref={canvasRef} className={cn('max-h-full max-w-full object-contain', !isLoaded && 'hidden')} />
    </div>
  );
}

// ——— Document card ———

function DocumentCard({ doc, canEdit, onDelete }: {
  doc: EsigningEnvelopeDocumentDto;
  canEdit: boolean;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  return (
    <div className="group rounded-xl border border-border-primary bg-background-secondary overflow-hidden">
      <div className="aspect-[3/4] overflow-hidden">
        <PdfThumbnailCanvas url={doc.pdfUrl} />
      </div>
      <div className="flex items-center justify-between gap-1 px-2 py-2 border-t border-border-primary">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-text-primary">{doc.fileName}</div>
          <div className="text-[10px] text-text-muted">{doc.pageCount} pages · {formatEsigningFileSize(doc.fileSize)}</div>
        </div>
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-text-muted hover:bg-background-tertiary hover:text-text-primary"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 bottom-full z-20 mb-1 w-44 rounded-xl border border-border-primary bg-background-secondary py-1 shadow-lg">
              <a
                href={doc.pdfUrl}
                download={doc.fileName}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-background-tertiary"
              >
                Download
              </a>
              <button
                type="button"
                onClick={() => { window.open(doc.pdfUrl, '_blank'); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-background-tertiary"
              >
                View document
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-500 hover:bg-background-tertiary"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ——— Main component ———

const DEFAULT_RECIPIENT_FORM = {
  name: '',
  email: '',
  type: 'SIGNER' as EsigningRecipientType,
  accessMode: 'EMAIL_LINK' as EsigningRecipientAccessMode,
  accessCode: '',
};

export function EsigningStepUpload({
  envelope,
  currentUser,
  onUpdateSettings,
  isUpdating,
  onUploadDocuments,
  isUploading,
  onDeleteDocument,
  onAddRecipient,
  onEditRecipient,
  onRemoveRecipient,
  companies,
  companiesLoading,
  onNext,
}: EsigningStepUploadProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSyncedEnvelopeIdRef = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Settings form local state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [signingOrder, setSigningOrder] = useState<EsigningSigningOrder>('PARALLEL');
  const [expiresAt, setExpiresAt] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);

  // Recipient state
  const [isAddingRecipient, setIsAddingRecipient] = useState(false);
  const [newRecipient, setNewRecipient] = useState(DEFAULT_RECIPIENT_FORM);
  const [selfSignNotice, setSelfSignNotice] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isSequentialOrder = signingOrder === 'SEQUENTIAL';

  // Initialize from envelope
  useEffect(() => {
    const isDifferentEnvelope = lastSyncedEnvelopeIdRef.current !== envelope.id;
    if (isSettingsDirty && !isDifferentEnvelope) {
      return;
    }

    setTitle(envelope.title);
    setMessage(envelope.message ?? '');
    setSigningOrder(envelope.signingOrder);
    setExpiresAt(toDateTimeLocal(envelope.expiresAt));
    setCompanyId(envelope.companyId ?? '');
    setIsSettingsDirty(false);
    lastSyncedEnvelopeIdRef.current = envelope.id;
  }, [envelope, isSettingsDirty]);

  const signerRecipients = envelope.recipients.filter((r) => r.type === 'SIGNER');
  const hasSigner = signerRecipients.length > 0;
  const hasDocument = envelope.documents.length > 0;
  const canProceed = hasDocument && hasSigner;

  async function handleNext() {
    await onUpdateSettings({
      title: title.trim(),
      message: message.trim() || undefined,
      companyId: companyId || null,
      signingOrder,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    setIsSettingsDirty(false);
    onNext();
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void onUploadDocuments(e.dataTransfer.files);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      void onUploadDocuments(e.target.files);
      e.currentTarget.value = '';
    }
  }

  async function handleConfirmNewRecipient() {
    if (
      newRecipient.accessMode === 'EMAIL_WITH_CODE' &&
      newRecipient.accessCode.trim().length < ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH
    ) {
      toast.error(`Access code must be at least ${ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH} characters`);
      return;
    }

    const payload: EsigningRecipientInput = {
      name: newRecipient.name.trim(),
      email: newRecipient.email.trim(),
      type: newRecipient.type,
      signingOrder: null,
      accessMode: newRecipient.accessMode,
      accessCode: newRecipient.accessCode.trim() || undefined,
    };
    await onAddRecipient(payload);
    setNewRecipient(DEFAULT_RECIPIENT_FORM);
    setIsAddingRecipient(false);
  }

  async function handleSelfSign() {
    if (!currentUser) return;
    const normalizedEmail = currentUser.email.trim().toLowerCase();
    const alreadySigner = envelope.recipients.some(
      (recipient) =>
        recipient.type === 'SIGNER' && recipient.email.trim().toLowerCase() === normalizedEmail
    );

    if (alreadySigner) {
      toast.error('You are already listed as a signer on this envelope');
      return;
    }

    const payload: EsigningRecipientInput = {
      name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
      email: currentUser.email,
      type: 'SIGNER',
      signingOrder: null,
      accessMode: 'EMAIL_LINK',
    };
    await onAddRecipient(payload);
    setSelfSignNotice(true);
    setTimeout(() => setSelfSignNotice(false), 3000);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">

      {/* ——— Section 1: Documents ——— */}
      <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Add documents</h2>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
            isDragging
              ? 'border-oak-primary bg-oak-primary/5'
              : 'border-border-primary bg-background-primary hover:border-oak-primary/50 hover:bg-background-tertiary',
          )}
        >
          <Upload className="h-6 w-6 text-text-muted mb-1.5" />
          <p className="text-sm font-medium text-text-primary">
            {isUploading ? 'Uploading…' : 'Drop PDFs here or click to upload'}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            PDF only · max {ESIGNING_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB each
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Document thumbnail grid */}
        {envelope.documents.length > 0 && (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {envelope.documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                canEdit={envelope.canEdit}
                onDelete={() => onDeleteDocument(doc.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ——— Section 2: Recipients ——— */}
      <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Add a recipient</h2>
          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isSequentialOrder}
              onChange={(e) => {
                setSigningOrder(e.target.checked ? 'SEQUENTIAL' : 'PARALLEL');
                setIsSettingsDirty(true);
              }}
              className="rounded border-border-primary"
            />
            Sequential signing order
          </label>
        </div>

        {/* Self-sign row */}
        {currentUser && envelope.canEdit && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSelfSign()}
              className="inline-flex items-center gap-2 rounded-xl border border-border-primary bg-background-primary px-4 py-2 text-sm text-text-primary hover:bg-background-tertiary transition-colors"
            >
              <UserPlus className="h-4 w-4 text-text-muted" />
              I&apos;m signing this document
            </button>
            {selfSignNotice && (
              <span className="text-xs text-green-600">You&apos;ve been added as a signer.</span>
            )}
          </div>
        )}

        {/* Existing recipients */}
        {envelope.recipients.length > 0 && (
          <div className="space-y-2">
            {envelope.recipients.map((recipient, idx) => {
              const accentColor = RECIPIENT_ACCENT_COLORS[idx % RECIPIENT_ACCENT_COLORS.length];
              return (
                <div
                  key={recipient.id}
                  className="flex items-center gap-3 rounded-xl border border-border-primary bg-background-primary px-3 py-2.5 overflow-hidden"
                  style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
                >
                  {isSequentialOrder && (
                    <span
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: accentColor }}
                    >
                      {idx + 1}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{recipient.name}</div>
                    <div className="text-xs text-text-muted truncate">{recipient.email}</div>
                  </div>
                  <span className="flex-shrink-0 rounded-full border border-border-primary px-2 py-0.5 text-[10px] text-text-muted">
                    {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
                  </span>
                  {envelope.canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditRecipient(recipient.id)}
                        className="flex-shrink-0 rounded p-1 text-text-muted hover:bg-background-tertiary hover:text-text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRecipient(recipient.id)}
                        className="flex-shrink-0 rounded p-1 text-text-muted hover:bg-background-tertiary hover:text-rose-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* New recipient inline form */}
        {isAddingRecipient && (
          <div className="rounded-xl border-2 border-dashed border-border-primary bg-background-primary p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput
              placeholder="Full name"
              value={newRecipient.name}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, name: e.target.value }))}
              />
              <FormInput
                type="email"
                placeholder="Email address"
                value={newRecipient.email}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={newRecipient.type}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, type: e.target.value as EsigningRecipientType }))}
                className="h-8 rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary"
              >
                {Object.entries(ESIGNING_RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={newRecipient.accessMode}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, accessMode: e.target.value as EsigningRecipientAccessMode }))}
                className="h-8 rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary"
              >
                {Object.entries(ESIGNING_ACCESS_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => void handleConfirmNewRecipient()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-oak-primary text-white hover:bg-oak-primary/90"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingRecipient(false); setNewRecipient(DEFAULT_RECIPIENT_FORM); }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-primary text-text-muted hover:bg-background-tertiary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            {newRecipient.accessMode === 'EMAIL_WITH_CODE' && (
              <FormInput
                placeholder="Access code (min 4 chars)"
                value={newRecipient.accessCode}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, accessCode: e.target.value }))}
              />
            )}
          </div>
        )}

        {/* Add recipient button */}
        {envelope.canEdit && !isAddingRecipient && (
          <button
            type="button"
            onClick={() => setIsAddingRecipient(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border-primary px-4 py-2 text-sm text-text-muted hover:border-oak-primary/50 hover:text-text-primary transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Add Recipient +
          </button>
        )}
      </section>

      {/* ——— Section 3: Message ——— */}
      <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Add message</h2>

        <FormInput
          label="Subject"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setIsSettingsDirty(true);
          }}
          disabled={!envelope.canEdit}
        />

        <label className="flex flex-col gap-2 text-xs font-medium text-text-secondary">
          <span>Message</span>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setIsSettingsDirty(true);
            }}
            disabled={!envelope.canEdit}
            rows={4}
            className="rounded-xl border border-border-primary bg-background-primary px-3 py-2 text-sm text-text-primary outline-none resize-none focus:border-oak-primary focus:ring-2 focus:ring-oak-primary/30 disabled:opacity-60"
          />
        </label>

        {/* Advanced settings */}
        <details
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          className="rounded-xl border border-border-primary"
        >
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-secondary select-none list-none">
            Advanced settings
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </summary>
          <div className="border-t border-border-primary px-4 py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium text-text-secondary">
                <span>Signing order</span>
                <select
                  value={signingOrder}
                  onChange={(e) => {
                    setSigningOrder(e.target.value as EsigningSigningOrder);
                    setIsSettingsDirty(true);
                  }}
                  disabled={!envelope.canEdit}
                  className="h-8 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary disabled:opacity-60"
                >
                  {Object.entries(ESIGNING_SIGNING_ORDER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-xs font-medium text-text-secondary">
                <span>Expiration</span>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => {
                    setExpiresAt(e.target.value);
                    setIsSettingsDirty(true);
                  }}
                  disabled={!envelope.canEdit}
                  className="h-8 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary disabled:opacity-60"
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-text-secondary">Linked company</span>
              <CompanySearchableSelect
                companies={companies}
                value={companyId}
                onChange={(nextCompanyId) => {
                  setCompanyId(nextCompanyId);
                  setIsSettingsDirty(true);
                }}
                loading={companiesLoading}
                disabled={!envelope.canEdit}
                placeholder="Optional company link"
              />
            </div>
          </div>
        </details>
      </section>

      {/* ——— Bottom bar ——— */}
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border-primary bg-background-secondary px-6 py-3">
        <div className="text-sm text-text-secondary">
          {!canProceed && (
            <span className="text-amber-600">
              {!hasDocument && 'Upload at least one document. '}
              {!hasSigner && 'Add at least one signer.'}
            </span>
          )}
        </div>
        <Button
          onClick={() => void handleNext()}
          isLoading={isUpdating}
          disabled={!canProceed}
        >
          Next: Place Fields →
        </Button>
      </div>
    </div>
  );
}
