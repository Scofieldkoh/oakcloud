import type { DocumentTemplateSummary } from '@/types/document-generation';

/** Why a preset member cannot be added to a generation batch right now. */
export type DocumentTemplatePresetUnavailableReason = 'deleted' | 'inactive' | 'not-word';

export interface DocumentTemplatePresetItemDto {
  /** The template as saved in the preset. */
  templateId: string;
  /**
   * The template to add to a batch: the same one, or the Word replacement of a
   * saved A4 template. Loading always uses its current version and name.
   */
  resolvedTemplateId: string;
  templateName: string;
  available: boolean;
  /** Current generation metadata, only for available templates. */
  template?: DocumentTemplateSummary;
  unavailableReason?: DocumentTemplatePresetUnavailableReason;
}

export interface DocumentTemplatePresetDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** In batch order; the same template may repeat. */
  items: DocumentTemplatePresetItemDto[];
}

/** Most templates a preset (and a batch) can hold. */
export const DOCUMENT_TEMPLATE_PRESET_MAX_ITEMS = 20;
export const DOCUMENT_TEMPLATE_PRESET_MAX_NAME_LENGTH = 100;
