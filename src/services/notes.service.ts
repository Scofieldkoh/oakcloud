/**
 * Notes Service
 *
 * Business logic for managing internal notes with multi-tab support.
 * Handles CRUD operations for note tabs on companies and contacts.
 */

import { prisma } from '@/lib/prisma';
import { createAuditLog, type AuditContext } from '@/lib/audit';
import type { NoteTab } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export type EntityType = 'company' | 'contact';

export interface NoteTabData {
  id: string;
  title: string;
  content: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateNoteTabInput {
  title?: string;
  content?: string;
}

export interface UpdateNoteTabInput {
  title?: string;
  content?: string;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all note tabs for an entity (company or contact)
 */
export async function getNoteTabs(
  entityType: EntityType,
  entityId: string
): Promise<NoteTabData[]> {
  const where =
    entityType === 'company' ? { companyId: entityId } : { contactId: entityId };

  const tabs = await prisma.noteTab.findMany({
    where,
    orderBy: { order: 'asc' },
  });

  return tabs;
}

/**
 * Get a single note tab by ID
 */
export async function getNoteTabById(tabId: string): Promise<NoteTab | null> {
  return prisma.noteTab.findUnique({
    where: { id: tabId },
  });
}

// ============================================================================
// Mutation Functions
// ============================================================================

/**
 * Create a new note tab
 */
export async function createNoteTab(
  entityType: EntityType,
  entityId: string,
  input: CreateNoteTabInput,
  auditContext?: AuditContext
): Promise<NoteTab> {
  // Get the next order number
  const where =
    entityType === 'company' ? { companyId: entityId } : { contactId: entityId };

  const maxOrder = await prisma.noteTab.aggregate({
    where,
    _max: { order: true },
  });

  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const data: Parameters<typeof prisma.noteTab.create>[0]['data'] = {
    title: input.title || 'General',
    content: input.content || null,
    order: nextOrder,
    ...(entityType === 'company'
      ? { company: { connect: { id: entityId } } }
      : { contact: { connect: { id: entityId } } }),
  };

  const tab = await prisma.noteTab.create({ data });

  // Audit log
  if (auditContext) {
    await createAuditLog({
      ...auditContext,
      action: 'CREATE',
      entityType: 'NoteTab',
      entityId: tab.id,
      entityName: tab.title,
      metadata: { title: tab.title, parentEntityType: entityType, parentEntityId: entityId },
    });
  }

  return tab;
}

/**
 * Update a note tab (title or content)
 */
export async function updateNoteTab(
  tabId: string,
  input: UpdateNoteTabInput,
  auditContext?: AuditContext
): Promise<NoteTab> {
  const existingTab = await prisma.noteTab.findUnique({
    where: { id: tabId },
  });

  if (!existingTab) {
    throw new Error('Note tab not found');
  }

  const updateData: Parameters<typeof prisma.noteTab.update>[0]['data'] = {};

  if (input.title !== undefined) {
    updateData.title = input.title;
  }
  if (input.content !== undefined) {
    updateData.content = input.content;
  }

  const tab = await prisma.noteTab.update({
    where: { id: tabId },
    data: updateData,
  });

  // Audit log
  if (auditContext) {
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (input.title !== undefined && input.title !== existingTab.title) {
      changes.title = { old: existingTab.title, new: input.title };
    }
    // Don't log content changes in detail (can be large)
    if (input.content !== undefined && input.content !== existingTab.content) {
      changes.content = { old: '[previous]', new: '[updated]' };
    }

    if (Object.keys(changes).length > 0) {
      await createAuditLog({
        ...auditContext,
        action: 'UPDATE',
        entityType: 'NoteTab',
        entityId: tabId,
        entityName: tab.title,
        changes,
      });
    }
  }

  return tab;
}

/**
 * Delete a note tab
 */
export async function deleteNoteTab(
  tabId: string,
  auditContext?: AuditContext
): Promise<void> {
  const tab = await prisma.noteTab.findUnique({
    where: { id: tabId },
  });

  if (!tab) {
    throw new Error('Note tab not found');
  }

  await prisma.noteTab.delete({
    where: { id: tabId },
  });

  // Audit log
  if (auditContext) {
    await createAuditLog({
      ...auditContext,
      action: 'DELETE',
      entityType: 'NoteTab',
      entityId: tabId,
      entityName: tab.title,
    });
  }
}

/**
 * Reorder note tabs
 */
export async function reorderNoteTabs(
  tabIds: string[],
  auditContext?: AuditContext
): Promise<void> {
  await prisma.$transaction(
    tabIds.map((id, index) =>
      prisma.noteTab.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  if (auditContext) {
    await createAuditLog({
      ...auditContext,
      action: 'UPDATE',
      entityType: 'NoteTab',
      entityId: tabIds[0],
      metadata: { reordered: tabIds },
    });
  }
}

/**
 * Check if a note tab belongs to an entity
 */
export async function verifyNoteTabOwnership(
  tabId: string,
  entityType: EntityType,
  entityId: string
): Promise<boolean> {
  const tab = await prisma.noteTab.findUnique({
    where: { id: tabId },
  });

  if (!tab) return false;

  if (entityType === 'company') {
    return tab.companyId === entityId;
  } else {
    return tab.contactId === entityId;
  }
}
