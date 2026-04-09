'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, Loader2, Shield } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormInput } from '@/components/ui/form-input';
import { useToast } from '@/components/ui/toast';
import { useIsMobile } from '@/hooks/use-media-query';
import { DocumentPageViewer } from '@/components/processing/document-page-viewer';
import type { BoundingBox } from '@/components/processing/document-page-viewer';
import type {
  EsigningFieldDefinitionDto,
  EsigningFieldValueDto,
  EsigningSigningSessionDto,
  EsigningSigningSessionStatusDto,
} from '@/types/esigning';
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
type SigningErrorKind = 'general' | 'network' | 'cancelled' | 'expired' | 'session-expired';

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

interface SigningErrorState {
  kind: SigningErrorKind;
  message: string;
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

function mergeDraftState(
  currentDraftValues: Record<string, DraftValue>,
  serverFieldValues: EsigningFieldValueDto[]
): Record<string, DraftValue> {
  const serverDraftValues = buildDraftState(serverFieldValues);

  return Object.fromEntries(
    Object.entries(serverDraftValues).map(([fieldDefinitionId, serverDraftValue]) => {
      const currentDraftValue = currentDraftValues[fieldDefinitionId];
      return [
        fieldDefinitionId,
        {
          fieldDefinitionId,
          value: currentDraftValue?.value ?? serverDraftValue.value,
          signatureDataUrl: currentDraftValue?.signatureDataUrl ?? null,
          signaturePreviewUrl:
            currentDraftValue?.signaturePreviewUrl ??
            serverDraftValue.signaturePreviewUrl ??
            currentDraftValue?.signatureDataUrl ??
            null,
        } satisfies DraftValue,
      ];
    })
  );
}

function serializeValues(values: Record<string, DraftValue>): DraftValue[] {
  return Object.values(values).filter((entry) => entry.value !== undefined || entry.signatureDataUrl);
}

function isDraftValueComplete(draftValue: DraftValue | undefined): boolean {
  return Boolean(draftValue?.value || draftValue?.signatureDataUrl || draftValue?.signaturePreviewUrl);
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
      return getLocalDateInputValue();
    default:
      return field.placeholder ?? null;
  }
}

function getLocalDateInputValue(): string {
  const now = new Date();
  const day = `${now.getDate()}`.padStart(2, '0');
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const year = `${now.getFullYear()}`;
  return `${day}-${month}-${year}`;
}

