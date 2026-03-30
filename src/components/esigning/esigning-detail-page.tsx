'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileSignature,
  Send,
  Trash2,
} from 'lucide-react';
import type {
  EsigningEnvelopeEventAction,
  EsigningRecipientAccessMode,
  EsigningRecipientType,
} from '@/generated/prisma';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { useToast } from '@/components/ui/toast';
import { useCompanies } from '@/hooks/use-companies';
import { usePermissions } from '@/hooks/use-permissions';
import { useSession } from '@/hooks/use-auth';
import {
  useAddEsigningRecipient,
  useDeleteEsigningDocument,
  useDeleteEsigningEnvelope,
  useDuplicateEsigningEnvelope,
  useEsigningEnvelope,
  useRemoveEsigningRecipient,
  useResendEsigningRecipient,
  useRetryEsigningEnvelopeProcessing,
  useSaveEsigningFields,
  useSendEsigningEnvelope,
  useUpdateEsigningEnvelope,
  useUpdateEsigningRecipient,
  useUploadEsigningDocument,
  useVoidEsigningEnvelope,
} from '@/hooks/use-esigning';
import type {
  EsigningFieldDefinitionInput,
  EsigningRecipientInput,
  UpdateEsigningRecipientInput,
} from '@/lib/validations/esigning';
import { ESIGNING_LIMITS } from '@/lib/validations/esigning';
import {
  EnvelopeStatusBadge,
  ESIGNING_ACCESS_MODE_LABELS,
  ESIGNING_RECIPIENT_TYPE_LABELS,
  ESIGNING_SIGNING_ORDER_LABELS,
  formatEsigningDateTime,
  formatEsigningFileSize,
  PdfGenerationBadge,
} from '@/components/esigning/esigning-shared';
import type { EsigningManualLinkDto } from '@/types/esigning';
import { cn } from '@/lib/utils';
import { EsigningStepIndicator } from './prepare/esigning-step-indicator';
import { EsigningStepUpload } from './prepare/esigning-step-upload';
import { EsigningStepFields } from './prepare/esigning-step-fields';
import { EsigningStepReview } from './prepare/esigning-step-review';
import { EsigningRecipientCard } from './prepare/esigning-recipient-card';
import type { PlacedField } from './prepare/esigning-field-canvas';

interface Props {
  envelopeId: string;
}

interface RecipientForm {
  name: string;
  email: string;
  type: EsigningRecipientType;
  signingOrder: string;
  accessMode: EsigningRecipientAccessMode;
  accessCode: string;
}

const DEFAULT_RECIPIENT_FORM: RecipientForm = {
  name: '',
  email: '',
  type: 'SIGNER',
  signingOrder: '1',
  accessMode: 'EMAIL_LINK',
  accessCode: '',
};

function createFieldDraft(partial: Partial<PlacedField> = {}): PlacedField {
  return {
    localId: crypto.randomUUID(),
    documentId: '',
    recipientId: '',
    type: 'SIGNATURE',
    pageNumber: 1,
    xPercent: 0.1,
    yPercent: 0.1,
    widthPercent: 0.24,
    heightPercent: 0.08,
    required: true,
    label: null,
    placeholder: null,
    sortOrder: 0,
    ...partial,
  };
}

