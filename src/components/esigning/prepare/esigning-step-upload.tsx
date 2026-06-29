'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, UserPlus, MoreVertical, Pencil, X, Check, ChevronDown, ChevronUp, Mail, Trash2, Plus, Loader2 } from 'lucide-react';
import type { EsigningRecipientAccessMode, EsigningRecipientType } from '@/generated/prisma';
import type { EsigningEnvelopeDetailDto, EsigningEnvelopeDocumentDto, EsigningEnvelopeRecipientDto } from '@/types/esigning';
import type { UpdateEsigningEnvelopeInput } from '@/lib/validations/esigning';
import type { EsigningRecipientInput } from '@/lib/validations/esigning';
import type { PDFPageProxy } from 'pdfjs-dist';
import { ESIGNING_LIMITS } from '@/lib/validations/esigning';
import {
  ESIGNING_RECIPIENT_TYPE_LABELS,
  ESIGNING_ACCESS_MODE_LABELS,
  formatEsigningFileSize,
} from '@/components/esigning/esigning-shared';
import {
  getEsigningUploadAccept,
  isAllowedEsigningUploadFile,
  useEsigningWordUploadAvailability,
} from '@/components/esigning/esigning-upload-files';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { CompanySearchableSelect } from '@/components/ui/company-searchable-select';
import { ContactSearchSelect, type SearchableContact } from '@/components/ui/contact-search-select';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import { useCreateContact } from '@/hooks/use-contacts';
import type { ReorderEsigningRecipientsPayload } from '@/hooks/use-esigning';
import { useActiveWorkspaceId } from '@/components/ui/workspace-selector';
import { cn } from '@/lib/utils';
import type { EsigningSigningOrder } from '@/generated/prisma';

const RECIPIENT_ACCENT_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316'];
const SIGNING_ORDER_CYCLE: EsigningSigningOrder[] = ['PARALLEL', 'SEQUENTIAL', 'MIXED'];
const SIGNING_ORDER_PILL_LABELS: Record<EsigningSigningOrder, string> = {
  PARALLEL: 'Parallel',
  SEQUENTIAL: 'Sequential',
  MIXED: 'Mixed',
};

type PdfThumbnailLib = typeof import('pdfjs-dist');
type PdfThumbnailLoadingTask = ReturnType<PdfThumbnailLib['getDocument']>;
type PdfThumbnailRenderTask = ReturnType<PDFPageProxy['render']>;

let pdfjsThumbnailLib: PdfThumbnailLib | null = null;
let pdfjsThumbnailWorkerInitialized = false;

interface EsigningStepUploadProps {
  envelope: EsigningEnvelopeDetailDto;
  currentUser?: { firstName: string; lastName: string; email: string } | null;
  onUpdateSettings: (settings: UpdateEsigningEnvelopeInput) => Promise<void>;
  isUpdating: boolean;
  onUploadDocuments: (files: FileList) => Promise<void>;
  isUploading: boolean;
  onDeleteDocument: (documentId: string) => void;
  onAddRecipient: (data: EsigningRecipientInput) => Promise<void>;
  onReorderRecipients: (payload: ReorderEsigningRecipientsPayload) => Promise<void>;
  isReorderingRecipients: boolean;
  onEditRecipient: (recipientId: string) => void;
  onRemoveRecipient: (recipientId: string) => void;
  companies: Array<{ id: string; name: string; uen: string }>;
  companiesLoading: boolean;
  onNext: () => void;
  onBack: () => void;
}

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateInputValueToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00`).toISOString();
}

function parseOptionalWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function signerGroupsEqual(left: string[][], right: string[][]): boolean {
  return left.length === right.length && left.every((group, index) => arraysEqual(group, right[index] ?? []));
}

function getNextSigningOrder(current: EsigningSigningOrder): EsigningSigningOrder {
  const currentIndex = SIGNING_ORDER_CYCLE.indexOf(current);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % SIGNING_ORDER_CYCLE.length;
  return SIGNING_ORDER_CYCLE[nextIndex] ?? 'PARALLEL';
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function splitFullName(value: string): { firstName: string; lastName: string | null } {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: '', lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1] ?? null,
  };
}

function buildSignerGroups(
  recipients: EsigningEnvelopeRecipientDto[],
  envelopeSigningOrder: EsigningSigningOrder
): string[][] {
  const orderedRecipients = [...recipients].sort((left, right) => {
    const leftOrder = left.signingOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.signingOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });

  if (envelopeSigningOrder !== 'MIXED') {
    return orderedRecipients.map((recipient) => [recipient.id]);
  }

  const groups = new Map<number, string[]>();

  orderedRecipients.forEach((recipient, index) => {
    const groupOrder = recipient.signingOrder ?? index + 1;
    const existing = groups.get(groupOrder) ?? [];
    existing.push(recipient.id);
    groups.set(groupOrder, existing);
  });

  return [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, recipientIds]) => recipientIds);
}

function reconcileSignerGroups(groups: string[][], signerIds: string[]): string[][] {
  const signerIdSet = new Set(signerIds);
  const seen = new Set<string>();
  const nextGroups = groups
    .map((group) =>
      group.filter((recipientId) => {
        if (!signerIdSet.has(recipientId) || seen.has(recipientId)) {
          return false;
        }
        seen.add(recipientId);
        return true;
      })
    )
    .filter((group) => group.length > 0);

  const missingGroups = signerIds
    .filter((recipientId) => !seen.has(recipientId))
    .map((recipientId) => [recipientId]);

  return [...nextGroups, ...missingGroups];
}

function flattenSignerGroups(groups: string[][]): string[] {
  return groups.flat();
}

function buildReorderRecipientsPayload(
  groups: string[][],
  signingOrder: EsigningSigningOrder
): ReorderEsigningRecipientsPayload {
  if (signingOrder === 'SEQUENTIAL') {
    return {
      recipients: flattenSignerGroups(groups).map((recipientId, index) => ({
        recipientId,
        signingOrder: index + 1,
      })),
    };
  }

  return {
    recipients: groups.flatMap((group, groupIndex) =>
      group.map((recipientId) => ({
        recipientId,
        signingOrder: groupIndex + 1,
      }))
    ),
  };
}

async function getPdfThumbnailJs() {
  if (pdfjsThumbnailLib && pdfjsThumbnailWorkerInitialized) {
    return pdfjsThumbnailLib;
  }

  const pdfjs = await import('pdfjs-dist');

  if (!pdfjsThumbnailWorkerInitialized) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    pdfjsThumbnailWorkerInitialized = true;
  }

  pdfjsThumbnailLib = pdfjs;
  return pdfjs;
}

// ——— PDF thumbnail canvas ———

function PdfThumbnailCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfThumbnailLoadingTask | null = null;
    let renderTask: PdfThumbnailRenderTask | null = null;

    async function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setIsLoaded(false);

      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF thumbnail source (${response.status})`);
        }

        const pdfBytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;

        const pdfjs = await getPdfThumbnailJs();
        loadingTask = pdfjs.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        renderTask = page.render({ canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]);
        await renderTask.promise;
        if (!cancelled) setIsLoaded(true);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to render e-signing thumbnail', error);
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
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


