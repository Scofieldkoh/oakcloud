import { z } from 'zod';
import {
  DOCUMENT_TEMPLATE_PRESET_MAX_ITEMS,
  DOCUMENT_TEMPLATE_PRESET_MAX_NAME_LENGTH,
} from '@/types/document-template-preset';

const presetNameSchema = z
  .string()
  .trim()
  .min(1, 'Preset name is required')
  .max(DOCUMENT_TEMPLATE_PRESET_MAX_NAME_LENGTH, `Preset name must be at most ${DOCUMENT_TEMPLATE_PRESET_MAX_NAME_LENGTH} characters`);

/** Order is meaningful and the same template may repeat, like the batch picker. */
const presetTemplateIdsSchema = z
  .array(z.string().uuid('Template ID is invalid'))
  .min(1, 'Choose at least one template')
  .max(DOCUMENT_TEMPLATE_PRESET_MAX_ITEMS, `A preset can hold at most ${DOCUMENT_TEMPLATE_PRESET_MAX_ITEMS} templates`);

// Strict: the workspace and the author come from the session, never the client.
export const createDocumentTemplatePresetSchema = z
  .object({
    name: presetNameSchema,
    templateIds: presetTemplateIdsSchema,
  })
  .strict();

export const updateDocumentTemplatePresetSchema = z
  .object({
    name: presetNameSchema.optional(),
    templateIds: presetTemplateIdsSchema.optional(),
    /** The version originally read/confirmed; every successful PATCH advances it. */
    expectedVersion: z.number().int().positive().max(2147483647),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.templateIds !== undefined, {
    message: 'Provide a new name or templates',
  });

export const documentTemplatePresetIdSchema = z.string().uuid('Preset ID is invalid');

export type CreateDocumentTemplatePresetInput = z.infer<typeof createDocumentTemplatePresetSchema>;
export type UpdateDocumentTemplatePresetInput = z.infer<typeof updateDocumentTemplatePresetSchema>;
