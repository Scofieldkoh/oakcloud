'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2, Shield } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { DocumentPageViewer } from '@/components/processing/document-page-viewer';
import type { BoundingBox } from '@/components/processing/document-page-viewer';
import type { EsigningFieldDefinitionDto, EsigningFieldValueDto, EsigningSigningSessionDto } from '@/types/esigning';
import { EsigningConsentScreen } from '@/components/esigning/signing/esigning-consent-screen';
import { EsigningFieldInputModal } from '@/components/esigning/signing/esigning-field-input-modal';
import { EsigningSigningHeader } from '@/components/esigning/signing/esigning-signing-header';
import { EsigningFieldOverlay } from '@/components/esigning/signing/esigning-field-overlay';
import { EsigningPostItTab } from '@/components/esigning/signing/esigning-post-it-tab';
import { EsigningSignatureModal } from '@/components/esigning/signing/esigning-signature-modal';
import { EsigningCompletionScreen } from '@/components/esigning/signing/esigning-completion-screen';
import { EsigningDeclineModal } from '@/components/esigning/signing/esigning-decline-modal';

// =============================================================================
// Types
// =============================================================================

type SigningFlowState = 'loading' | 'requires-code' | 'consent' | 'signing' | 'completed' | 'declined' | 'error';

interface ExchangeResult {
  requiresAccessCode: boolean;
  envelopeId: string;
  recipientId: string;
  envelopeTitle: string;
  recipientName: string;
}

interface DraftValue {
  fieldDefinitionId: string;
  value?: string | null;
  signatureDataUrl?: string | null;
  signaturePreviewUrl?: string | null;
}

// =============================================================================
// Helpers
// =============================================================================

function buildDraftState(fieldValues: EsigningFieldValueDto[]): Record<string, DraftValue> {
  return Object.fromEntries(
    fieldValues.map((fieldValue) => [
      fieldValue.fieldDefinitionId,
      {
        fieldDefinitionId: fieldValue.fieldDefinitionId,
        value: fieldValue.value,
        signatureDataUrl: null,
        signaturePreviewUrl: fieldValue.signaturePreviewUrl ?? null,
      },
    ])
  );
}

function serializeValues(values: Record<string, DraftValue>): DraftValue[] {
  return Object.values(values).filter((entry) => entry.value !== undefined || entry.signatureDataUrl);
}

function buildSignerHighlights(
  fields: EsigningFieldDefinitionDto[],
  documentId: string
): BoundingBox[] {
  return fields
    .filter((f) => f.documentId === documentId)
    .map((f) => ({
      pageNumber: f.pageNumber,
      x: f.xPercent,
      y: f.yPercent,
      width: f.widthPercent,
      height: f.heightPercent,
      label: f.id, // use id as label for lookup
      color: '#294d44',
    }));
}

function getPostItLabel(fieldType: string): string {
  if (fieldType === 'SIGNATURE') return 'Sign';
  if (fieldType === 'INITIALS') return 'Initial';
  if (fieldType === 'CHECKBOX') return 'Check';
  if (fieldType === 'DATE_SIGNED') return 'Date';
  return 'Fill';
}

function getSuggestedFieldValue(
  field: EsigningFieldDefinitionDto,
  session: EsigningSigningSessionDto
): string | null {
  switch (field.type) {
    case 'NAME':
      return session.recipient.name;
    case 'COMPANY':
      return session.envelope.companyName ?? session.envelope.tenantName;
    case 'DATE_SIGNED':
      return new Date().toISOString().slice(0, 10);
    default:
      return field.placeholder ?? null;
  }
}

// =============================================================================
// Component
// =============================================================================

