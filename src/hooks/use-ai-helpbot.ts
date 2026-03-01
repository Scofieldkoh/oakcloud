'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AIAssistantContextSnapshot } from '@/lib/validations/ai-helpbot';

export interface AIAssistantCitation {
  sourcePath: string;
  heading: string;
}

export interface AIAssistantNavigationIntent {
  type: 'navigate';
  target: {
    path: string;
    params?: Record<string, string>;
    query?: Record<string, string>;
  };
  reason: string;
  requiresConfirmation: boolean;
}

export interface AIAssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  type: 'answer' | 'question' | 'proposal' | 'result' | 'error';
  content: string;
  citations?: AIAssistantCitation[];
  navigationIntent?: AIAssistantNavigationIntent;
  createdAt: string;
}

export interface AIAssistantSession {
  id: string;
  title: string;
  archived: boolean;
  contextId: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIAssistantMessagesResponse {
  sessionId: string;
  title: string;
  archived: boolean;
  messages: AIAssistantMessage[];
}

export interface AIAssistantRespondResponse {
  type: 'answer' | 'question' | 'proposal' | 'result' | 'error';
  messageId: string;
  sessionId: string;
  message: string;
  citations: AIAssistantCitation[];
  navigationIntent: AIAssistantNavigationIntent | null;
  confidence: 'low' | 'medium' | 'high';
}

async function fetchSessions(params: {
  contextId?: string;
  includeArchived?: boolean;
  limit?: number;
}): Promise<{ sessions: AIAssistantSession[] }> {
  const searchParams = new URLSearchParams();

  if (params.contextId) {
    searchParams.set('contextId', params.contextId);
  }
  if (params.includeArchived !== undefined) {
    searchParams.set('includeArchived', String(params.includeArchived));
  }
  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const response = await fetch(`/api/ai/assistant/sessions?${searchParams}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch sessions');
  }

  return response.json();
}

async function createSession(input: {
  contextId?: string;
  title?: string;
}): Promise<{ session: AIAssistantSession }> {
  const response = await fetch('/api/ai/assistant/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create session');
  }

  return response.json();
}

async function updateSession(input: {
  id: string;
  title?: string;
  archived?: boolean;
}): Promise<{ session: AIAssistantSession }> {
  const response = await fetch(`/api/ai/assistant/sessions/${input.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      archived: input.archived,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update session');
  }

  return response.json();
}

async function fetchMessages(
  sessionId: string,
  limit?: number
): Promise<AIAssistantMessagesResponse> {
  const searchParams = new URLSearchParams();
  if (typeof limit === 'number') {
    searchParams.set('limit', String(limit));
  }

  const suffix = searchParams.toString() ? `?${searchParams}` : '';
  const response = await fetch(`/api/ai/assistant/sessions/${sessionId}/messages${suffix}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch messages');
  }

  return response.json();
}

async function respond(input: {
  sessionId: string;
  message: string;
  contextSnapshot: AIAssistantContextSnapshot;
  model?: string;
}): Promise<AIAssistantRespondResponse> {
  const response = await fetch('/api/ai/assistant/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to send message');
  }

  return response.json();
}

export function useAIHelpbotSessions(params: {
  contextId?: string;
  includeArchived?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-helpbot', 'sessions', params],
    queryFn: () => fetchSessions(params),
    staleTime: 60 * 1000,
  });
}

export function useCreateAIHelpbotSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-helpbot', 'sessions'] });
    },
  });
}

export function useUpdateAIHelpbotSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSession,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-helpbot', 'sessions'] });
      queryClient.invalidateQueries({
        queryKey: ['ai-helpbot', 'messages', variables.id],
      });
    },
  });
}

export function useAIHelpbotMessages(sessionId?: string, limit?: number) {
  return useQuery({
    queryKey: ['ai-helpbot', 'messages', sessionId, limit],
    queryFn: () => fetchMessages(sessionId!, limit),
    enabled: !!sessionId,
    staleTime: 30 * 1000,
  });
}

export function useAIHelpbotRespond() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: respond,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['ai-helpbot', 'messages', variables.sessionId],
      });
      queryClient.invalidateQueries({ queryKey: ['ai-helpbot', 'sessions'] });
    },
  });
}