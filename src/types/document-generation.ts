/**
 * Shared document-generation option types.
 *
 * These types were previously owned by the monolithic generation wizard and
 * are now the single source of truth for templates, companies, contacts,
 * partials, and party options used by the batch workspace and Service
 * Agreement editors.
 */

import type { DocumentParty } from '@/lib/document-party';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';
import type {
  ServiceAgreementItemInput,
} from '@/services/service-agreement/types';

export interface Company {
  id: string;
  name: string;
  uen: string;
  status: string;
  registeredAddress?: string | null;
  incorporationDate?: string | null;
}

export interface DocumentContact {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
}

export interface TemplatePartial {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  content: string;
  placeholders?: unknown;
}

export type DocumentTemplateCompositionType = 'STANDARD' | 'SERVICE_AGREEMENT';

export interface DocumentTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  compositionType: DocumentTemplateCompositionType;
  version: number;
  isActive: boolean;
  content: string;
  contentJson?: unknown;
  placeholders: CustomPlaceholderDefinition[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentPartyOption = DocumentParty;

export type { ServiceAgreementItemInput };