function normalizeSigningError(
  error: unknown,
  fallbackMessage: string
): SigningErrorState {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('network request failed')
  ) {
    return {
      kind: 'network',
      message: 'We lost the network connection. Reconnect and resume signing to continue.',
    };
  }

  if (normalizedMessage.includes('voided') || normalizedMessage.includes('cancelled')) {
    return {
      kind: 'cancelled',
      message: 'This envelope was cancelled by the sender while you were signing.',
    };
  }

  if (normalizedMessage.includes('expired')) {
    return {
      kind: 'expired',
      message: 'This envelope expired before your signing session could finish.',
    };
  }

  if (normalizedMessage.includes('session expired')) {
    return {
      kind: 'session-expired',
      message: 'Your signing session expired. Resume signing to continue from your saved progress.',
    };
  }

  return {
    kind: 'general',
    message,
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function getSigningErrorTitle(errorState: SigningErrorState | null): string {
  switch (errorState?.kind) {
    case 'cancelled':
      return 'Envelope cancelled';
    case 'expired':
      return 'Envelope expired';
    case 'session-expired':
      return 'Session expired';
    case 'network':
      return 'Connection lost';
    default:
      return 'Signing link unavailable';
  }
}

// =============================================================================
// Component
// =============================================================================

export function EsigningSignPage() {
  const toast = useToast();
  const params = useParams();
  const token = params.token as string;
  const isMobile = useIsMobile();

  // Boot / flow state
  const [flowState, setFlowState] = useState<SigningFlowState>('loading');
  const [errorState, setErrorState] = useState<SigningErrorState | null>(null);
  const [session, setSession] = useState<EsigningSigningSessionDto | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [accessCodeError, setAccessCodeError] = useState<string | null>(null);

  // Signing state
  const [draftValues, setDraftValues] = useState<Record<string, DraftValue>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [viewerPage, setViewerPage] = useState(1);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const [viewerRetryKey, setViewerRetryKey] = useState(0);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);

  // Signature modal
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatureModalMode, setSignatureModalMode] = useState<'SIGNATURE' | 'INITIALS'>('SIGNATURE');
  const [activeSignatureFieldId, setActiveSignatureFieldId] = useState<string | null>(null);
  const [activeInputFieldId, setActiveInputFieldId] = useState<string | null>(null);

  // Decline modal
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
  const [isFinishLaterDialogOpen, setIsFinishLaterDialogOpen] = useState(false);

  // Cached signatures
  const [adoptedSignature, setAdoptedSignature] = useState<string | null>(null);
  const [adoptedInitials, setAdoptedInitials] = useState<string | null>(null);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isConsenting, setIsConsenting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
        return isDraftValueComplete(d);
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

  useEffect(() => {
    if (flowState !== 'signing' || fields.length === 0) {
      return;
    }

    const autoDateValue = getLocalDateInputValue();
    let hasChanges = false;

    setDraftValues((current) => {
      const next = { ...current };

      for (const field of fields) {
        if (field.type !== 'DATE_SIGNED') {
          continue;
        }

        const existing = next[field.id];
        if (existing?.value) {
          continue;
        }

        next[field.id] = {
          fieldDefinitionId: field.id,
          value: autoDateValue,
          signatureDataUrl: existing?.signatureDataUrl ?? null,
          signaturePreviewUrl: existing?.signaturePreviewUrl ?? null,
        };
        hasChanges = true;
      }

      return hasChanges ? next : current;
    });
  }, [fields, flowState]);

  useEffect(() => {
    if (requiredFields.length === 0) {
      return;
    }

    const nextIncompleteIndex = requiredFields.findIndex((field) => !isDraftValueComplete(draftValues[field.id]));
    const fallbackIndex = nextIncompleteIndex === -1 ? requiredFields.length - 1 : nextIncompleteIndex;

    if (fallbackIndex !== activeFieldIndex) {
      setActiveFieldIndex(fallbackIndex);
    }
  }, [activeFieldIndex, draftValues, requiredFields]);

  useEffect(() => {
    if (!isMobile) {
      setIsPortraitMobile(false);
      return;
    }

    const syncOrientation = () => {
      setIsPortraitMobile(window.innerHeight >= window.innerWidth);
    };

    syncOrientation();
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);

    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
    };
  }, [isMobile]);

  // ==========================================================================
  // API helpers
  // ==========================================================================

  const loadSession = useCallback(
    async (options?: { recordView?: boolean; preserveDrafts?: boolean }) => {
      const { recordView = false, preserveDrafts = false } = options ?? {};
      const currentDraftValues = latestDraftValuesRef.current;

      const loadResponse = await fetch('/api/esigning/sign/session/load');
      const loadResult = await loadResponse.json().catch(() => ({}));
      if (!loadResponse.ok) {
        throw new Error(
          (loadResult as { error?: string }).error || 'Failed to load signing session'
        );
      }

      const nextSession = loadResult as EsigningSigningSessionDto;
      setSession(nextSession);
      setDraftValues(
        preserveDrafts
          ? mergeDraftState(currentDraftValues, nextSession.fieldValues)
          : buildDraftState(nextSession.fieldValues)
      );
      setSelectedDocumentId((current) => current || nextSession.documents[0]?.id || '');

      if (recordView) {
        const viewResponse = await fetch('/api/esigning/sign/session/view', { method: 'POST' });
        if (viewResponse.ok) {
          const viewedSession = (await viewResponse.json()) as EsigningSigningSessionDto;
          setSession(viewedSession);
          setDraftValues(
            preserveDrafts
              ? mergeDraftState(currentDraftValues, viewedSession.fieldValues)
              : buildDraftState(viewedSession.fieldValues)
          );
          return viewedSession;
        }
      }

      return nextSession;
    },
    []
  );

  const refreshSigningStatus = useCallback(async () => {
    const response = await fetch('/api/esigning/sign/session/status');
    const responseBody = (await response.json().catch(() => ({}))) as
      | EsigningSigningSessionStatusDto
      | { error?: string };

    if (!response.ok) {
      throw new Error(
        ('error' in responseBody && responseBody.error) || 'Failed to refresh signing session'
      );
    }

    const result = responseBody as EsigningSigningSessionStatusDto;
    setSaveError(null);

    if (result.recipient.signedAt) {
      await loadSession({ preserveDrafts: true });
      setFlowState('completed');
    }
  }, [loadSession]);

  // ==========================================================================
  // Bootstrap
  // ==========================================================================

  const bootstrapSigning = useCallback(async () => {
    setFlowState('loading');
    setErrorState(null);

    try {
      const response = await fetch(`/api/esigning/sign/${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const result = (await response.json().catch(() => ({}))) as Partial<ExchangeResult> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Signing link is invalid');
      }

      if (result.requiresAccessCode) {
        setFlowState('requires-code');
        return;
      }

      const nextSession = await loadSession({ recordView: true });
      setSaveError(null);

      if (nextSession.recipient.signedAt) {
        setFlowState('completed');
      } else if (!nextSession.recipient.consentedAt) {
        setFlowState('consent');
      } else {
        setFlowState('signing');
      }
    } catch (error) {
      setErrorState(normalizeSigningError(error, 'Failed to load signing flow'));
      setFlowState('error');
    }
  }, [loadSession, token]);

  useEffect(() => {
    void bootstrapSigning();
  }, [bootstrapSigning]);

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

  useEffect(() => {
    if (flowState !== 'signing') {
      return;
    }

    const runStatusRefresh = () => {
      void (async () => {
        try {
          await refreshSigningStatus();
        } catch (error) {
          const normalizedError = normalizeSigningError(error, 'Failed to refresh signing session');
          if (normalizedError.kind === 'network') {
            setSaveError(normalizedError.message);
            return;
          }

          setErrorState(normalizedError);
          setFlowState('error');
        }
      })();
    };

    const intervalId = window.setInterval(runStatusRefresh, 30_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runStatusRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flowState, refreshSigningStatus]);

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
      goToFieldIndex(nextIndex);
    }
  }

  function findNextIncompleteFieldIndex(): number {
    const currentField = requiredFields[activeFieldIndex];
    if (currentField) {
      const currentDraft = draftValues[currentField.id];
      const currentIsComplete = Boolean(
        currentDraft?.value || currentDraft?.signatureDataUrl || currentDraft?.signaturePreviewUrl
      );

      if (!currentIsComplete) {
        return activeFieldIndex;
      }
    }

    const nextAfterCurrent = requiredFields.findIndex((field, index) => {
      if (index <= activeFieldIndex) {
        return false;
      }

      const draft = draftValues[field.id];
      return !draft?.value && !draft?.signatureDataUrl && !draft?.signaturePreviewUrl;
    });

    if (nextAfterCurrent !== -1) {
      return nextAfterCurrent;
    }

    return requiredFields.findIndex((field) => {
      const draft = draftValues[field.id];
      return !draft?.value && !draft?.signatureDataUrl && !draft?.signaturePreviewUrl;
    });
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

  function handlePrimaryAction() {
    if (canFinish) {
      void completeSigning();
      return;
    }

    const nextIndex = findNextIncompleteFieldIndex();
    if (nextIndex === -1) {
      return;
    }

    const nextField = requiredFields[nextIndex];
    if (!nextField) {
      return;
    }

    goToFieldIndex(nextIndex);
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
    } else if (field.type === 'DATE_SIGNED') {
      setDraft(field.id, { value: getLocalDateInputValue() });
      advanceToNextField();
    } else if (
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
      const nextSession = await loadSession({ recordView: true });
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
      let attempt = 0;

      while (attempt < 3) {
        try {
          const response = await fetch('/api/esigning/sign/session/fields', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: serializeValues(nextValues) }),
          });
          const result = (await response.json().catch(() => ({}))) as EsigningSigningSessionDto & {
            error?: string;
          };

          if (!response.ok) {
            const requestError = new Error(result.error || 'Failed to save progress');
            if (response.status >= 500 && attempt < 2) {
              attempt += 1;
              await wait(400 * 2 ** attempt);
              continue;
            }
            throw requestError;
          }

          setSession(result);
          setSaveError(null);
          return result;
        } catch (error) {
          const normalizedError = normalizeSigningError(error, 'Failed to save progress');

          if (normalizedError.kind === 'network' && attempt < 2) {
            attempt += 1;
            await wait(400 * 2 ** attempt);
            continue;
          }

          if (
            normalizedError.kind === 'cancelled' ||
            normalizedError.kind === 'expired' ||
            normalizedError.kind === 'session-expired'
          ) {
            setErrorState(normalizedError);
            setFlowState('error');
          } else {
            setSaveError(normalizedError.message);
          }

          throw error;
        }
      }

      throw new Error('Failed to save progress');
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
      setSaveError(null);
    } catch (error) {
      const normalizedError = normalizeSigningError(error, 'Failed to complete signing');
      if (
        normalizedError.kind === 'cancelled' ||
        normalizedError.kind === 'expired' ||
        normalizedError.kind === 'session-expired'
      ) {
        setErrorState(normalizedError);
        setFlowState('error');
      } else {
        toast.error(normalizedError.message);
      }
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
      setSaveError(null);
    } catch (error) {
      const normalizedError = normalizeSigningError(error, 'Failed to record consent');
      if (
        normalizedError.kind === 'cancelled' ||
        normalizedError.kind === 'expired' ||
        normalizedError.kind === 'session-expired' ||
        normalizedError.kind === 'network'
      ) {
        setErrorState(normalizedError);
        setFlowState('error');
        return;
      }

      toast.error(normalizedError.message);
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

  async function finishLater() {
    try {
      await flushPendingSaves();
      setIsFinishLaterDialogOpen(false);
      toast.success('Progress saved. You can return to this link later.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save progress');
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
            {getSigningErrorTitle(errorState)}
          </h1>
          <p className="mt-2 text-center text-sm text-text-secondary">
            {errorState?.message ?? 'This signing link is not available right now.'}
          </p>
          {(errorState?.kind === 'network' || errorState?.kind === 'session-expired') && (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={() => {
                  setViewerRetryKey((current) => current + 1);
                  void bootstrapSigning();
                }}
              >
                Resume signing
              </Button>
            </div>
          )}
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
        remainingSignerCount={session.recipients.filter(
          (recipient) => recipient.type === 'SIGNER' && recipient.status !== 'SIGNED'
        ).length}
        expiresAt={session.envelope.expiresAt}
        pdfGenerationStatus={session.envelope.pdfGenerationStatus}
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
        onPrimaryAction={handlePrimaryAction}
        onDecline={() => setIsDeclineModalOpen(true)}
        onFinishLater={() => setIsFinishLaterDialogOpen(true)}
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
        {isPortraitMobile ? (
          <Alert variant="info" className="mb-4">
            Landscape mode gives you more space to review the document and complete fields on mobile.
          </Alert>
        ) : null}

        {saveError ? (
          <Alert variant="warning" className="mb-4 flex items-center justify-between gap-3">
            <span>{saveError}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void flushPendingSaves().catch(() => undefined)}
            >
              Retry save
            </Button>
          </Alert>
        ) : null}

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
            key={`${selectedDocument.id}:${viewerRetryKey}`}
            pdfUrl={selectedDocument.pdfUrl}
            initialPage={viewerPage}
            onPageChange={setViewerPage}
            highlights={currentHighlights}
            focusedHighlightLabel={activeField?.id}
            showHighlights
            className="rounded-2xl border border-border-primary bg-background-primary"
            onRetry={() => setViewerRetryKey((current) => current + 1)}
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
              goToFieldIndex(activeFieldIndex);
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
      <ConfirmDialog
        isOpen={isFinishLaterDialogOpen}
        onClose={() => setIsFinishLaterDialogOpen(false)}
        onConfirm={() => void finishLater()}
        title="Save progress and finish later?"
        description="We will save your completed fields so you can return to this same signing link later."
        confirmLabel="Save progress"
        cancelLabel="Keep signing"
        variant="info"
        isLoading={isSaving}
      />

      {/* Save indicator */}
      {isSaving && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-border-primary bg-background-secondary px-4 py-2 text-xs text-text-secondary shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving...
        </div>
      )}
    </div>
  );
}