export function EsigningSignPage() {
  const toast = useToast();
  const params = useParams();
  const token = params.token as string;

  // Boot / flow state
  const [flowState, setFlowState] = useState<SigningFlowState>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [session, setSession] = useState<EsigningSigningSessionDto | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);

  // Signing state
  const [draftValues, setDraftValues] = useState<Record<string, DraftValue>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [viewerPage, setViewerPage] = useState(1);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);

  // Signature modal
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureModalMode, setSignatureModalMode] = useState<'SIGNATURE' | 'INITIALS'>('SIGNATURE');
  const [activeSignatureFieldId, setActiveSignatureFieldId] = useState<string | null>(null);
  const [activeInputFieldId, setActiveInputFieldId] = useState<string | null>(null);

  // Decline modal
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);

  // Cached signatures
  const [adoptedSignature, setAdoptedSignature] = useState<string | null>(null);
  const [adoptedInitials, setAdoptedInitials] = useState<string | null>(null);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isConsenting, setIsConsenting] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftValuesRef = useRef<Record<string, DraftValue>>({});
  const savePromiseRef = useRef<Promise<EsigningSigningSessionDto> | null>(null);

  // ==========================================================================
  // Derived state
  // ==========================================================================

  const selectedDocument = useMemo(
    () => session?.documents.find((doc) => doc.id === selectedDocumentId) ?? session?.documents[0] ?? null,
    [selectedDocumentId, session?.documents]
  );

  const fields = useMemo(
    () => (session?.fields ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [session?.fields]
  );

  const requiredFields = useMemo(
    () => fields.filter((f) => f.required).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  const completedCount = useMemo(
    () =>
      requiredFields.filter((f) => {
        const d = draftValues[f.id];
        return d?.value != null || d?.signatureDataUrl != null || d?.signaturePreviewUrl != null;
      }).length,
    [requiredFields, draftValues]
  );

  const canFinish = completedCount === requiredFields.length && requiredFields.length > 0;

  const currentHighlights = useMemo(
    () => (selectedDocument ? buildSignerHighlights(fields, selectedDocument.id) : []),
    [fields, selectedDocument]
  );

  const activeField = requiredFields[activeFieldIndex] ?? null;
  const postItLabel = activeField ? getPostItLabel(activeField.type) : 'Fill';
  const activeInputField = useMemo(
    () => fields.find((field) => field.id === activeInputFieldId) ?? null,
    [activeInputFieldId, fields]
  );

  useEffect(() => {
    latestDraftValuesRef.current = draftValues;
  }, [draftValues]);

  // ==========================================================================
  // API helpers
  // ==========================================================================

  const loadSession = useCallback(async (recordView = false) => {
    const loadResponse = await fetch('/api/esigning/sign/session/load');
    const loadResult = await loadResponse.json().catch(() => ({}));
    if (!loadResponse.ok) {
      throw new Error((loadResult as { error?: string }).error || 'Failed to load signing session');
    }

    const nextSession = loadResult as EsigningSigningSessionDto;
    setSession(nextSession);
    setDraftValues(buildDraftState(nextSession.fieldValues));
    setSelectedDocumentId((current) => current || nextSession.documents[0]?.id || '');

    if (recordView) {
      const viewResponse = await fetch('/api/esigning/sign/session/view', { method: 'POST' });
      if (viewResponse.ok) {
        const viewedSession = await viewResponse.json() as EsigningSigningSessionDto;
        setSession(viewedSession);
        setDraftValues(buildDraftState(viewedSession.fieldValues));
        return viewedSession;
      }
    }

    return nextSession;
  }, []);

  // ==========================================================================
  // Bootstrap
  // ==========================================================================

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setFlowState('loading');
        const response = await fetch(`/api/esigning/sign/${encodeURIComponent(token)}`, { method: 'POST' });
        const result = await response.json().catch(() => ({})) as Partial<ExchangeResult> & { error?: string };
        if (!response.ok) {
          throw new Error(result.error || 'Signing link is invalid');
        }
        if (cancelled) return;
        if (result.requiresAccessCode) {
          setFlowState('requires-code');
          return;
        }
        const nextSession = await loadSession(true);
        if (cancelled) return;
        if (nextSession.recipient.signedAt) {
          setFlowState('completed');
        } else if (!nextSession.recipient.consentedAt) {
          setFlowState('consent');
        } else {
          setFlowState('signing');
        }
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : 'Failed to load signing flow');
          setFlowState('error');
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadSession, token]);

  // ==========================================================================
  // Autosave
  // ==========================================================================

  useEffect(() => {
    if (flowState !== 'signing') return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveProgress().catch(() => undefined);
    }, 500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [draftValues, flowState]);

  // ==========================================================================
  // Draft helpers
  // ==========================================================================

  function setDraft(fieldDefinitionId: string, patch: Partial<DraftValue>) {
    setDraftValues((current) => ({
      ...current,
      [fieldDefinitionId]: {
        ...current[fieldDefinitionId],
        ...patch,
        fieldDefinitionId,
      },
    }));
  }

  function openInputModal(field: EsigningFieldDefinitionDto) {
    setActiveInputFieldId(field.id);
  }

  // ==========================================================================
  // Field navigation
  // ==========================================================================

  function advanceToNextField() {
    const nextIndex = requiredFields.findIndex((f, i) => {
      if (i <= activeFieldIndex) return false;
      const d = draftValues[f.id];
      return !d?.value && !d?.signatureDataUrl && !d?.signaturePreviewUrl;
    });
    if (nextIndex !== -1) {
      setActiveFieldIndex(nextIndex);
      const nextField = requiredFields[nextIndex];
      if (nextField.documentId !== selectedDocumentId) setSelectedDocumentId(nextField.documentId);
      setViewerPage(nextField.pageNumber);
    }
  }

  function goToFieldIndex(index: number) {
    const clamped = Math.max(0, Math.min(requiredFields.length - 1, index));
    setActiveFieldIndex(clamped);
    const field = requiredFields[clamped];
    if (field) {
      if (field.documentId !== selectedDocumentId) setSelectedDocumentId(field.documentId);
      setViewerPage(field.pageNumber);
    }
  }

  // ==========================================================================
  // Field click
  // ==========================================================================

  function handleFieldClick(field: EsigningFieldDefinitionDto) {
    // Set active field index
    const idx = requiredFields.findIndex((f) => f.id === field.id);
    if (idx !== -1) setActiveFieldIndex(idx);

    if (field.type === 'SIGNATURE' || field.type === 'INITIALS') {
      const cached = field.type === 'SIGNATURE' ? adoptedSignature : adoptedInitials;
      if (cached) {
        setDraft(field.id, { signatureDataUrl: cached, signaturePreviewUrl: cached, value: 'signed' });
        advanceToNextField();
      } else {
        setActiveSignatureFieldId(field.id);
        setSignatureModalMode(field.type);
        setIsSignatureModalOpen(true);
      }
    } else if (field.type === 'CHECKBOX') {
      const current = draftValues[field.id]?.value;
      setDraft(field.id, { value: current === 'true' ? null : 'true' });
      advanceToNextField();
    } else if (
      field.type === 'DATE_SIGNED' ||
      field.type === 'TEXT' ||
      field.type === 'NAME' ||
      field.type === 'COMPANY' ||
      field.type === 'TITLE'
    ) {
      openInputModal(field);
    }
  }

  // ==========================================================================
  // Signature modal adoption
  // ==========================================================================

  function handleAdoptSignature({ dataUrl, applyToAll }: { dataUrl: string; applyToAll: boolean }) {
    if (signatureModalMode === 'SIGNATURE') {
      if (applyToAll) setAdoptedSignature(dataUrl);
    } else {
      if (applyToAll) setAdoptedInitials(dataUrl);
    }
    if (activeSignatureFieldId) {
      setDraft(activeSignatureFieldId, {
        signatureDataUrl: dataUrl,
        signaturePreviewUrl: dataUrl,
        value: 'signed',
      });
    }
    setIsSignatureModalOpen(false);
    advanceToNextField();
  }

  // ==========================================================================
  // API actions
  // ==========================================================================

  async function verifyAccessCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessCodeError(null);
    try {
      setFlowState('loading');
      const response = await fetch('/api/esigning/sign/session/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Access code is incorrect');
      }
      const nextSession = await loadSession(true);
      if (nextSession.recipient.signedAt) {
        setFlowState('completed');
      } else if (!nextSession.recipient.consentedAt) {
        setFlowState('consent');
      } else {
        setFlowState('signing');
      }
    } catch (error) {
      setAccessCodeError(error instanceof Error ? error.message : 'Failed to verify access code');
      setFlowState('requires-code');
    }
  }

  async function saveProgress(values: Record<string, DraftValue> = latestDraftValuesRef.current) {
    let nextValues = values;
    if (savePromiseRef.current) {
      await savePromiseRef.current.catch(() => undefined);
      nextValues = latestDraftValuesRef.current;
    }

    const requestPromise = (async () => {
      setIsSaving(true);
      const response = await fetch('/api/esigning/sign/session/fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: serializeValues(nextValues) }),
      });
      const result = await response.json().catch(() => ({})) as EsigningSigningSessionDto & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save progress');
      }
      setSession(result);
      return result;
    })();

    savePromiseRef.current = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (savePromiseRef.current === requestPromise) {
        savePromiseRef.current = null;
      }
      setIsSaving(false);
    }
  }

  async function flushPendingSaves() {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (savePromiseRef.current) {
      await savePromiseRef.current;
    }

    await saveProgress();
  }

  async function completeSigning() {
    try {
      setIsCompleting(true);
      await flushPendingSaves();
      const response = await fetch('/api/esigning/sign/session/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: serializeValues(latestDraftValuesRef.current) }),
      });
      const result = await response.json().catch(() => ({})) as EsigningSigningSessionDto & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to complete signing');
      }
      setSession(result);
      setFlowState('completed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to complete signing');
    } finally {
      setIsCompleting(false);
    }
  }

  async function recordConsent() {
    setIsConsenting(true);
    try {
      const response = await fetch('/api/esigning/sign/session/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consented: true }),
      });
      const result = await response.json().catch(() => ({})) as EsigningSigningSessionDto & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to record consent');
      }
      setSession(result);
    } finally {
      setIsConsenting(false);
    }
  }

  async function declineSigning(reason: string) {
    try {
      setIsDeclining(true);
      const response = await fetch('/api/esigning/sign/session/decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || 'Failed to decline');
      }
      setIsDeclineModalOpen(false);
      setFlowState('declined');
    } finally {
      setIsDeclining(false);
    }
  }

  // ==========================================================================
  // Render: loading
  // ==========================================================================

  if (flowState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary">
        <Loader2 className="h-8 w-8 animate-spin text-oak-primary" />
      </div>
    );
  }

  // ==========================================================================
  // Render: error
  // ==========================================================================

  if (flowState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary p-6">
        <div className="w-full max-w-lg rounded-3xl border border-border-primary bg-background-secondary p-8 shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-center text-2xl font-semibold text-text-primary">
            Signing link unavailable
          </h1>
          <p className="mt-2 text-center text-sm text-text-secondary">{bootError}</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: requires-code
  // ==========================================================================

  if (flowState === 'requires-code') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary p-6">
        <div className="w-full max-w-lg rounded-3xl border border-border-primary bg-background-secondary p-8 shadow-sm">
          <Shield className="mx-auto h-10 w-10 text-oak-primary" />
          <h1 className="mt-4 text-center text-2xl font-semibold text-text-primary">
            Access code required
          </h1>
          {accessCodeError ? (
            <Alert variant="error" className="mt-4">
              {accessCodeError}
            </Alert>
          ) : null}
          <form onSubmit={verifyAccessCode} className="mt-5 space-y-4">
            <FormInput
              label="Access code"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              required
            />
            <Button type="submit" className="w-full">
              Continue to signing
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: consent
  // ==========================================================================

  if (flowState === 'consent' && session) {
    return (
      <EsigningConsentScreen
        envelopeTitle={session.envelope.title}
        senderName={session.envelope.senderName}
        tenantName={session.envelope.tenantName}
        documents={session.documents.map((d) => ({ id: d.id, fileName: d.fileName }))}
        isSubmitting={isConsenting}
        onConsent={async () => {
          await recordConsent();
          setFlowState('signing');
        }}
        onDecline={() => setIsDeclineModalOpen(true)}
      />
    );
  }

  // ==========================================================================
  // Render: completed
  // ==========================================================================

  if (flowState === 'completed' && session) {
    const isAllPartiesDone = session.envelope.status === 'COMPLETED';
    return (
      <EsigningCompletionScreen
        envelopeTitle={session.envelope.title}
        recipientName={session.recipient.name}
        signedAt={session.recipient.signedAt}
        isAllPartiesDone={isAllPartiesDone}
        documents={session.documents}
        downloadToken={session.downloadToken}
        certificateId={session.envelope.certificateId}
      />
    );
  }

  // ==========================================================================
  // Render: declined
  // ==========================================================================

  if (flowState === 'declined') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary p-6">
        <div className="w-full max-w-lg rounded-3xl border border-border-primary bg-background-secondary p-8 shadow-sm text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">You declined to sign</h1>
          <p className="mt-2 text-sm text-text-secondary">
            The sender has been notified. The envelope has been declined.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Render: signing
  // ==========================================================================

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Sticky header */}
      <EsigningSigningHeader
        envelopeTitle={session.envelope.title}
        senderName={session.envelope.senderName}
        tenantName={session.envelope.tenantName}
        completedCount={completedCount}
        requiredCount={requiredFields.length}
        canFinish={canFinish}
        onFinish={() => void completeSigning()}
        onDecline={() => setIsDeclineModalOpen(true)}
        onFinishLater={() =>
          void (async () => {
            try {
              await flushPendingSaves();
              toast.success('Progress saved. You can return to this link later.');
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Failed to save progress');
            }
          })()
        }
        onDownloadOriginal={() => {
          if (selectedDocument) {
            window.open(selectedDocument.pdfUrl, '_blank', 'noreferrer');
          }
        }}
        recipientName={session.recipient.name}
        recipientEmail={session.recipient.email}
        envelopeId={session.envelope.id}
        isFinishing={isCompleting}
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        {/* Document tab bar */}
        {session.documents.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {session.documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => { setSelectedDocumentId(doc.id); setViewerPage(1); }}
                className={
                  (selectedDocument?.id ?? session.documents[0]?.id) === doc.id
                    ? 'rounded-full border border-oak-primary bg-oak-primary/10 px-3 py-1.5 text-xs font-medium text-oak-primary'
                    : 'rounded-full border border-border-primary bg-background-primary px-3 py-1.5 text-xs text-text-secondary hover:bg-background-tertiary'
                }
              >
                {doc.fileName}
              </button>
            ))}
          </div>
        )}

        {/* PDF viewer */}
        {selectedDocument ? (
          <DocumentPageViewer
            key={selectedDocument.id}
            pdfUrl={selectedDocument.pdfUrl}
            initialPage={viewerPage}
            onPageChange={setViewerPage}
            highlights={currentHighlights}
            showHighlights
            className="rounded-2xl border border-border-primary bg-background-primary"
            renderHighlightContent={(highlight, _pixelRect, _idx) => {
              const field = fields.find((f) => f.id === highlight.label);
              if (!field) return null;
              const draft = draftValues[field.id];
              const isFilled = !!(draft?.value || draft?.signatureDataUrl || draft?.signaturePreviewUrl);
              const isActive = requiredFields[activeFieldIndex]?.id === field.id;
              return (
                <EsigningFieldOverlay
                  field={field}
                  state={
                    isFilled
                      ? 'filled'
                      : isActive
                        ? 'active'
                        : field.required
                          ? 'unfilled-required'
                          : 'unfilled-optional'
                  }
                  value={draft?.value}
                  signatureImageUrl={draft?.signaturePreviewUrl ?? draft?.signatureDataUrl}
                  recipientColor="#294d44"
                  onClick={() => handleFieldClick(field)}
                />
              );
            }}
          />
        ) : null}
      </div>

      {/* Post-it tab */}
      {requiredFields.length > 0 && (
        <EsigningPostItTab
          label={canFinish ? 'Finish' : postItLabel}
          isComplete={canFinish}
          currentIndex={activeFieldIndex}
          totalCount={requiredFields.length}
          onClick={() => {
            if (canFinish) {
              void completeSigning();
            } else if (activeField) {
              // Navigate to the active field
              if (activeField.documentId !== selectedDocumentId) {
                setSelectedDocumentId(activeField.documentId);
              }
              setViewerPage(activeField.pageNumber);
              handleFieldClick(activeField);
            }
          }}
          onNext={() => goToFieldIndex(activeFieldIndex + 1)}
          onPrev={() => goToFieldIndex(activeFieldIndex - 1)}
        />
      )}

      {/* Signature modal */}
      <EsigningSignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onAdopt={handleAdoptSignature}
        mode={signatureModalMode}
        recipientName={session.recipient.name}
        existingSignature={signatureModalMode === 'SIGNATURE' ? adoptedSignature : adoptedInitials}
        isSubmitting={false}
      />

      <EsigningFieldInputModal
        field={activeInputField}
        isOpen={Boolean(activeInputField)}
        initialValue={
          activeInputField ? draftValues[activeInputField.id]?.value ?? null : null
        }
        suggestedValue={
          activeInputField && session ? getSuggestedFieldValue(activeInputField, session) : null
        }
        onClose={() => setActiveInputFieldId(null)}
        onSave={(value) => {
          if (!activeInputField) return;
          setDraft(activeInputField.id, { value });
          setActiveInputFieldId(null);
          if (value) {
            advanceToNextField();
          }
        }}
      />

      {/* Decline modal */}
      <EsigningDeclineModal
        isOpen={isDeclineModalOpen}
        onClose={() => setIsDeclineModalOpen(false)}
        onDecline={(reason) => void declineSigning(reason)}
        isSubmitting={isDeclining}
      />

      {/* Save indicator */}
      {isSaving && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-border-primary bg-background-secondary px-4 py-2 text-xs text-text-secondary shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </div>
      )}
    </div>
  );
}