function RecipientRow({
  recipient,
  index,
  accentColor,
  canEdit,
  showIndex,
  onEdit,
  onRemove,
}: {
  recipient: EsigningEnvelopeRecipientDto;
  index: number;
  accentColor: string;
  canEdit: boolean;
  showIndex: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border-primary bg-background-primary px-3 py-2.5 overflow-hidden"
      style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
    >
      {showIndex && (
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: accentColor }}
        >
          {index + 1}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{recipient.name}</div>
        <div className="text-xs text-text-muted truncate">{recipient.email}</div>
      </div>
      <span className="flex-shrink-0 rounded-full border border-border-primary px-2 py-0.5 text-[10px] text-text-muted">
        {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
      </span>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${recipient.name}`}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-background-tertiary hover:text-text-primary sm:h-8 sm:w-8"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${recipient.name}`}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-background-tertiary hover:text-rose-500 sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      )}
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
  onReorderRecipients,
  isReorderingRecipients,
  onEditRecipient,
  onRemoveRecipient,
  companies,
  companiesLoading,
  onNext,
  onBack,
}: EsigningStepUploadProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const createContactMutation = useCreateContact();
  const { data: session } = useSession();
  const activeTenantId = useActiveWorkspaceId(session?.isSuperAdmin ?? false, session?.tenantId);
  const wordUploadEnabled = useEsigningWordUploadAvailability(activeTenantId);
  const uploadAccept = getEsigningUploadAccept(wordUploadEnabled);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSyncedEnvelopeIdRef = useRef<string | null>(null);
  const persistedSignerGroupsRef = useRef<string[][]>([]);
  const signerRecipientIdsRef = useRef<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Settings form local state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [signingOrder, setSigningOrder] = useState<EsigningSigningOrder>('PARALLEL');
  const [expiresAt, setExpiresAt] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [reminderFrequencyDays, setReminderFrequencyDays] = useState('');
  const [reminderStartDays, setReminderStartDays] = useState('');
  const [expiryWarningDays, setExpiryWarningDays] = useState('');
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);

  // Recipient state
  const [isAddingRecipient, setIsAddingRecipient] = useState(false);
  const [newRecipient, setNewRecipient] = useState(DEFAULT_RECIPIENT_FORM);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedContact, setSelectedContact] = useState<SearchableContact | null>(null);
  const [selectedContactDefaultEmailDetailId, setSelectedContactDefaultEmailDetailId] = useState<string | null>(null);
  const [isSavingContactEmail, setIsSavingContactEmail] = useState(false);
  const [selfSignNotice, setSelfSignNotice] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [pendingSignerGroups, setPendingSignerGroups] = useState<string[][]>([]);
  const usesOrderedSigning = signingOrder !== 'PARALLEL';

  // Initialize from envelope
  useEffect(() => {
    const isDifferentEnvelope = lastSyncedEnvelopeIdRef.current !== envelope.id;
    if (isSettingsDirty && !isDifferentEnvelope) {
      return;
    }

    setTitle(envelope.title);
    setMessage(envelope.message ?? '');
    setSigningOrder(envelope.signingOrder);
    setExpiresAt(toDateInputValue(envelope.expiresAt));
    setCompanyId(envelope.companyId ?? '');
    setReminderFrequencyDays(envelope.reminderFrequencyDays?.toString() ?? '');
    setReminderStartDays(envelope.reminderStartDays?.toString() ?? '');
    setExpiryWarningDays(envelope.expiryWarningDays?.toString() ?? '');
    setIsSettingsDirty(false);
    lastSyncedEnvelopeIdRef.current = envelope.id;
  }, [envelope, isSettingsDirty]);

  const signerRecipients = useMemo(
    () => envelope.recipients.filter((recipient) => recipient.type === 'SIGNER'),
    [envelope.recipients]
  );
  const signerRecipientIds = useMemo(
    () => signerRecipients.map((recipient) => recipient.id),
    [signerRecipients]
  );
  const persistedSignerGroups = useMemo(
    () => buildSignerGroups(signerRecipients, envelope.signingOrder),
    [envelope.signingOrder, signerRecipients]
  );
  const reconciledPendingSignerGroups = useMemo(
    () => reconcileSignerGroups(pendingSignerGroups, signerRecipientIds),
    [pendingSignerGroups, signerRecipientIds]
  );
  const orderedSignerRecipients = useMemo(() => {
    const signerMap = new Map(signerRecipients.map((recipient) => [recipient.id, recipient]));
    const ordered = flattenSignerGroups(reconciledPendingSignerGroups)
      .map((recipientId) => signerMap.get(recipientId))
      .filter((recipient): recipient is EsigningEnvelopeRecipientDto => Boolean(recipient));
    const remaining = signerRecipients.filter((recipient) => !ordered.some((entry) => entry.id === recipient.id));
    return [...ordered, ...remaining];
  }, [reconciledPendingSignerGroups, signerRecipients]);
  const mixedSignerGroups = useMemo(() => {
    const signerMap = new Map(signerRecipients.map((recipient) => [recipient.id, recipient]));

    return reconciledPendingSignerGroups.map((group, groupIndex) => ({
      groupIndex,
      recipientIds: group,
      recipients: group
        .map((recipientId) => signerMap.get(recipientId))
        .filter((recipient): recipient is EsigningEnvelopeRecipientDto => Boolean(recipient)),
    }));
  }, [reconciledPendingSignerGroups, signerRecipients]);
  const ccRecipients = useMemo(
    () => envelope.recipients.filter((recipient) => recipient.type === 'CC'),
    [envelope.recipients]
  );
  const hasSigner = signerRecipients.length > 0;
  const hasDocument = envelope.documents.length > 0;
  const canProceed = hasDocument && hasSigner;
  const signerStructureSignature = useMemo(
    () =>
      `${envelope.signingOrder}:${signerRecipients
        .map((recipient) => `${recipient.id}:${recipient.signingOrder ?? 'null'}`)
        .join('|')}`,
    [envelope.signingOrder, signerRecipients]
  );
  persistedSignerGroupsRef.current = persistedSignerGroups;
  signerRecipientIdsRef.current = signerRecipientIds;

  useEffect(() => {
    setPendingSignerGroups((current) => {
      const latestPersistedSignerGroups = persistedSignerGroupsRef.current;
      const latestSignerRecipientIds = signerRecipientIdsRef.current;

      if (current.length === 0) {
        return signerGroupsEqual(current, latestPersistedSignerGroups)
          ? current
          : latestPersistedSignerGroups;
      }

      const next = reconcileSignerGroups(current, latestSignerRecipientIds);
      return signerGroupsEqual(next, current) ? current : next;
    });
  }, [signerStructureSignature]);

  async function persistSignerGroups(groups: string[][]) {
    if (signingOrder === 'PARALLEL') {
      return;
    }

    if (envelope.signingOrder !== signingOrder) {
      return;
    }

    const nextPayload = buildReorderRecipientsPayload(groups, signingOrder);
    const persistedPayload = buildReorderRecipientsPayload(persistedSignerGroups, envelope.signingOrder);

    if (JSON.stringify(nextPayload) === JSON.stringify(persistedPayload)) {
      return;
    }

    await onReorderRecipients(nextPayload);
  }

  async function handleNext() {
    await onUpdateSettings({
      title: title.trim(),
      message: message.trim() || undefined,
      companyId: companyId || null,
      signingOrder,
      expiresAt: dateInputValueToIso(expiresAt),
      reminderFrequencyDays: parseOptionalWholeNumber(reminderFrequencyDays),
      reminderStartDays: parseOptionalWholeNumber(reminderStartDays),
      expiryWarningDays: parseOptionalWholeNumber(expiryWarningDays),
    });
    setIsSettingsDirty(false);
    if (
      signingOrder !== 'PARALLEL' &&
      orderedSignerRecipients.length > 0 &&
      (envelope.signingOrder !== signingOrder || !signerGroupsEqual(reconciledPendingSignerGroups, persistedSignerGroups))
    ) {
      await onReorderRecipients(buildReorderRecipientsPayload(reconciledPendingSignerGroups, signingOrder));
    }
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
      if (!validateUploadFiles(e.dataTransfer.files)) {
        return;
      }
      void onUploadDocuments(e.dataTransfer.files);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      if (!validateUploadFiles(e.target.files)) {
        e.currentTarget.value = '';
        return;
      }
      void onUploadDocuments(e.target.files);
      e.currentTarget.value = '';
    }
  }

  function validateUploadFiles(files: FileList): boolean {
    const invalidFile = Array.from(files).find(
      (file) => !isAllowedEsigningUploadFile(file, { wordUploadEnabled })
    );

    if (!invalidFile) {
      return true;
    }

    toast.error(
      wordUploadEnabled
        ? 'Upload a PDF, DOCX, or DOC document.'
        : 'Word upload requires a valid SharePoint or OneDrive connector. Upload a PDF instead.'
    );
    return false;
  }

  async function moveSequentialSigner(recipientId: string, direction: -1 | 1) {
    const flat = flattenSignerGroups(reconciledPendingSignerGroups);
    const currentIndex = flat.indexOf(recipientId);
    const targetIndex = currentIndex + direction;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= flat.length) return;
    const nextOrder = arrayMove(flat, currentIndex, targetIndex);
    const nextGroups = nextOrder.map((id) => [id]);
    const previousGroups = reconciledPendingSignerGroups;
    setPendingSignerGroups(nextGroups);
    try {
      await persistSignerGroups(nextGroups);
    } catch (error) {
      setPendingSignerGroups(previousGroups);
      toast.error(error instanceof Error ? error.message : 'Failed to reorder signers');
    }
  }

