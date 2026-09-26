// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  $disconnect: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
const rollout = vi.hoisted(() => ({
  buildOakDocRolloutInventory: vi.fn(async () => ({ draftConversionManifest: { hash: 'h' } })),
  applyA4DraftConversionManifest: vi.fn(async () => ({ manifestHash: 'h', results: [] })),
}));
vi.mock('@/services/oakdoc-rollout.service', () => rollout);
const templates = vi.hoisted(() => ({ migrateCanonicalOakDocTemplates: vi.fn() }));
vi.mock('@/services/oakdoc-consolidated-migration.service', () => templates);

import { runOakDocRollout } from '../../scripts/oakdoc-rollout';
import { runTemplateMigration } from '../../scripts/migrate-oakdoc-templates';

const workspace = '11111111-1111-4111-8111-111111111111';
const operator = '22222222-2222-4222-8222-222222222222';
const manifest = 'a'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findFirst.mockResolvedValue({ id: operator });
});

describe('OakDoc rollout CLI', () => {
  it('defaults to a dry run that writes nothing', async () => {
    const result = await runOakDocRollout(['--workspace', workspace]);
    expect(result.mode).toBe('dry-run');
    expect(rollout.buildOakDocRolloutInventory).toHaveBeenCalledWith(workspace);
    expect(rollout.applyA4DraftConversionManifest).not.toHaveBeenCalled();
  });

  it('needs an explicit workspace, operator and manifest to apply', async () => {
    await expect(runOakDocRollout([])).rejects.toThrow('--workspace');
    await expect(runOakDocRollout(['--workspace', workspace, '--apply-draft-conversions', '--operator', operator]))
      .rejects.toThrow('--manifest');
    await expect(runOakDocRollout(['--workspace', workspace, '--apply-draft-conversions', '--manifest', manifest]))
      .rejects.toThrow('--operator');
    expect(rollout.applyA4DraftConversionManifest).not.toHaveBeenCalled();

    await runOakDocRollout([
      '--workspace', workspace, '--apply-draft-conversions', '--operator', operator, '--manifest', manifest,
    ]);
    expect(rollout.applyA4DraftConversionManifest).toHaveBeenCalledWith({
      tenantId: workspace,
      userId: operator,
      manifestHash: manifest,
    });
  });
});

describe('OakDoc template migration CLI', () => {
  it('requires an explicit workspace and active operator, and only writes with --apply', async () => {
    await expect(runTemplateMigration(['--workspace', workspace])).rejects.toThrow('--operator');

    const dryRun = await runTemplateMigration(['--workspace', workspace, '--operator', operator]);
    expect(dryRun.mode).toBe('dry-run');
    expect(templates.migrateCanonicalOakDocTemplates).not.toHaveBeenCalled();

    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    await expect(runTemplateMigration(['--workspace', workspace, '--operator', operator, '--apply']))
      .rejects.toThrow('operator');

    templates.migrateCanonicalOakDocTemplates.mockResolvedValue({ standard: {}, serviceAgreement: {} });
    const applied = await runTemplateMigration(['--workspace', workspace, '--operator', operator, '--apply']);
    expect(applied.mode).toBe('apply');
    expect(templates.migrateCanonicalOakDocTemplates).toHaveBeenCalledWith({ tenantId: workspace, userId: operator });
  });
});
