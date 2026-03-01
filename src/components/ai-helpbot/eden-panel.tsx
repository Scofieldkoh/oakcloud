'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  ArrowRight,
  Loader2,
  Plus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-auth';
import {
  useAIHelpbotMessages,
  useAIHelpbotRespond,
  useAIHelpbotSessions,
  useCreateAIHelpbotSession,
  useUpdateAIHelpbotSession,
  type AIAssistantNavigationIntent,
} from '@/hooks/use-ai-helpbot';
import type { AIAssistantContextSnapshot } from '@/lib/validations/ai-helpbot';
import type { TabId } from '@/components/companies/company-detail';
import { cn } from '@/lib/utils';

interface EdenPanelProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  activeTab: TabId;
  canReadCompany: boolean;
  canWriteCompany: boolean;
}

function toQueryObject(searchParams: URLSearchParams): Record<string, string> {
  const query: Record<string, string> = {};

  searchParams.forEach((value, key) => {
    query[key] = value;
  });

  return query;
}

function toNavigationPath(intent: AIAssistantNavigationIntent): string {
  if (intent.target.path.includes('?')) {
    return intent.target.path;
  }

  const query = intent.target.query ? new URLSearchParams(intent.target.query).toString() : '';
  return query ? `${intent.target.path}?${query}` : intent.target.path;
}