async function applyMixedGroupChange(
    updater: (groups: string[][]) => string[][],
    fallbackMessage: string
  ) {
    const previousGroups = reconciledPendingSignerGroups;
    const nextGroups = reconcileSignerGroups(updater(previousGroups), signerRecipientIds);

    if (signerGroupsEqual(previousGroups, nextGroups)) {
      return;
    }

    setPendingSignerGroups(nextGroups);

    try {
      await persistSignerGroups(nextGroups);
    } catch (error) {
      setPendingSignerGroups(previousGroups);
      toast.error(error instanceof Error ? error.message : fallbackMessage);
    }
  }

  function moveGroup(groups: string[][], groupIndex: number, direction: -1 | 1): string[][] {
    const targetIndex = groupIndex + direction;
    if (targetIndex < 0 || targetIndex >= groups.length) {
      return groups;
    }

    const nextGroups = [...groups];
    [nextGroups[groupIndex], nextGroups[targetIndex]] = [nextGroups[targetIndex] ?? [], nextGroups[groupIndex] ?? []];
    return nextGroups;
  }

  function mergeGroup(groups: string[][], groupIndex: number): string[][] {
    if (groups.length <= 1) {
      return groups;
    }

    const nextGroups = groups.map((group) => [...group]);
    const group = nextGroups[groupIndex];
    if (!group || group.length === 0) {
      return nextGroups.filter((_, index) => index !== groupIndex);
    }

    const targetIndex = groupIndex > 0 ? groupIndex - 1 : 1;
    nextGroups[targetIndex] = [...(nextGroups[targetIndex] ?? []), ...group];
    return nextGroups.filter((_, index) => index !== groupIndex);
  }

  function moveSignerToAdjacentGroup(
    groups: string[][],
    groupIndex: number,
    recipientId: string,
    direction: -1 | 1
  ): string[][] {
    const targetIndex = groupIndex + direction;
    if (targetIndex < 0 || targetIndex >= groups.length) {
      return groups;
    }

    const nextGroups = groups.map((group) => [...group]);
    nextGroups[groupIndex] = nextGroups[groupIndex]?.filter((id) => id !== recipientId) ?? [];
    nextGroups[targetIndex] = [...(nextGroups[targetIndex] ?? []), recipientId];
    return nextGroups.filter((group) => group.length > 0);
  }

  function splitSignerIntoOwnGroup(
    groups: string[][],
    groupIndex: number,
    recipientId: string
  ): string[][] {
    const group = groups[groupIndex] ?? [];
    if (group.length <= 1) {
      return groups;
    }

    const nextGroups = groups.map((entry) => [...entry]);
    nextGroups[groupIndex] = nextGroups[groupIndex]?.filter((id) => id !== recipientId) ?? [];
    nextGroups.splice(groupIndex + 1, 0, [recipientId]);
    return nextGroups.filter((entry) => entry.length > 0);
  }

  function handleCycleSigningOrder() {
    if (!envelope.canEdit) {
      return;
    }

    setSigningOrder((current) => getNextSigningOrder(current));
    setIsSettingsDirty(true);
  }

  function resetRecipientDraft() {
    setNewRecipient(DEFAULT_RECIPIENT_FORM);
    setSelectedContactId('');
    setSelectedContact(null);
    setSelectedContactDefaultEmailDetailId(null);
  }

  async function handleConfirmNewRecipient() {
    if (!newRecipient.name.trim()) {
      toast.error('Recipient name is required');
      return;
    }

    if (!newRecipient.email.trim()) {
      toast.error('Recipient email is required');
      return;
    }

    if (
      newRecipient.accessMode === 'EMAIL_WITH_CODE' &&
      newRecipient.accessCode.trim().length < ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH
    ) {
      toast.error(`Access code must be at least ${ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH} characters`);
      return;
    }

    const normalizedEmail = normalizeEmail(newRecipient.email);
    const isDuplicateSigner =
      newRecipient.type === 'SIGNER' &&
      envelope.recipients.some(
        (recipient) => recipient.type === 'SIGNER' && normalizeEmail(recipient.email) === normalizedEmail
      );

    if (isDuplicateSigner) {
      toast.error(`${newRecipient.email.trim()} is already listed as a signer on this envelope`);
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
    try {
      await onAddRecipient(payload);
      resetRecipientDraft();
      setIsAddingRecipient(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add recipient');
    }
  }

  async function handleSelfSign() {
    if (!currentUser) return;
    const normalizedEmail = normalizeEmail(currentUser.email);
    const alreadySigner = envelope.recipients.some(
      (recipient) => recipient.type === 'SIGNER' && normalizeEmail(recipient.email) === normalizedEmail
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

  function handleContactSelect(contactId: string, contact: SearchableContact | null) {
    setSelectedContactId(contactId);
    setSelectedContact(contact);
    setSelectedContactDefaultEmailDetailId(null);

    if (!contact) {
      return;
    }

    setNewRecipient((prev) => ({
      ...prev,
      name: contact.fullName || prev.name,
      email: contact.defaultEmail || prev.email,
    }));

    if (!contact.defaultEmail) {
      toast.error('This contact does not have a default email. Add one in Contacts or enter it manually.');
    }

    const groupedUrl = activeTenantId
      ? `/api/contacts/${contactId}/contact-details?grouped=true&tenantId=${encodeURIComponent(activeTenantId)}`
      : `/api/contacts/${contactId}/contact-details?grouped=true`;

    void fetch(groupedUrl, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch contact details');
        }

        return response.json() as Promise<{
          defaultDetails?: Array<{ id: string; detailType: string; value: string }>;
        }>;
      })
      .then((data) => {
        const defaultEmailDetail = data.defaultDetails?.find((detail) => detail.detailType === 'EMAIL') ?? null;
        setSelectedContactDefaultEmailDetailId(defaultEmailDetail?.id ?? null);
        if (defaultEmailDetail?.value) {
          setSelectedContact((prev) => (prev ? { ...prev, defaultEmail: defaultEmailDetail.value } : prev));
          setNewRecipient((prev) => ({
            ...prev,
            email: defaultEmailDetail.value || prev.email,
          }));
        }
      })
      .catch(() => {
        // Keep the recipient form usable even if contact detail lookup fails.
      });
  }

  async function handleSaveContactEmail() {
    if (!selectedContactId) {
      toast.error('Select a contact first');
      return;
    }

    const nextEmail = newRecipient.email.trim();
    if (!isValidEmail(nextEmail)) {
      toast.error('Enter a valid email address before saving it to the contact');
      return;
    }

    setIsSavingContactEmail(true);
    try {
      const url = selectedContactDefaultEmailDetailId
        ? `/api/contacts/${selectedContactId}/contact-details/${selectedContactDefaultEmailDetailId}`
        : `/api/contacts/${selectedContactId}/contact-details`;
      const payload = selectedContactDefaultEmailDetailId
        ? { value: nextEmail, isPrimary: true, tenantId: activeTenantId }
        : { detailType: 'EMAIL', value: nextEmail, isPrimary: true, purposes: [], tenantId: activeTenantId };

      const response = await fetch(url, {
        method: selectedContactDefaultEmailDetailId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save contact email');
      }

      if (!selectedContactDefaultEmailDetailId && typeof data.id === 'string') {
        setSelectedContactDefaultEmailDetailId(data.id);
      }

      setSelectedContact((prev) => (prev ? { ...prev, defaultEmail: nextEmail } : prev));
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['contact', selectedContactId] });
      toast.success('Default email saved to contact');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save contact email');
    } finally {
      setIsSavingContactEmail(false);
    }
  }

  async function handleQuickAddContact() {
    const contactName = newRecipient.name.trim();
    const contactEmail = newRecipient.email.trim();

    if (!contactName) {
      toast.error('Enter the signer name before creating a contact');
      return;
    }

    if (!isValidEmail(contactEmail)) {
      toast.error('Enter a valid signer email before creating a contact');
      return;
    }

    if (session?.isSuperAdmin && !activeTenantId) {
      toast.error('Workspace context is required before creating a contact');
      return;
    }

    const { firstName, lastName } = splitFullName(contactName);
    if (!firstName) {
      toast.error('Enter the signer name before creating a contact');
      return;
    }

    try {
      const createdContact = await createContactMutation.mutateAsync({
        contactType: 'INDIVIDUAL',
        firstName,
        lastName,
        contactDetails: [
          {
            detailType: 'EMAIL',
            value: contactEmail,
            isPrimary: true,
            purposes: [],
          },
        ],
        tenantId: activeTenantId || undefined,
      });

      handleContactSelect(createdContact.id, {
        ...createdContact,
        defaultEmail: contactEmail,
        defaultPhone: null,
      });
      toast.success('Contact created and selected for this signer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create contact');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-4 sm:p-6 sm:space-y-6">

      {/* ——— Section 1: Documents ——— */}
      <section className="rounded-2xl border border-border-primary bg-background-secondary p-4 shadow-sm space-y-4 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-primary">
            {envelope.documents.length > 0
              ? `Documents (${envelope.documents.length})`
              : 'Add documents'}
          </h2>
          {envelope.documents.length > 0 && envelope.canEdit && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-primary bg-background-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-background-tertiary transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Add more
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
            isUploading
              ? 'cursor-wait border-oak-primary bg-oak-primary/5'
              : isDragging
                ? 'cursor-copy border-oak-primary bg-oak-primary/5'
                : 'cursor-pointer border-border-primary bg-background-primary hover:border-oak-primary/50 hover:bg-background-tertiary',
          )}
        >
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-oak-primary mb-1.5" />
          ) : (
            <Upload className="h-6 w-6 text-text-muted mb-1.5" />
          )}
          <p className="text-sm font-medium text-text-primary">
            {isUploading
              ? 'Uploading...'
              : isDragging
                ? 'Release to upload'
                : wordUploadEnabled
                  ? 'Drop PDF or Word documents here'
                  : 'Drop PDF documents here'}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {wordUploadEnabled ? 'PDF, DOCX, or DOC' : 'PDF only'} - max {ESIGNING_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB each
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={uploadAccept}
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
      <section className="rounded-2xl border border-border-primary bg-background-secondary p-4 shadow-sm space-y-4 sm:rounded-3xl sm:p-6">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {envelope.recipients.length > 0 ? 'Recipients' : 'Add recipients'}
          </h2>
          {envelope.canEdit && (
            <div className="flex flex-col items-start gap-1 sm:items-end sm:text-right">
              <button
                type="button"
                onClick={handleCycleSigningOrder}
                title="Click to cycle signing order: Parallel → Sequential → Mixed"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-80 active:scale-95',
                  signingOrder === 'PARALLEL' && 'border-border-primary bg-background-primary text-text-secondary',
                  signingOrder === 'SEQUENTIAL' && 'border-oak-primary/20 bg-oak-primary/10 text-oak-primary',
                  signingOrder === 'MIXED' && 'border-amber-300 bg-amber-50 text-amber-700'
                )}
              >
                <span className="opacity-60">Order:</span> {SIGNING_ORDER_PILL_LABELS[signingOrder]}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
              <span className="text-[11px] text-text-muted">
                Click to change signing order
              </span>
            </div>
          )}
        </div>

        {/* Self-sign row — hidden if user is already a signer */}
        {currentUser && envelope.canEdit && !envelope.recipients.some(
          (r) => r.type === 'SIGNER' && normalizeEmail(r.email) === normalizeEmail(currentUser.email)
        ) && (
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
          <div className="space-y-4">
            {orderedSignerRecipients.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">Signers</h3>
                    {usesOrderedSigning ? (
                      <p className="text-xs text-text-muted">
                        {signingOrder === 'MIXED'
                          ? 'Mixed routing sends each group in sequence. Signers inside the same group sign in parallel, and you can move people between waves below.'
                          : 'Use Earlier / Later to set the signing sequence.'}
                        {signingOrder === 'MIXED'
                          ? ' Group mode is fixed to parallel inside each wave.'
                          : envelope.signingOrder === 'PARALLEL'
                            ? ' Your order will be saved when you continue.'
                            : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted">Switch routing to Sequential or Mixed to control signer order.</p>
                    )}
                  </div>
                  {isReorderingRecipients && (
                    <span className="text-xs text-text-muted">Saving order…</span>
                  )}
                </div>

                {signingOrder === 'MIXED' ? (
                  <div className="space-y-3">
                    {mixedSignerGroups.map((group) => (
                      <div
                        key={`mixed-group-${group.groupIndex}`}
                        className="rounded-2xl border border-border-primary bg-background-primary p-3 space-y-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-semibold text-text-primary">Group {group.groupIndex + 1}</h4>
                              <span className="rounded-full border border-oak-primary/20 bg-oak-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-oak-primary">
                                Parallel within group
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-text-muted">
                              This wave is sent together. Use the actions below to merge, split, or move the wave.
                            </p>
                          </div>
                          {envelope.canEdit && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Move earlier / later — grouped icon pair with shared affordance */}
                              <div className="inline-flex overflow-hidden rounded-lg border border-border-primary">
                                <button
                                  type="button"
                                  aria-label="Move group earlier"
                                  onClick={() => {
                                    void applyMixedGroupChange(
                                      (groups) => moveGroup(groups, group.groupIndex, -1),
                                      'Failed to move group earlier'
                                    );
                                  }}
                                  disabled={isReorderingRecipients || group.groupIndex === 0}
                                  className="inline-flex h-8 min-w-[36px] items-center justify-center border-r border-border-primary bg-background-elevated px-3 text-sm text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                  <span className="ml-1 hidden sm:inline">Earlier</span>
                                </button>
                                <button
                                  type="button"
                                  aria-label="Move group later"
                                  onClick={() => {
                                    void applyMixedGroupChange(
                                      (groups) => moveGroup(groups, group.groupIndex, 1),
                                      'Failed to move group later'
                                    );
                                  }}
                                  disabled={isReorderingRecipients || group.groupIndex === mixedSignerGroups.length - 1}
                                  className="inline-flex h-8 min-w-[36px] items-center justify-center bg-background-elevated px-3 text-sm text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                  <span className="ml-1 hidden sm:inline">Later</span>
                                </button>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                leftIcon={<Trash2 className="h-4 w-4" />}
                                onClick={() => {
                                  void applyMixedGroupChange(
                                    (groups) => mergeGroup(groups, group.groupIndex),
                                    'Failed to remove group'
                                  );
                                }}
                                disabled={isReorderingRecipients || mixedSignerGroups.length <= 1}
                              >
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {group.recipients.map((recipient, recipientIndex) => {
                            const accentColor = RECIPIENT_ACCENT_COLORS[(group.groupIndex + recipientIndex) % RECIPIENT_ACCENT_COLORS.length];

                            return (
                              <div
                                key={recipient.id}
                                className="rounded-xl border border-border-primary bg-background-secondary px-3 py-3"
                              >
                                <div className="flex items-start gap-3">
                                  <span
                                    className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                    style={{ backgroundColor: accentColor }}
                                  >
                                    {group.groupIndex + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-text-primary">{recipient.name}</div>
                                    <div className="truncate text-xs text-text-muted">{recipient.email}</div>
                                  </div>
                                  <span className="flex-shrink-0 rounded-full border border-oak-primary/20 bg-oak-primary/10 px-2 py-0.5 text-[10px] text-oak-primary">
                                    {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
                                  </span>
                                  {envelope.canEdit && (
                                    <div className="flex flex-shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => onEditRecipient(recipient.id)}
                                        aria-label={`Edit ${recipient.name}`}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-background-tertiary hover:text-text-primary sm:h-8 sm:w-8"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onRemoveRecipient(recipient.id)}
                                        aria-label={`Remove ${recipient.name}`}
                                        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-background-tertiary hover:text-rose-500 sm:h-8 sm:w-8"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {envelope.canEdit && (
                                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    {/* Join previous / next — grouped icon pair */}
                                    <div className="inline-flex overflow-hidden rounded-lg border border-border-primary">
                                      <button
                                        type="button"
                                        aria-label="Join previous group"
                                        onClick={() => {
                                          void applyMixedGroupChange(
                                            (groups) => moveSignerToAdjacentGroup(groups, group.groupIndex, recipient.id, -1),
                                            'Failed to move signer to the earlier group'
                                          );
                                        }}
                                        disabled={isReorderingRecipients || group.groupIndex === 0}
                                        className="inline-flex h-8 items-center justify-center gap-1 border-r border-border-primary bg-background-elevated px-3 text-sm text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        <ChevronUp className="h-4 w-4" />
                                        <span>Previous group</span>
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Join next group"
                                        onClick={() => {
                                          void applyMixedGroupChange(
                                            (groups) => moveSignerToAdjacentGroup(groups, group.groupIndex, recipient.id, 1),
                                            'Failed to move signer to the next group'
                                          );
                                        }}
                                        disabled={isReorderingRecipients || group.groupIndex === mixedSignerGroups.length - 1}
                                        className="inline-flex h-8 items-center justify-center gap-1 bg-background-elevated px-3 text-sm text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        <ChevronDown className="h-4 w-4" />
                                        <span>Next group</span>
                                      </button>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      leftIcon={<Plus className="h-4 w-4" />}
                                      onClick={() => {
                                        void applyMixedGroupChange(
                                          (groups) => splitSignerIntoOwnGroup(groups, group.groupIndex, recipient.id),
                                          'Failed to create a new group'
                                        );
                                      }}
                                      disabled={isReorderingRecipients || group.recipientIds.length <= 1}
                                    >
                                      New group
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderedSignerRecipients.map((recipient, idx) => {
                      const accentColor = RECIPIENT_ACCENT_COLORS[idx % RECIPIENT_ACCENT_COLORS.length];
                      return (
                        <div
                          key={recipient.id}
                          className="flex items-center gap-3 rounded-xl border border-border-primary bg-background-primary px-3 py-2.5 overflow-hidden"
                        >
                          <span
                            className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: accentColor }}
                          >
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{recipient.name}</div>
                            <div className="text-xs text-text-muted truncate">{recipient.email}</div>
                          </div>
                          <span className="flex-shrink-0 rounded-full border border-oak-primary/20 bg-oak-primary/10 px-2 py-0.5 text-[10px] text-oak-primary">
                            {ESIGNING_RECIPIENT_TYPE_LABELS[recipient.type]}
                          </span>
                          {envelope.canEdit && signingOrder === 'SEQUENTIAL' && orderedSignerRecipients.length > 1 && (
                            <div className="inline-flex overflow-hidden rounded-lg border border-border-primary flex-shrink-0">
                              <button
                                type="button"
                                aria-label="Move signer up"
                                onClick={() => void moveSequentialSigner(recipient.id, -1)}
                                disabled={isReorderingRecipients || idx === 0}
                                className="inline-flex h-7 items-center gap-0.5 border-r border-border-primary bg-background-elevated px-2 text-xs text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Up</span>
                              </button>
                              <button
                                type="button"
                                aria-label="Move signer down"
                                onClick={() => void moveSequentialSigner(recipient.id, 1)}
                                disabled={isReorderingRecipients || idx === orderedSignerRecipients.length - 1}
                                className="inline-flex h-7 items-center gap-0.5 bg-background-elevated px-2 text-xs text-text-primary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Down</span>
                              </button>
                            </div>
                          )}
                          {envelope.canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditRecipient(recipient.id)}
                                aria-label={`Edit ${recipient.name}`}
                                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-background-tertiary hover:text-text-primary"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveRecipient(recipient.id)}
                                aria-label={`Remove ${recipient.name}`}
                                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-background-tertiary hover:text-rose-500"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {ccRecipients.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-text-primary">Receives copy</h3>
                {ccRecipients.map((recipient, idx) => (
                  <RecipientRow
                    key={recipient.id}
                    recipient={recipient}
                    index={idx}
                    accentColor={RECIPIENT_ACCENT_COLORS[(orderedSignerRecipients.length + idx) % RECIPIENT_ACCENT_COLORS.length]}
                    canEdit={envelope.canEdit}
                    showIndex={false}
                    onEdit={() => onEditRecipient(recipient.id)}
                    onRemove={() => onRemoveRecipient(recipient.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* New recipient inline form */}
        {isAddingRecipient && (
          <div className="rounded-2xl border border-border-primary bg-background-primary p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text-primary">New recipient</h3>
              <button
                type="button"
                onClick={() => { setIsAddingRecipient(false); resetRecipientDraft(); }}
                className="rounded-lg p-1 text-text-muted hover:bg-background-tertiary hover:text-text-primary"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {newRecipient.type === 'SIGNER' && (
              <ContactSearchSelect
                key={`recipient-contact-${selectedContactId || 'empty'}`}
                label="Select from Contacts (optional)"
                value={selectedContactId}
                onChange={handleContactSelect}
                placeholder="Search contacts for signer..."
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormInput
                label="Full name"
                placeholder="e.g. Jane Smith"
                value={newRecipient.name}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, name: e.target.value }))}
              />
              <FormInput
                label="Email address"
                type="email"
                placeholder="e.g. jane@example.com"
                value={newRecipient.email}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
                Role
                <select
                  value={newRecipient.type}
                  onChange={(e) => {
                    const nextType = e.target.value as EsigningRecipientType;
                    setNewRecipient((prev) => ({ ...prev, type: nextType }));
                    if (nextType !== 'SIGNER') {
                      setSelectedContactId('');
                      setSelectedContact(null);
                      setSelectedContactDefaultEmailDetailId(null);
                    }
                  }}
                  className="h-9 rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary"
                >
                  {Object.entries(ESIGNING_RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
                Access method
                <select
                  value={newRecipient.accessMode}
                  onChange={(e) => setNewRecipient((prev) => ({ ...prev, accessMode: e.target.value as EsigningRecipientAccessMode }))}
                  className="h-9 rounded-lg border border-border-primary bg-background-secondary px-3 text-sm text-text-primary"
                >
                  {Object.entries(ESIGNING_ACCESS_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {newRecipient.accessMode === 'EMAIL_WITH_CODE' && (
              <FormInput
                label="Access code"
                placeholder={`Min ${ESIGNING_LIMITS.MIN_ACCESS_CODE_LENGTH} characters`}
                value={newRecipient.accessCode}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, accessCode: e.target.value }))}
              />
            )}

            {newRecipient.type === 'SIGNER' && !selectedContact && (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border-primary bg-background-secondary px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">Save as a contact?</div>
                  <p className="mt-1 text-xs text-text-muted">
                    Quick-add this signer to your contacts using the name and email above.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleQuickAddContact()}
                  isLoading={createContactMutation.isPending}
                  disabled={createContactMutation.isPending}
                >
                  Quick add contact
                </Button>
              </div>
            )}

            {newRecipient.type === 'SIGNER' && selectedContact && (
              <div className="flex flex-col gap-2 rounded-xl border border-border-primary bg-background-secondary px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <Mail className="h-4 w-4 text-text-muted" />
                    <span>Contact email</span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {selectedContact.defaultEmail
                      ? `Saved as ${selectedContact.defaultEmail}`
                      : 'No default email saved for this contact yet.'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSaveContactEmail()}
                  isLoading={isSavingContactEmail}
                  disabled={isSavingContactEmail || !newRecipient.email.trim() || selectedContact.defaultEmail === newRecipient.email.trim()}
                >
                  {selectedContact.defaultEmail ? 'Update email' : 'Save email'}
                </Button>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-border-primary pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => { setIsAddingRecipient(false); resetRecipientDraft(); }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                leftIcon={<Check className="h-4 w-4" />}
                onClick={() => void handleConfirmNewRecipient()}
              >
                Add recipient
              </Button>
            </div>
          </div>
        )}

        {/* Add recipient button */}
        {envelope.canEdit && !isAddingRecipient && (
          <button
            type="button"
            onClick={() => setIsAddingRecipient(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-border-primary px-4 py-2 text-sm text-text-primary hover:border-oak-primary/50 hover:bg-background-tertiary transition-colors"
          >
            <UserPlus className="h-4 w-4 text-text-muted" />
            Add recipient
          </button>
        )}
      </section>

      {/* ——— Section 3: Message ——— */}
      <section className="rounded-2xl border border-border-primary bg-background-secondary p-4 shadow-sm space-y-4 sm:rounded-3xl sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Email subject & message</h2>
          <p className="mt-0.5 text-xs text-text-muted">Shown in the signing request email sent to recipients.</p>
        </div>

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
      </section>

      {/* ——— Section 4: Advanced settings ——— */}
      <section className="rounded-2xl border border-border-primary bg-background-secondary shadow-sm sm:rounded-3xl">
        <details
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-text-secondary select-none list-none sm:px-6">
            Advanced settings
            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </summary>
          <div className="border-t border-border-primary px-4 py-4 space-y-4 sm:px-6">
            <SingleDateInput
              label="Expiration"
              value={expiresAt}
              onChange={(value) => {
                setExpiresAt(value);
                setIsSettingsDirty(true);
              }}
              disabled={!envelope.canEdit}
              placeholder="dd mmm yyyy"
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput
                label="Reminder every"
                type="number"
                min={1}
                max={30}
                value={reminderFrequencyDays}
                onChange={(e) => {
                  setReminderFrequencyDays(e.target.value);
                  setIsSettingsDirty(true);
                }}
                disabled={!envelope.canEdit}
                hint="Days between reminder emails."
              />
              <FormInput
                label="Start reminders after"
                type="number"
                min={0}
                max={90}
                value={reminderStartDays}
                onChange={(e) => {
                  setReminderStartDays(e.target.value);
                  setIsSettingsDirty(true);
                }}
                disabled={!envelope.canEdit}
                hint="Days after send before reminders begin."
              />
              <FormInput
                label="Warn before expiry"
                type="number"
                min={0}
                max={30}
                value={expiryWarningDays}
                onChange={(e) => {
                  setExpiryWarningDays(e.target.value);
                  setIsSettingsDirty(true);
                }}
                disabled={!envelope.canEdit}
                hint="Days before expiry to notify the sender."
              />
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
      <div className="flex flex-col gap-2 rounded-2xl border border-border-primary bg-background-secondary px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <Button variant="secondary" className="w-full sm:w-auto" onClick={onBack}>
          Back
        </Button>
        <div className="min-w-0 flex-1 text-sm">
          {canProceed ? (
            <span className="text-text-muted">Settings and recipients look good.</span>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {!hasDocument && (
                <span className="flex items-center gap-1 text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Upload at least one document
                </span>
              )}
              {!hasSigner && (
                <span className="flex items-center gap-1 text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Add at least one signer
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => void handleNext()}
          isLoading={isUpdating}
          disabled={!canProceed}
        >
          <span className="hidden sm:inline">Next: Place Fields →</span>
          <span className="sm:hidden">Next →</span>
        </Button>
      </div>
    </div>
  );
}