function parseOptionalInt(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEventAction(
  action: EsigningEnvelopeEventAction,
  recipientName: string | null,
  metadata: Record<string, unknown> | null
): string {
  const name = recipientName ?? 'Unknown';
  if (action === 'REMINDER_SENT' && metadata?.kind === 'expiry_warning') {
    return 'Expiry warning sent to sender';
  }

  const labels: Partial<Record<EsigningEnvelopeEventAction, string>> = {
    CREATED: 'Envelope created',
    SENT: 'Sent for signing',
    VIEWED: `Viewed by ${name}`,
    CONSENTED: `Consent given by ${name}`,
    SIGNED: `Signed by ${name}`,
    COMPLETED: 'All parties signed — envelope completed',
    DECLINED: `Declined by ${name}`,
    VOIDED: 'Envelope voided',
    CORRECTED: `Recipient corrected: ${name}`,
    EXPIRED: 'Envelope expired',
    REMINDER_SENT: `Reminder sent to ${name}`,
    PDF_GENERATION_FAILED: 'Document processing failed',
  };
  return labels[action] ?? action.replace(/_/g, ' ');
}

type WizardStep = 1 | 2 | 3;

export function EsigningDetailPage({ envelopeId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { can } = usePermissions();
  const sessionQuery = useSession();
  const envelopeQuery = useEsigningEnvelope(envelopeId);
  const envelope = envelopeQuery.data;
  const companiesQuery = useCompanies({ page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc' });

  // Mutations
  const updateEnvelope = useUpdateEsigningEnvelope(envelopeId);
  const uploadDocument = useUploadEsigningDocument(envelopeId);
  const saveFields = useSaveEsigningFields(envelopeId);
  const sendEnvelope = useSendEsigningEnvelope(envelopeId);
  const voidEnvelope = useVoidEsigningEnvelope(envelopeId);
  const retryProcessing = useRetryEsigningEnvelopeProcessing(envelopeId);
  const deleteEnvelope = useDeleteEsigningEnvelope();
  const duplicateEnvelope = useDuplicateEsigningEnvelope();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [manualLinks, setManualLinks] = useState<EsigningManualLinkDto[]>([]);

  // Modal state
  const [isRecipientModalOpen, setIsRecipientModalOpen] = useState(false);
  const [recipientForm, setRecipientForm] = useState<RecipientForm>(DEFAULT_RECIPIENT_FORM);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [recipientActionId, setRecipientActionId] = useState<string | null>(null);
  const [documentActionId, setDocumentActionId] = useState<string | null>(null);
  const [isDeleteRecipientOpen, setIsDeleteRecipientOpen] = useState(false);
  const [isDeleteDocumentOpen, setIsDeleteDocumentOpen] = useState(false);
  const [isDeleteEnvelopeOpen, setIsDeleteEnvelopeOpen] = useState(false);
  const [isVoidOpen, setIsVoidOpen] = useState(false);
  const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Field drafts
  const [fieldDrafts, setFieldDrafts] = useState<PlacedField[]>([]);
  const [hasUnsavedFieldDrafts, setHasUnsavedFieldDrafts] = useState(false);
  const [fieldUndoStack, setFieldUndoStack] = useState<PlacedField[][]>([]);
  const [fieldRedoStack, setFieldRedoStack] = useState<PlacedField[][]>([]);
  const fieldDraftsRef = useRef<PlacedField[]>([]);
  const lastSyncedEnvelopeIdRef = useRef<string | null>(null);

  // Recipient hooks (keyed by action IDs)
  const addRecipient = useAddEsigningRecipient(envelopeId);
  const updateRecipient = useUpdateEsigningRecipient(envelopeId, editingRecipientId ?? '');
  const removeRecipient = useRemoveEsigningRecipient(envelopeId, recipientActionId ?? '');
  const resendRecipient = useResendEsigningRecipient(envelopeId, recipientActionId ?? '');
  const deleteDocument = useDeleteEsigningDocument(envelopeId, documentActionId ?? '');

  // Derived
  const signerRecipients = useMemo(
    () => (envelope?.recipients ?? []).filter((r) => r.type === 'SIGNER'),
    [envelope?.recipients]
  );
  const signerFieldSummary = useMemo(
    () =>
      new Map(
        signerRecipients.map((recipient) => {
          const recipientFields = fieldDrafts.filter((field) => field.recipientId === recipient.id);
          return [
            recipient.id,
            {
              totalCount: recipientFields.length,
              signatureCount: recipientFields.filter(
                (field) => field.type === 'SIGNATURE' || field.type === 'INITIALS'
              ).length,
            },
          ];
        })
      ),
    [fieldDrafts, signerRecipients]
  );

  const canProceedToStep2 = (envelope?.documents.length ?? 0) >= 1 && signerRecipients.length >= 1;
  const canProceedToStep3 =
    canProceedToStep2 &&
    signerRecipients.every((recipient) => {
      const summary = signerFieldSummary.get(recipient.id);
      return Boolean(summary && summary.totalCount > 0 && summary.signatureCount > 0);
    });
  const visibleEvents = useMemo(
    () => (showAllActivity ? envelope?.events ?? [] : (envelope?.events ?? []).slice(0, 6)),
    [envelope?.events, showAllActivity]
  );

  // Initialize field drafts from envelope
  useEffect(() => {
    if (!envelope) return;
    const isDifferentEnvelope = lastSyncedEnvelopeIdRef.current !== envelope.id;
    if (hasUnsavedFieldDrafts && !isDifferentEnvelope) {
      return;
    }
    const syncedFieldDrafts = envelope.fields.map((field) =>
      createFieldDraft({
        ...field,
        localId: field.id,
        label: field.label ?? null,
        placeholder: field.placeholder ?? null,
      })
    );
    setFieldDrafts(syncedFieldDrafts);
    fieldDraftsRef.current = syncedFieldDrafts;
    setHasUnsavedFieldDrafts(false);
    setFieldUndoStack([]);
    setFieldRedoStack([]);
    lastSyncedEnvelopeIdRef.current = envelope.id;
  }, [envelope, hasUnsavedFieldDrafts]);

  useEffect(() => {
    fieldDraftsRef.current = fieldDrafts;
  }, [fieldDrafts]);

  const updateFieldDrafts = useCallback((nextFields: PlacedField[], options?: {
    recordHistory?: boolean;
    historySnapshot?: PlacedField[];
  }) => {
    if (options?.recordHistory !== false) {
      const historySnapshot = options?.historySnapshot ?? fieldDraftsRef.current;
      setFieldUndoStack((current) => [...current.slice(-49), historySnapshot]);
      setFieldRedoStack([]);
    }
    setFieldDrafts(nextFields);
    fieldDraftsRef.current = nextFields;
    setHasUnsavedFieldDrafts(true);
  }, []);

  const undoFieldDrafts = useCallback(() => {
    setFieldUndoStack((current) => {
      const previous = current[current.length - 1];
      if (!previous) {
        return current;
      }

      setFieldRedoStack((redoCurrent) => [fieldDraftsRef.current, ...redoCurrent].slice(0, 50));
      setFieldDrafts(previous);
      fieldDraftsRef.current = previous;
      setHasUnsavedFieldDrafts(true);
      return current.slice(0, -1);
    });
  }, []);

  const redoFieldDrafts = useCallback(() => {
    setFieldRedoStack((current) => {
      const [next, ...rest] = current;
      if (!next) {
        return current;
      }

      setFieldUndoStack((undoCurrent) => [...undoCurrent.slice(-49), fieldDraftsRef.current]);
      setFieldDrafts(next);
      fieldDraftsRef.current = next;
      setHasUnsavedFieldDrafts(true);
      return rest;
    });
  }, []);

  const buildFieldDefinitionPayload = useCallback(
    () =>
      fieldDrafts.map(
        (field): EsigningFieldDefinitionInput => ({
          id: field.localId,
          documentId: field.documentId,
          recipientId: field.recipientId,
          type: field.type,
          pageNumber: field.pageNumber,
          xPercent: field.xPercent,
          yPercent: field.yPercent,
          widthPercent: field.widthPercent,
          heightPercent: field.heightPercent,
          required: field.required,
          label: field.label || null,
          placeholder: field.placeholder || null,
          sortOrder: field.sortOrder,
        })
      ),
    [fieldDrafts]
  );

  // Handlers
  function openEditRecipient(recipientId: string) {
    const recipient = envelope?.recipients.find((r) => r.id === recipientId);
    if (!recipient) return;
    setEditingRecipientId(recipientId);
    setRecipientForm({
      name: recipient.name,
      email: recipient.email,
      type: recipient.type,
      signingOrder: recipient.signingOrder?.toString() ?? '',
      accessMode: recipient.accessMode,
      accessCode: '',
    });
    setIsRecipientModalOpen(true);
  }

  async function saveRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const signingOrderValue = envelope?.signingOrder ?? 'PARALLEL';
      if (editingRecipientId) {
        const payload: UpdateEsigningRecipientInput = {
          name: recipientForm.name.trim(),
          email: recipientForm.email.trim(),
          type: recipientForm.type,
          signingOrder:
            recipientForm.type === 'CC' || signingOrderValue === 'PARALLEL'
              ? null
              : parseOptionalInt(recipientForm.signingOrder),
          accessMode: recipientForm.accessMode,
          accessCode: recipientForm.accessCode.trim() || undefined,
        };
        const result = await updateRecipient.mutateAsync(payload);
        if (result.manualLinks.length > 0) {
          setManualLinks(result.manualLinks);
          setIsLinksModalOpen(true);
        }
      } else {
        const payload: EsigningRecipientInput = {
          name: recipientForm.name.trim(),
          email: recipientForm.email.trim(),
          type: recipientForm.type,
          signingOrder:
            recipientForm.type === 'CC' || signingOrderValue === 'PARALLEL'
              ? null
              : parseOptionalInt(recipientForm.signingOrder),
          accessMode: recipientForm.accessMode,
          accessCode: recipientForm.accessCode.trim() || undefined,
        };
        await addRecipient.mutateAsync(payload);
      }
      setIsRecipientModalOpen(false);
      toast.success(
        editingRecipientId
          ? envelope?.status === 'DRAFT'
            ? 'Recipient saved'
            : 'Recipient corrected'
          : 'Recipient saved'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save recipient');
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      for (const file of Array.from(files)) {
        await uploadDocument.mutateAsync(file);
      }
      toast.success('Documents uploaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload documents');
    }
  }

  async function persistFields(options?: { silent?: boolean }) {
    if (!hasUnsavedFieldDrafts) {
      if (!options?.silent) {
        toast.success('Field layout is already up to date');
      }
      return;
    }

    try {
      await saveFields.mutateAsync(buildFieldDefinitionPayload());
      setHasUnsavedFieldDrafts(false);
      if (!options?.silent) {
        toast.success('Field layout saved');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save fields');
      throw error;
    }
  }

  async function handleDuplicateEnvelope() {
    try {
      const duplicated = await duplicateEnvelope.mutateAsync(envelopeId);
      toast.success('Envelope duplicated');
      router.push(`/esigning/${duplicated.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate envelope');
    }
  }

  async function handleDeleteEnvelope() {
    try {
      await deleteEnvelope.mutateAsync(envelopeId);
      toast.success('Draft deleted');
      setIsDeleteEnvelopeOpen(false);
      router.push('/esigning');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete draft');
    }
  }

  function openEnvelopeDownload(variant: 'combined' | 'certificates') {
    const query = new URLSearchParams({ variant });
    window.open(
      `/api/esigning/envelopes/${envelopeId}/download?${query.toString()}`,
      '_blank',
      'noreferrer'
    );
  }

  // ——— Early returns ———
  if (!can.readEsigning) {
    return (
      <div className="p-6">
        <Alert variant="error" title="Access denied">
          You do not have permission to access this envelope.
        </Alert>
      </div>
    );
  }

  if (envelopeQuery.isLoading) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border border-dashed border-border-primary bg-background-secondary p-10 text-center text-sm text-text-secondary">
          Loading e-signing envelope…
        </div>
      </div>
    );
  }

  if (envelopeQuery.error || !envelope) {
    return (
      <div className="p-6">
        <Alert variant="error" title="Unable to load envelope">
          {envelopeQuery.error instanceof Error
            ? envelopeQuery.error.message
            : 'Envelope not found'}
        </Alert>
      </div>
    );
  }

  // ——— Recipient modal (shared between DRAFT wizard and read-only view) ———
  const recipientModal = (
    <Modal
      isOpen={isRecipientModalOpen}
      onClose={() => setIsRecipientModalOpen(false)}
      title={
        editingRecipientId
          ? envelope.status === 'DRAFT'
            ? 'Edit recipient'
            : 'Correct recipient'
          : 'Add recipient'
      }
      size="xl"
    >
      <form onSubmit={saveRecipient}>
        <ModalBody className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              label="Name"
              value={recipientForm.name}
              onChange={(e) => setRecipientForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <FormInput
              label="Email"
              type="email"
              value={recipientForm.email}
              onChange={(e) => setRecipientForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          {envelope.status === 'DRAFT' ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-xs font-medium text-text-secondary">
                  <span>Role</span>
                  <select
                    value={recipientForm.type}
                    onChange={(e) =>
                      setRecipientForm((prev) => ({ ...prev, type: e.target.value as EsigningRecipientType }))
                    }
                    className="h-8 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
                  >
                    {Object.entries(ESIGNING_RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-xs font-medium text-text-secondary">
                  <span>Access mode</span>
                  <select
                    value={recipientForm.accessMode}
                    onChange={(e) =>
                      setRecipientForm((prev) => ({
                        ...prev,
                        accessMode: e.target.value as EsigningRecipientAccessMode,
                      }))
                    }
                    className="h-8 rounded-lg border border-border-primary bg-background-primary px-3 text-sm text-text-primary"
                  >
                    {Object.entries(ESIGNING_ACCESS_MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {recipientForm.type === 'SIGNER' && envelope.signingOrder !== 'PARALLEL' && (
                <FormInput
                  label="Signing group"
                  type="number"
                  min={1}
                  max={ESIGNING_LIMITS.MAX_RECIPIENTS}
                  value={recipientForm.signingOrder}
                  onChange={(e) =>
                    setRecipientForm((prev) => ({ ...prev, signingOrder: e.target.value }))
                  }
                />
              )}
              {recipientForm.accessMode === 'EMAIL_WITH_CODE' && (
                <FormInput
                  label="Access code"
                  value={recipientForm.accessCode}
                  onChange={(e) =>
                    setRecipientForm((prev) => ({ ...prev, accessCode: e.target.value }))
                  }
                  hint="Minimum 4 characters."
                  required
                />
              )}
            </>
          ) : (
            <Alert variant="info">
              After sending, you can correct only the recipient&apos;s name and email. Oakcloud will keep the routing and access settings unchanged.
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setIsRecipientModalOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" isLoading={addRecipient.isPending || updateRecipient.isPending}>
            {editingRecipientId
              ? envelope.status === 'DRAFT'
                ? 'Save recipient'
                : 'Save correction'
              : 'Save recipient'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );

  const linksModal = (
    <Modal
      isOpen={isLinksModalOpen}
      onClose={() => setIsLinksModalOpen(false)}
      title="Manual signing links"
      size="2xl"
    >
      <ModalBody className="space-y-3">
        {manualLinks.map((link) => (
          <div key={link.recipientId} className="rounded-2xl border border-border-primary bg-background-primary p-4">
            <div className="text-sm font-semibold text-text-primary">{link.recipientName}</div>
            <div className="mt-1 text-xs text-text-secondary">{link.recipientEmail}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={link.signingUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-xs text-text-secondary"
              >
                {link.signingUrl}
              </a>
              <Button
                variant="secondary"
                size="xs"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link.signingUrl)
                    .then(() => toast.success('Manual link copied'))
                    .catch(() => toast.error('Clipboard access failed'))
                }
              >
                Copy
              </Button>
            </div>
          </div>
        ))}
      </ModalBody>
      <ModalFooter>
        <Button onClick={() => setIsLinksModalOpen(false)}>Done</Button>
      </ModalFooter>
    </Modal>
  );

  const confirmDialogs = (
    <>
      <ConfirmDialog
        isOpen={isDeleteRecipientOpen}
        onClose={() => setIsDeleteRecipientOpen(false)}
        onConfirm={async () => {
          try {
            await removeRecipient.mutateAsync();
            toast.success('Recipient removed');
            setIsDeleteRecipientOpen(false);
            setRecipientActionId(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to remove recipient');
          }
        }}
        title="Remove recipient?"
        confirmLabel="Remove recipient"
        isLoading={removeRecipient.isPending}
      />
      <ConfirmDialog
        isOpen={isDeleteDocumentOpen}
        onClose={() => setIsDeleteDocumentOpen(false)}
        onConfirm={async () => {
          try {
            await deleteDocument.mutateAsync();
            toast.success('Document removed');
            setIsDeleteDocumentOpen(false);
            setDocumentActionId(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to remove document');
          }
        }}
        title="Remove document?"
        confirmLabel="Remove document"
        isLoading={deleteDocument.isPending}
      />
      <ConfirmDialog
        isOpen={isDeleteEnvelopeOpen}
        onClose={() => setIsDeleteEnvelopeOpen(false)}
        onConfirm={handleDeleteEnvelope}
        title="Delete draft envelope?"
        description="This permanently removes the draft envelope and its uploaded source files."
        confirmLabel="Delete draft"
        isLoading={deleteEnvelope.isPending}
      />
      <ConfirmDialog
        isOpen={isVoidOpen}
        onClose={() => setIsVoidOpen(false)}
        onConfirm={async (reason) => {
          try {
            await voidEnvelope.mutateAsync(reason ?? null);
            toast.success('Envelope voided');
            setIsVoidOpen(false);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to void envelope');
          }
        }}
        title="Void envelope?"
        description="Signers lose access immediately."
        confirmLabel="Void envelope"
        requireReason
        reasonLabel="Void reason"
        reasonPlaceholder="Explain why the envelope is being voided"
        reasonMinLength={3}
        isLoading={voidEnvelope.isPending}
      />
    </>
  );

  // ——— DRAFT: 3-step wizard ———
  if (envelope.status === 'DRAFT') {
    return (
      <div className="min-h-screen bg-background-primary flex flex-col">
        {/* Header */}
        <div className="border-b border-border-primary bg-background-secondary px-6 py-3 flex items-center gap-4 flex-shrink-0">
          <Link
            href="/esigning"
            className="inline-flex items-center gap-2 rounded-full border border-border-primary px-3 py-1.5 text-sm text-text-secondary hover:bg-background-tertiary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex-1 min-w-0">
            <EsigningStepIndicator
              currentStep={currentStep}
              canProceedToStep2={canProceedToStep2}
              canProceedToStep3={canProceedToStep3}
              onStepClick={setCurrentStep}
            />
          </div>
          <div className="flex items-center gap-2">
            {envelope.canDuplicate ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Copy className="h-4 w-4" />}
                onClick={() => void handleDuplicateEnvelope()}
                isLoading={duplicateEnvelope.isPending}
              >
                Duplicate
              </Button>
            ) : null}
            {envelope.canDelete ? (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setIsDeleteEnvelopeOpen(true)}
              >
                Delete draft
              </Button>
            ) : null}
            <span className="max-w-48 truncate text-sm text-text-secondary">{envelope.title}</span>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-auto">
          {currentStep === 1 && (
            <EsigningStepUpload
              envelope={envelope}
              currentUser={sessionQuery.data ? {
                firstName: sessionQuery.data.firstName,
                lastName: sessionQuery.data.lastName,
                email: sessionQuery.data.email,
              } : null}
              onUpdateSettings={async (settings) => {
                await updateEnvelope.mutateAsync(settings);
              }}
              isUpdating={updateEnvelope.isPending}
              onUploadDocuments={async (files) => { await uploadFiles(files); }}
              isUploading={uploadDocument.isPending}
              onDeleteDocument={(docId) => {
                setDocumentActionId(docId);
                setIsDeleteDocumentOpen(true);
              }}
              onAddRecipient={async (data) => {
                await addRecipient.mutateAsync(data);
                toast.success('Recipient added');
              }}
              onEditRecipient={openEditRecipient}
              onRemoveRecipient={(id) => {
                setRecipientActionId(id);
                setIsDeleteRecipientOpen(true);
              }}
              companies={(companiesQuery.data?.companies ?? []).map((c) => ({
                id: c.id,
                name: c.name,
                uen: c.uen,
              }))}
              companiesLoading={companiesQuery.isLoading}
              onNext={() => setCurrentStep(2)}
            />
          )}
          {currentStep === 2 && (
            <EsigningStepFields
              envelope={envelope}
              fields={fieldDrafts}
              onFieldsChange={updateFieldDrafts}
              onSaveFields={persistFields}
              isSaving={saveFields.isPending}
              canUndo={fieldUndoStack.length > 0}
              canRedo={fieldRedoStack.length > 0}
              onUndo={undoFieldDrafts}
              onRedo={redoFieldDrafts}
              onNext={() => setCurrentStep(3)}
              onBack={() => setCurrentStep(1)}
              canEdit={envelope.canEdit && can.updateEsigning}
            />
          )}
          {currentStep === 3 && (
            <EsigningStepReview
              envelope={envelope}
              fields={fieldDrafts}
              onSend={async () => {
                try {
                  await persistFields({ silent: true });
                  const result = await sendEnvelope.mutateAsync();
                  if (result.manualLinks.length > 0) {
                    setManualLinks(result.manualLinks);
                    setIsLinksModalOpen(true);
                  }
                  toast.success('Envelope sent');
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to send envelope');
                }
              }}
              isSending={sendEnvelope.isPending}
              onBack={() => setCurrentStep(2)}
              manualLinks={manualLinks}
            />
          )}
        </div>

        {/* Modals */}
        {recipientModal}
        {linksModal}
        {confirmDialogs}
      </div>
    );
  }

  // ——— Non-draft: read-only detail view ———
  return (
    <div className="min-h-screen bg-background-primary">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
        {/* Back + status */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/esigning"
            className="inline-flex items-center gap-2 rounded-full border border-border-primary bg-background-secondary px-3 py-1.5 text-sm text-text-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <EnvelopeStatusBadge status={envelope.status} />
          <span className="inline-flex items-center rounded-full border border-border-primary px-3 py-1 text-xs text-text-secondary">
            {ESIGNING_SIGNING_ORDER_LABELS[envelope.signingOrder]}
          </span>
          {envelope.pdfGenerationStatus ? (
            <PdfGenerationBadge status={envelope.pdfGenerationStatus} />
          ) : null}
        </div>

        {/* Header card */}
        <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-oak-primary/10 p-3 text-oak-primary">
                  <FileSignature className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold text-text-primary">{envelope.title}</h1>
                  <p className="mt-1 text-sm text-text-secondary">
                    Certificate {envelope.certificateId} · Updated{' '}
                    {formatEsigningDateTime(envelope.updatedAt)}
                  </p>
                </div>
              </div>
              {envelope.pdfGenerationError && (
                <Alert variant="warning" className="mt-4">
                  {envelope.pdfGenerationError}
                </Alert>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {envelope.canDuplicate ? (
                <Button
                  variant="secondary"
                  leftIcon={<Copy className="h-4 w-4" />}
                  onClick={() => void handleDuplicateEnvelope()}
                  isLoading={duplicateEnvelope.isPending}
                >
                  Duplicate
                </Button>
              ) : null}
              {envelope.canSend && can.updateEsigning && (
                <Button
                  leftIcon={<Send className="h-4 w-4" />}
                  onClick={async () => {
                    try {
                      const result = await sendEnvelope.mutateAsync();
                      if (result.manualLinks.length > 0) {
                        setManualLinks(result.manualLinks);
                        setIsLinksModalOpen(true);
                      }
                      toast.success('Envelope sent');
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : 'Failed to send envelope'
                      );
                    }
                  }}
                  isLoading={sendEnvelope.isPending}
                >
                  Send envelope
                </Button>
              )}
              {envelope.canVoid && can.updateEsigning && (
                <Button variant="secondary" onClick={() => setIsVoidOpen(true)}>
                  Void
                </Button>
              )}
              {envelope.status === 'COMPLETED' && envelope.pdfGenerationStatus === 'COMPLETED' ? (
                <>
                  <Button
                    variant="secondary"
                    leftIcon={<Download className="h-4 w-4" />}
                    onClick={() => openEnvelopeDownload('combined')}
                  >
                    Download all
                  </Button>
                  <Button
                    variant="secondary"
                    leftIcon={<Download className="h-4 w-4" />}
                    onClick={() => openEnvelopeDownload('certificates')}
                  >
                    Certificates only
                  </Button>
                </>
              ) : null}
              {envelope.canRetryPdf ? (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await retryProcessing.mutateAsync();
                      toast.success('PDF generation queued again');
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Failed to retry');
                    }
                  }}
                  isLoading={retryProcessing.isPending}
                >
                  Retry PDF
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        {/* Two-column layout */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          {/* Left: recipients + documents */}
          <div className="space-y-6">
            {/* Recipients */}
            <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-text-primary">Recipients</h2>
              <p className="text-sm text-text-secondary">Signers and copy recipients.</p>
              <div className="mt-5 space-y-3">
                {envelope.recipients.map((recipient) => {
                  const canCorrectRecipient =
                    ['SENT', 'IN_PROGRESS'].includes(envelope.status) &&
                    can.updateEsigning &&
                    recipient.status !== 'SIGNED' &&
                    recipient.status !== 'DECLINED';

                  return (
                    <EsigningRecipientCard
                      key={recipient.id}
                      recipient={recipient}
                      envelopeSigningOrder={envelope.signingOrder}
                      canEdit={canCorrectRecipient}
                      onEdit={() => openEditRecipient(recipient.id)}
                      onRemove={() => {
                        setRecipientActionId(recipient.id);
                        setIsDeleteRecipientOpen(true);
                      }}
                      onResend={
                        envelope.status !== 'DRAFT' && can.updateEsigning
                          ? () =>
                              void (async () => {
                                setRecipientActionId(recipient.id);
                                try {
                                  const result = await resendRecipient.mutateAsync();
                                  if (result.manualLinks.length > 0) {
                                    setManualLinks(result.manualLinks);
                                    setIsLinksModalOpen(true);
                                  }
                                  toast.success('Recipient resent');
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : 'Failed to resend recipient'
                                  );
                                } finally {
                                  setRecipientActionId(null);
                                }
                              })()
                          : undefined
                      }
                      warnings={[]}
                    />
                  );
                })}
              </div>
            </section>

            {/* Documents */}
            <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-text-primary">Documents</h2>
              <div className="mt-5 space-y-3">
                {envelope.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-2xl border border-border-primary bg-background-primary p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="font-semibold text-text-primary">{doc.fileName}</div>
                        <div className="text-sm text-text-secondary">
                          {doc.pageCount} pages · {formatEsigningFileSize(doc.fileSize)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={doc.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                        >
                          <Download className="h-4 w-4" />
                          Original
                        </a>
                        {doc.signedPdfUrl && (
                          <a
                            href={doc.signedPdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-sm text-text-primary"
                          >
                            <Download className="h-4 w-4" />
                            Signed
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right: activity timeline */}
          <div>
            <section className="rounded-3xl border border-border-primary bg-background-secondary p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-text-primary">Activity</h2>
              {envelope.events.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((current) => !current)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-oak-primary"
                >
                  {showAllActivity ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Collapse older events
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Show all activity
                    </>
                  )}
                </button>
              ) : null}
              <div className="mt-4 relative">
                {/* Vertical line */}
                <div className="absolute left-2 top-2 bottom-2 w-px bg-border-primary" />
                <div className="space-y-4">
                  {visibleEvents.map((event, idx) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="relative flex-shrink-0 w-5 flex justify-center">
                        <div
                          className={cn(
                            'h-4 w-4 rounded-full border-2 mt-0.5',
                            idx === 0
                              ? 'border-oak-primary bg-oak-primary'
                              : 'border-border-primary bg-background-secondary'
                          )}
                        />
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="text-sm text-text-primary">
                          {formatEventAction(event.action, event.recipientName, event.metadata)}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {formatEsigningDateTime(event.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {envelope.events.length === 0 && (
                    <p className="pl-5 text-sm text-text-muted">No activity yet.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Modals */}
      {recipientModal}
      {linksModal}
      {confirmDialogs}
    </div>
  );
}