export function EdenPanel({
  isOpen,
  onClose,
  companyId,
  companyName,
  activeTab,
  canReadCompany,
  canWriteCompany,
}: EdenPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { success, error: showError } = useToast();

  const sessionsQuery = useAIHelpbotSessions({
    contextId: companyId,
    includeArchived: false,
    limit: 20,
  });

  const createSession = useCreateAIHelpbotSession();
  const updateSession = useUpdateAIHelpbotSession();
  const respondMutation = useAIHelpbotRespond();

  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>();
  const [inputValue, setInputValue] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const autoCreateRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const messagesQuery = useAIHelpbotMessages(selectedSessionId);

  const sessions = useMemo(
    () => sessionsQuery.data?.sessions || [],
    [sessionsQuery.data?.sessions]
  );
  const messages = useMemo(
    () => messagesQuery.data?.messages || [],
    [messagesQuery.data?.messages]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (selectedSessionId && sessions.some((item) => item.id === selectedSessionId)) {
      return;
    }

    if (sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
      return;
    }

    if (sessionsQuery.isFetching || createSession.isPending || autoCreateRef.current) {
      return;
    }

    autoCreateRef.current = true;
    createSession
      .mutateAsync({
        contextId: companyId,
        title: `${companyName} Assistant`,
      })
      .then((result) => {
        setSelectedSessionId(result.session.id);
      })
      .catch((error) => {
        showError(error instanceof Error ? error.message : 'Failed to create session');
      })
      .finally(() => {
        autoCreateRef.current = false;
      });
  }, [
    companyId,
    companyName,
    createSession,
    isOpen,
    selectedSessionId,
    sessions,
    sessionsQuery.isFetching,
    showError,
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isBusy =
    respondMutation.isPending ||
    messagesQuery.isFetching ||
    sessionsQuery.isFetching ||
    isCreatingSession;

  const buildContextSnapshot = useCallback((): AIAssistantContextSnapshot => {
    return {
      tenantId: session?.tenantId ?? undefined,
      userId: session?.id ?? undefined,
      requestId: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      route: {
        path: pathname,
        module: 'companies',
        params: { id: companyId },
        query: toQueryObject(searchParams),
      },
      scope: {
        companyId,
      },
      selection: {
        selectedIds: [companyId],
        activeTab,
      },
      uiState: {
        locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        timezone:
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : undefined,
      },
      capabilities: {
        canRead: canReadCompany ? ['company:read'] : [],
        canWrite: canWriteCompany ? ['company:update'] : [],
        canApprove: [],
      },
    };
  }, [activeTab, canReadCompany, canWriteCompany, companyId, pathname, searchParams, session?.id, session?.tenantId]);

  const handleCreateSession = useCallback(async () => {
    setIsCreatingSession(true);
    try {
      const result = await createSession.mutateAsync({
        contextId: companyId,
        title: `${companyName} Assistant`,
      });

      setSelectedSessionId(result.session.id);
      success('New Eden session created');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to create session');
    } finally {
      setIsCreatingSession(false);
    }
  }, [companyId, companyName, createSession, success, showError]);

  const handleArchiveSession = useCallback(async () => {
    if (!selectedSessionId) {
      return;
    }

    try {
      await updateSession.mutateAsync({ id: selectedSessionId, archived: true });
      setSelectedSessionId(undefined);
      success('Session archived');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to archive session');
    }
  }, [selectedSessionId, success, showError, updateSession]);

  const handleNavigate = useCallback(
    (intent: AIAssistantNavigationIntent) => {
      router.push(toNavigationPath(intent));
      success('Navigated');
    },
    [router, success]
  );

  const handleSend = useCallback(async () => {
    const message = inputValue.trim();
    if (!message) {
      return;
    }

    let sessionId = selectedSessionId;

    if (!sessionId) {
      try {
        const result = await createSession.mutateAsync({
          contextId: companyId,
          title: `${companyName} Assistant`,
        });
        sessionId = result.session.id;
        setSelectedSessionId(result.session.id);
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to create session');
        return;
      }
    }

    try {
      await respondMutation.mutateAsync({
        sessionId,
        message,
        contextSnapshot: buildContextSnapshot(),
      });
      setInputValue('');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to send message');
    }
  }, [
    companyId,
    companyName,
    buildContextSnapshot,
    createSession,
    inputValue,
    respondMutation,
    selectedSessionId,
    showError,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={onClose} />

      <div
        className={cn(
          'fixed md:fixed inset-y-0 right-0 z-50',
          'w-full sm:w-[380px] md:w-[420px]',
          'bg-background-secondary border-l border-border-primary shadow-elevation-2',
          'flex flex-col'
        )}
      >
        <div className="p-4 border-b border-border-primary">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-oak-light" />
              <div>
                <p className="font-medium text-text-primary">Eden</p>
                <p className="text-xs text-text-secondary">Companies read-only assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary"
              aria-label="Close Eden panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <select
              value={selectedSessionId || ''}
              onChange={(event) => setSelectedSessionId(event.target.value || undefined)}
              className="input input-sm flex-1"
            >
              <option value="">Select session</option>
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleCreateSession}
              className="btn-secondary btn-sm"
              disabled={isBusy}
              title="New session"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleArchiveSession}
              className="btn-secondary btn-sm"
              disabled={isBusy || !selectedSessionId}
              title="Archive current session"
            >
              <Archive className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isBusy && (
            <div className="rounded-lg border border-border-secondary bg-background-elevated p-3 text-sm text-text-secondary">
              Ask Eden to explain policy/process for this company or validate company profile completeness.
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-xl p-3 border',
                message.role === 'assistant'
                  ? 'bg-background-elevated border-border-secondary mr-3'
                  : 'bg-oak-light/10 border-oak-light/30 ml-3'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-medium uppercase text-text-tertiary">{message.role}</span>
                <span className="text-xs text-text-muted">
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <p className="text-sm text-text-primary whitespace-pre-wrap">{message.content}</p>

              {message.citations && message.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border-secondary space-y-1">
                  {message.citations.map((citation) => (
                    <p
                      key={`${message.id}-${citation.sourcePath}-${citation.heading}`}
                      className="text-xs text-text-muted"
                    >
                      Source: {citation.sourcePath} - {citation.heading}
                    </p>
                  ))}
                </div>
              )}

              {message.navigationIntent && (
                <div className="mt-2 pt-2 border-t border-border-secondary">
                  <button
                    type="button"
                    onClick={() => handleNavigate(message.navigationIntent!)}
                    className="btn-secondary btn-sm w-full inline-flex items-center justify-center gap-2"
                  >
                    <span>Navigate</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {isBusy && (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Eden is thinking...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-border-primary">
          <div className="relative">
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={3}
              placeholder={`Ask Eden about ${companyName}...`}
              disabled={respondMutation.isPending}
              className="input w-full pr-12 py-2 resize-none"
            />

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={respondMutation.isPending || inputValue.trim().length === 0}
              className="absolute right-2 bottom-2 p-2 rounded bg-oak-primary text-white hover:bg-oak-dark disabled:opacity-50"
              aria-label="Send message"
            >
              {respondMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="mt-2 text-xs text-text-muted">
            Eden MVP is read-only for Companies. Responses include citations when available.
          </p>
        </div>
      </div>
    </>
  );
}
