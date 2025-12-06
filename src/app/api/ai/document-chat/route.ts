import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import {
  sendAIChatMessage,
  draftContent,
  rephraseText,
  explainTerm,
  suggestPlaceholders,
  reviewDocument,
  saveConversation,
  AI_ACTIONS,
  type AIContext,
  type AIChatMessage,
} from '@/services/document-ai.service';
import type { AIModel } from '@/lib/ai';

// ============================================================================
// Validation Schemas
// ============================================================================

const contextSchema = z.object({
  mode: z.enum(['template_editor', 'document_editor']),
  templateCategory: z.string().optional(),
  templateName: z.string().optional(),
  companyContext: z
    .object({
      name: z.string(),
      uen: z.string(),
      entityType: z.string(),
      directors: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
      shareholders: z.array(z.object({ name: z.string(), percentage: z.number() })).default([]),
    })
    .optional(),
  selectedText: z.string().optional(),
  cursorPosition: z.number().optional(),
  surroundingContent: z.string().optional(),
});

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string().optional(),
});

const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  context: contextSchema,
  model: z.string().optional(),
  conversationId: z.string().optional(),
  conversationHistory: z.array(chatMessageSchema).optional(),
  saveHistory: z.boolean().optional().default(false),
  contextId: z.string().optional(), // templateId or documentId for persistence
});

const quickActionSchema = z.object({
  action: z.enum(['draft', 'rephrase', 'explain', 'suggest_placeholders', 'review']),
  input: z.string().min(1, 'Input is required'),
  context: contextSchema,
  model: z.string().optional(),
  style: z.enum(['formal', 'simplified', 'concise', 'detailed']).optional(),
});

// ============================================================================
// POST /api/ai/document-chat - Send chat message
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Ensure tenant ID is present
    if (!session.tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 400 });
    }

    const body = await request.json();

    // Check if this is a quick action or regular chat
    const { searchParams } = new URL(request.url);
    const isQuickAction = searchParams.get('action') === 'quick';

    if (isQuickAction) {
      // Handle quick actions (draft, rephrase, explain, etc.)
      const parsed = quickActionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { action, input, context, model, style } = parsed.data;

      let response;
      switch (action) {
        case 'draft':
          response = await draftContent(
            session.tenantId,
            session.id,
            input,
            context as AIContext,
            model as AIModel | undefined
          );
          break;
        case 'rephrase':
          response = await rephraseText(
            session.tenantId,
            session.id,
            input,
            style || 'formal',
            context as AIContext,
            model as AIModel | undefined
          );
          break;
        case 'explain':
          response = await explainTerm(
            session.tenantId,
            session.id,
            input,
            context as AIContext,
            model as AIModel | undefined
          );
          break;
        case 'suggest_placeholders':
          response = await suggestPlaceholders(
            session.tenantId,
            session.id,
            input,
            context as AIContext,
            model as AIModel | undefined
          );
          break;
        case 'review':
          response = await reviewDocument(
            session.tenantId,
            session.id,
            input,
            context as AIContext,
            model as AIModel | undefined
          );
          break;
        default:
          return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
      }

      return NextResponse.json(response);
    }

    // Regular chat message
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, context, model, conversationId, conversationHistory, saveHistory, contextId } =
      parsed.data;

    // Convert conversation history timestamps
    const history: AIChatMessage[] = (conversationHistory || []).map((msg) => ({
      ...msg,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
    }));

    const response = await sendAIChatMessage({
      tenantId: session.tenantId,
      userId: session.id,
      message,
      context: context as AIContext,
      model: model as AIModel | undefined,
      conversationId,
      conversationHistory: history,
    });

    // Optionally save conversation history
    if (saveHistory && response.conversationId) {
      const updatedHistory: AIChatMessage[] = [
        ...history,
        { role: 'user', content: message, timestamp: new Date() },
        { role: 'assistant', content: response.message, timestamp: new Date() },
      ];

      await saveConversation(
        session.tenantId,
        session.id,
        response.conversationId,
        context.mode === 'template_editor' ? 'template' : 'document',
        contextId,
        updatedHistory
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Document AI chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET /api/ai/document-chat - Get available actions
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    return NextResponse.json({
      actions: AI_ACTIONS.map((action) => ({
        type: action.type,
        label: action.label,
        description: action.description,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
