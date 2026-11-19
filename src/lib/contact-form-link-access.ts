import { NextResponse } from 'next/server';
import type { ZodError } from 'zod';
import { requirePermission } from '@/lib/rbac';
import { resolveEffectiveWorkspaceId } from '@/lib/api-helpers';
import { BadRequestError } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth';

/**
 * Permissions for the KYC/CDD form links of a contact. A form response holds identity documents and
 * answers, so seeing or touching a link needs the Forms read permission as well as the contact one:
 * without `document:read` the whole section is refused (the form titles included).
 */
export async function requireFormLinkPermissions(session: SessionUser, mode: 'read' | 'write'): Promise<void> {
  await requirePermission(session, 'contact', mode === 'read' ? 'read' : 'update');
  await requirePermission(session, 'document', 'read');
}

/** Ids that do not look like ids are a plain "not found", never a server error. */
export const FORM_LINK_NOT_FOUND = ['Invalid id format', 'Invalid linkId format'] as const;

export function invalidBodyResponse(error: ZodError): NextResponse {
  return NextResponse.json(
    { error: 'Validation failed', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) },
    { status: 400 },
  );
}

/** The workspace the request acts in (a super admin may name one); a missing or unknown one is a 400. */
export async function requireFormLinkTenantId(session: SessionUser, requested?: string | null): Promise<string> {
  const resolved = await resolveEffectiveWorkspaceId(session, requested);
  if (resolved.error || !resolved.tenantId) throw new BadRequestError(resolved.error ?? 'Workspace context required');
  return resolved.tenantId;
}
