import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('template partials route and access', () => {
  it('uses document permissions instead of workspace-admin role gating', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/(dashboard)/template-partials/page.tsx'),
      'utf8'
    );

    expect(source).toContain("import { usePermissions } from '@/hooks/use-permissions'");
    expect(source).toContain('canCreate={can.createDocument}');
    expect(source).toContain('canUpdate={can.updateDocument}');
    expect(source).toContain('canDelete={can.deleteDocument}');
    expect(source).not.toContain('const canManage =');
    expect(source).not.toContain('session?.isWorkspaceAdmin');
  });

  it('redirects the legacy admin route and preserves query parameters', async () => {
    const { default: LegacyTemplatePartialsPage } = await import(
      '@/app/(dashboard)/admin/template-partials/page'
    );

    await LegacyTemplatePartialsPage({
      searchParams: Promise.resolve({ tab: 'partials', tag: ['one', 'two'] }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/template-partials?tab=partials&tag=one&tag=two');
  });
});
