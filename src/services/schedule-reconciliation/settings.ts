import { z } from 'zod';
import { NotFoundError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

export type ServiceWorkspaceFlags = {
  workspaceEnabled: boolean;
  deadlineWritesEnabled: boolean;
};

export function getServiceWorkspaceFlags(settings: unknown): ServiceWorkspaceFlags {
  const workspaceSettingsSchema = z.object({
    servicesWorkspace: z.object({
      enabled: z.boolean().optional(),
      deadlineWritesEnabled: z.boolean().optional(),
    }).optional(),
  }).passthrough();
  const parsed = workspaceSettingsSchema.safeParse(settings);
  return {
    workspaceEnabled: parsed.success ? parsed.data.servicesWorkspace?.enabled ?? true : true,
    deadlineWritesEnabled: parsed.success
      ? parsed.data.servicesWorkspace?.deadlineWritesEnabled ?? process.env.DEADLINE_OCCURRENCE_WRITES_ENABLED === 'true'
      : process.env.DEADLINE_OCCURRENCE_WRITES_ENABLED === 'true',
  };
}

export async function getServiceWorkspaceFlagsForTenant(
  tenantId: string,
  db: { workspace: { findUnique: (args: { where: { id: string }; select: { settings: true } }) => Promise<{ settings: unknown } | null> } } = prisma,
): Promise<ServiceWorkspaceFlags> {
  const workspace = await db.workspace.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  return getServiceWorkspaceFlags(workspace?.settings);
}

export async function requireServicesWorkspaceEnabled(
  tenantId: string,
  db: { workspace: { findUnique: (args: { where: { id: string }; select: { settings: true } }) => Promise<{ settings: unknown } | null> } } = prisma,
): Promise<void> {
  const flags = await getServiceWorkspaceFlagsForTenant(tenantId, db);
  if (!flags.workspaceEnabled) {
    throw new NotFoundError('Services workspace is disabled for this workspace');
  }
}
