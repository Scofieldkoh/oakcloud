/**
 * Shared mappers for the option endpoints consumed by the document generation
 * workspace. Kept in one place so the page loader and the in-workspace search
 * hooks cannot drift apart on field naming (`name` vs `fullName`).
 */

import {
  normalizeStoredPlaceholders,
  storageFormatToCustomPlaceholders,
} from '@/lib/template-analysis';
import type {
  Company,
  DocumentContact,
  DocumentTemplateSummary,
} from '@/types/document-generation';

export function mapCompanyOption(raw: Record<string, unknown>): Company {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    uen: String(raw.uen ?? ''),
    status: String(raw.status ?? ''),
    registeredAddress: raw.registeredAddress ? String(raw.registeredAddress) : null,
    incorporationDate: raw.incorporationDate ? String(raw.incorporationDate) : null,
  };
}

export function mapContactOption(raw: Record<string, unknown>): DocumentContact {
  return {
    id: String(raw.id),
    fullName: String(raw.name ?? raw.fullName ?? ''),
    email: raw.email ? String(raw.email) : null,
    phone: raw.phone ? String(raw.phone) : null,
    designation: raw.designation ? String(raw.designation) : null,
  };
}

export function mapTemplateSummary(raw: Record<string, unknown>): DocumentTemplateSummary {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : null,
    category: String(raw.category ?? 'OTHER'),
    compositionType: raw.compositionType === 'SERVICE_AGREEMENT'
      ? 'SERVICE_AGREEMENT'
      : 'STANDARD',
    version: Number(raw.version ?? 1),
    isActive: raw.isActive !== false,
    content: String(raw.content ?? ''),
    contentJson: raw.contentJson ?? undefined,
    placeholders: storageFormatToCustomPlaceholders(
      normalizeStoredPlaceholders(raw.placeholders),
    ),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}
