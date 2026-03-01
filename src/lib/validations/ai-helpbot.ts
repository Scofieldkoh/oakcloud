import { z } from 'zod';

export const aiCitationSchema = z.object({
  sourcePath: z.string().min(1),
  heading: z.string().min(1),
});

export const aiNavigationIntentSchema = z.object({
  type: z.literal('navigate'),
  target: z.object({
    path: z.string().min(1),
    params: z.record(z.string(), z.string()).optional(),
    query: z.record(z.string(), z.string()).optional(),
  }),
  reason: z.string().min(1),
  requiresConfirmation: z.boolean(),
});

export const aiContextSnapshotSchema = z.object({
  tenantId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  requestId: z.string().min(1),
  capturedAt: z.string().datetime(),
  route: z.object({
    path: z.string().min(1),
    module: z.string().min(1),
    params: z.record(z.string(), z.string()).optional(),
    query: z.record(z.string(), z.string()).optional(),
  }),
  scope: z
    .object({
      companyId: z.string().uuid().optional(),
      documentId: z.string().uuid().optional(),
      workflowProjectId: z.string().uuid().optional(),
      deadlineId: z.string().uuid().optional(),
    })
    .default({}),
  selection: z
    .object({
      selectedIds: z.array(z.string()).default([]),
      activeTab: z.string().optional(),
      focusedField: z.string().optional(),
    })
    .default({ selectedIds: [] }),
  uiState: z
    .object({
      filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      sort: z
        .object({
          key: z.string(),
          direction: z.enum(['asc', 'desc']),
        })
        .optional(),
      pagination: z
        .object({
          page: z.number().int().min(1),
          limit: z.number().int().min(1),
        })
        .optional(),
      formDraft: z.record(z.unknown()).optional(),
      locale: z.string().optional(),
      timezone: z.string().optional(),
    })
    .default({}),
  entityRevisions: z
    .array(
      z.object({
        entityType: z.string().min(1),
        entityId: z.string().min(1),
        revisionToken: z.string().min(1),
      })
    )
    .optional(),
  capabilities: z.object({
    canRead: z.array(z.string()).default([]),
    canWrite: z.array(z.string()).default([]),
    canApprove: z.array(z.string()).default([]),
  }),
});

export const aiAssistantCreateSessionSchema = z.object({
  contextId: z.string().uuid().optional(),
  title: z.string().min(1).max(120).optional(),
});

export const aiAssistantListSessionsSchema = z.object({
  contextId: z.string().uuid().optional(),
  includeArchived: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const aiAssistantPatchSessionSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined, {
    message: 'At least one field is required',
  });

export const aiAssistantMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const aiAssistantRespondSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(8000),
  contextSnapshot: aiContextSnapshotSchema,
  attachments: z
    .array(
      z.object({
        fileId: z.string().uuid(),
      })
    )
    .optional()
    .default([]),
  model: z.string().optional(),
});

export type AIAssistantContextSnapshot = z.infer<typeof aiContextSnapshotSchema>;
export type AIAssistantNavigationIntent = z.infer<typeof aiNavigationIntentSchema>;
export type AIAssistantRespondInput = z.infer<typeof aiAssistantRespondSchema>;