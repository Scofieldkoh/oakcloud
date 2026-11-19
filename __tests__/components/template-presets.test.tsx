import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/toast';
import { TemplatePresets, type TemplatePresetsProps } from '@/components/documents/generation-batch/template-presets';
import { BatchTemplatePicker } from '@/components/documents/generation-batch/batch-template-picker';
import { createInitialBatchWorkspaceState, type EditableBatchItem } from '@/components/documents/generation-batch/batch-workspace-state';
import type { DocumentTemplateSummary } from '@/types/document-generation';
import type { DocumentTemplatePresetDto, DocumentTemplatePresetItemDto } from '@/types/document-template-preset';

function template(id: string, name: string, overrides: Partial<DocumentTemplateSummary> = {}): DocumentTemplateSummary {
  return {
    id,
    name,
    description: null,
    category: 'OTHER',
    compositionType: 'STANDARD',
    version: 1,
    isActive: true,
    engine: 'OAKDOC',
    content: '',
    placeholders: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const convening = template('t-convene', 'Board Resolution - Convening of AGM');
const notice = template('t-notice', 'Notice of Annual General Meeting');
const minutes = template('t-minutes', 'Minutes of Annual General Meeting');
const attendance = template('t-attendance', 'AGM Attendance List');
const catalogue = [convening, notice, minutes, attendance];

function member(source: DocumentTemplateSummary, overrides: Partial<DocumentTemplatePresetItemDto> = {}): DocumentTemplatePresetItemDto {
  return { templateId: source.id, resolvedTemplateId: source.id, templateName: source.name, available: true, ...overrides };
}

function preset(id: string, name: string, items: DocumentTemplatePresetItemDto[]): DocumentTemplatePresetDto {
  return { id, name, version: 1, createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T01:00:00.000Z', items };
}

const agm = () => preset('p-agm', 'AGM pack', catalogue.map((entry) => member(entry)));

function selectedItem(source: DocumentTemplateSummary, key = source.id): EditableBatchItem {
  return { ...createInitialBatchWorkspaceState([source]).batch.items[0], key };
}

interface ApiCall { method: string; url: string; body?: Record<string, unknown> }

function mockApi(initial: DocumentTemplatePresetDto[], failures: Record<string, { status: number; error: string }> = {}) {
  let presets = [...initial];
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, url, body });
    const failure = failures[method];
    if (failure) return new Response(JSON.stringify({ error: failure.error }), { status: failure.status });
    if (method === 'GET') return Response.json({ presets });
    if (method === 'POST') {
      const created = preset('p-new', String(body?.name), (body?.templateIds as string[]).map((id) => member(catalogue.find((entry) => entry.id === id)!)));
      presets = [...presets, created];
      return Response.json({ id: created.id }, { status: 201 });
    }
    if (method === 'PATCH') return Response.json({ id: presets[0].id });
    if (method === 'DELETE') {
      const id = url.split('/').pop();
      presets = presets.filter((entry) => entry.id !== id);
      return Response.json({ success: true });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, writes: () => calls.filter((call) => call.method !== 'GET'), setPresets: (rows: DocumentTemplatePresetDto[]) => { presets = rows; } };
}

function setup(overrides: Partial<TemplatePresetsProps> = {}) {
  const props: TemplatePresetsProps = {
    templates: catalogue,
    selected: [],
    maxDocuments: 20,
    onAddMany: vi.fn(),
    ...overrides,
  };
  const view = render(<ToastProvider><TemplatePresets {...props} /></ToastProvider>);
  return { props, user: userEvent.setup(), ...view };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Template presets' }));
}

describe('TemplatePresets', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads the AGM preset into an empty selection as four templates in preset order with one click', async () => {
    mockApi([agm()]);
    const { props, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /AGM pack/ }));

    await waitFor(() => expect(props.onAddMany).toHaveBeenCalledTimes(1));
    expect(vi.mocked(props.onAddMany).mock.calls[0][0].map((entry) => entry.id)).toEqual(['t-convene', 't-notice', 't-minutes', 't-attendance']);
    expect(await screen.findByText('Added 4 templates from “AGM pack”.')).toBeInTheDocument();
  });

  it('only sends the preset templates, so existing selections are appended to and not replaced', async () => {
    mockApi([agm()]);
    const existing = [selectedItem(template('t-existing', 'Existing Letter'))];
    const { props, user } = setup({ selected: existing });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /AGM pack/ }));
    await waitFor(() => expect(props.onAddMany).toHaveBeenCalled());
    expect(vi.mocked(props.onAddMany).mock.calls[0][0]).toHaveLength(4);
  });

  it('adds what is available and names each skipped template with its reason', async () => {
    const stale = preset('p-stale', 'AGM pack', [
      member(convening),
      member(notice, { available: false, unavailableReason: 'inactive' }),
      member(minutes),
      member(attendance, { available: false, unavailableReason: 'deleted' }),
    ]);
    mockApi([stale]);
    const { props, user } = setup();
    await openMenu(user);
    expect(await screen.findByRole('menuitem', { name: /AGM pack.*2 unavailable/ })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /AGM pack/ }));

    await waitFor(() => expect(props.onAddMany).toHaveBeenCalled());
    expect(vi.mocked(props.onAddMany).mock.calls[0][0].map((entry) => entry.id)).toEqual(['t-convene', 't-minutes']);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Added 2 of 4 templates from “AGM pack”.');
    expect(alert).toHaveTextContent(`${notice.name} (inactive)`);
    expect(alert).toHaveTextContent(`${attendance.name} (deleted)`);
  });

  it('respects the 20 document cap and reports the overflow', async () => {
    mockApi([agm()]);
    const eighteen = Array.from({ length: 18 }, (_, index) => selectedItem(template(`x-${index}`, `Filler ${index}`)));
    const { props, user } = setup({ selected: eighteen });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /AGM pack/ }));
    await waitFor(() => expect(props.onAddMany).toHaveBeenCalled());
    expect(vi.mocked(props.onAddMany).mock.calls[0][0].map((entry) => entry.id)).toEqual(['t-convene', 't-notice']);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`${minutes.name} (over the 20 document limit)`);
    expect(alert).toHaveTextContent(`${attendance.name} (over the 20 document limit)`);
  });

  it('refreshes the preset when loading so a template deactivated since the page opened is skipped', async () => {
    const api = mockApi([agm()]);
    const { props, user } = setup();
    await openMenu(user);
    await screen.findByRole('menuitem', { name: /AGM pack/ });
    const getsBefore = api.calls.filter((call) => call.method === 'GET').length;
    const changed = agm();
    changed.items[1] = member(notice, { available: false, unavailableReason: 'inactive' });
    api.setPresets([changed]);
    await user.click(screen.getByRole('menuitem', { name: /AGM pack/ }));
    await waitFor(() => expect(props.onAddMany).toHaveBeenCalled());
    expect(api.calls.filter((call) => call.method === 'GET').length).toBe(getsBefore + 1);
    expect(vi.mocked(props.onAddMany).mock.calls[0][0].map((entry) => entry.id)).toEqual(['t-convene', 't-minutes', 't-attendance']);
    expect(screen.getByRole('alert')).toHaveTextContent(`${notice.name} (inactive)`);
  });

  it.each(['locked', 'full'] as const)('checks the current selection after an in-flight load (%s)', async (change) => {
    mockApi([agm()]);
    const { props, user, rerender } = setup();
    await openMenu(user);
    await screen.findByRole('menuitem', { name: /AGM pack/ });
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole('menuitem', { name: /AGM pack/ }));
    const updated = change === 'locked'
      ? { ...props, disabled: true }
      : { ...props, selected: Array.from({ length: 20 }, (_, i) => selectedItem(notice, `existing-${i}`)) };
    rerender(<ToastProvider><TemplatePresets {...updated} /></ToastProvider>);
    finish(Response.json({ presets: [agm()] }));
    if (change === 'full') expect(await screen.findByRole('alert')).toHaveTextContent('No templates were added');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Template presets' })).toBeInTheDocument());
    expect(props.onAddMany).not.toHaveBeenCalled();
  });

  it('does not load when the composition is locked', async () => {
    mockApi([agm()]);
    const { props, user } = setup({ disabled: true });
    await openMenu(user);
    const item = await screen.findByRole('menuitem', { name: /AGM pack/ });
    expect(item).toBeDisabled();
    await user.click(item);
    expect(props.onAddMany).not.toHaveBeenCalled();
  });

  it('tells the user when a preset adds nothing', async () => {
    const empty = preset('p-gone', 'Gone', [member(notice, { available: false, unavailableReason: 'deleted' })]);
    mockApi([empty]);
    const { props, user } = setup();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /Gone/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No templates were added from “Gone”.');
    expect(props.onAddMany).not.toHaveBeenCalled();
  });

  it('shows an empty state and a load failure without breaking the menu', async () => {
    mockApi([]);
    const first = setup();
    await openMenu(first.user);
    expect(await screen.findByText('No presets yet')).toBeInTheDocument();
    first.unmount();

    mockApi([], { GET: { status: 500, error: 'boom' } });
    const second = setup();
    await openMenu(second.user);
    expect(await screen.findByText('Presets could not be loaded')).toBeInTheDocument();
  });

  describe('saving', () => {
    it('cannot save an empty selection', async () => {
      mockApi([]);
      const { user } = setup({ selected: [] });
      await openMenu(user);
      expect(await screen.findByRole('menuitem', { name: /Save selection as preset/ })).toBeDisabled();
    });

    it('saves the current ordered selection, repeats included, under the chosen name', async () => {
      const api = mockApi([]);
      const selected = [selectedItem(notice), selectedItem(minutes), selectedItem(notice, 't-notice~2')];
      const { user } = setup({ selected });
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Save selection as preset/ }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: 'Save preset' })).toBeDisabled();
      await user.type(within(dialog).getByLabelText('Preset name'), '  Short AGM  ');
      await user.click(within(dialog).getByRole('button', { name: 'Save preset' }));

      await waitFor(() => expect(api.writes()).toHaveLength(1));
      expect(api.writes()[0]).toMatchObject({
        method: 'POST',
        url: '/api/document-template-presets',
        body: { name: 'Short AGM', templateIds: ['t-notice', 't-minutes', 't-notice'] },
      });
      expect(Object.keys(api.writes()[0].body ?? {}).sort()).toEqual(['name', 'templateIds']);
      expect(await screen.findByText('Saved preset “Short AGM”')).toBeInTheDocument();
    });

    it('asks before overwriting a preset with the same name, then replaces its templates', async () => {
      const api = mockApi([agm()]);
      const { user } = setup({ selected: [selectedItem(notice)] });
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Save selection as preset/ }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Preset name'), ' agm  PACK');
      await user.click(within(dialog).getByRole('button', { name: 'Save preset' }));

      const confirm = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog', { name: /Replace preset/ }));
      expect(api.writes()).toHaveLength(0);
      await user.click(within(confirm).getByRole('button', { name: 'Replace preset' }));

      await waitFor(() => expect(api.writes()).toHaveLength(1));
      expect(api.writes()[0]).toMatchObject({
        method: 'PATCH',
        url: '/api/document-template-presets/p-agm',
        body: { templateIds: ['t-notice'], expectedVersion: 1 },
      });
    });

    it('binds replacement to the confirmed version and requires refresh and reconfirmation after a conflict', async () => {
      const failures = { PATCH: { status: 409, error: 'This preset was changed by someone else.' } };
      const api = mockApi([agm()], failures);
      const { user } = setup({ selected: [selectedItem(notice)] });
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Save selection as preset/ }));
      await user.type(within(await screen.findByRole('dialog')).getByLabelText('Preset name'), 'AGM pack');
      await user.click(screen.getByRole('button', { name: 'Save preset' }));
      await screen.findByRole('dialog', { name: /Replace preset/ });

      // Another writer changes the preset after our confirmation was prepared.
      api.setPresets([{ ...agm(), version: 2 }]);
      await user.click(screen.getByRole('button', { name: 'Replace preset' }));
      await waitFor(() => expect(api.writes()).toHaveLength(1));
      expect(api.writes()[0].body).toEqual({ templateIds: ['t-notice'], expectedVersion: 1 });
      const saveDialog = await screen.findByRole('dialog', { name: 'Save selection as preset' });
      expect(within(saveDialog).getByRole('alert')).toHaveTextContent(/refresh.*confirm/i);
      expect(screen.queryByRole('dialog', { name: /Replace preset/ })).not.toBeInTheDocument();
      expect(api.writes()).toHaveLength(1); // No automatic retry using the new version.

      await user.click(within(saveDialog).getByRole('button', { name: 'Save preset' }));
      await screen.findByRole('dialog', { name: /Replace preset/ });
      expect(api.writes()).toHaveLength(1); // Refresh still requires explicit confirmation.
      delete (failures as Partial<typeof failures>).PATCH;
      await user.click(screen.getByRole('button', { name: 'Replace preset' }));
      await waitFor(() => expect(api.writes()).toHaveLength(2));
      expect(api.writes()[1].body).toEqual({ templateIds: ['t-notice'], expectedVersion: 2 });
      expect(await screen.findByText('Saved preset “AGM pack”')).toBeInTheDocument();
    });

    it('does not overwrite when the confirmation is cancelled', async () => {
      const api = mockApi([agm()]);
      const { user } = setup({ selected: [selectedItem(notice)] });
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Save selection as preset/ }));
      await user.type(within(await screen.findByRole('dialog')).getByLabelText('Preset name'), 'AGM pack');
      await user.click(screen.getByRole('button', { name: 'Save preset' }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      expect(api.writes()).toHaveLength(0);
    });

    it('shows the server message and keeps the dialog open when saving fails', async () => {
      mockApi([], { POST: { status: 400, error: 'One or more templates can’t be used in a preset' } });
      const { user } = setup({ selected: [selectedItem(notice)] });
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Save selection as preset/ }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Preset name'), 'Bad');
      await user.click(within(dialog).getByRole('button', { name: 'Save preset' }));
      expect(await screen.findByText('One or more templates can’t be used in a preset')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('deleting', () => {
    async function openManage(user: ReturnType<typeof userEvent.setup>) {
      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /Manage presets/ }));
      return screen.findByRole('dialog', { name: /Manage presets/ });
    }

    it('deletes a preset only after confirmation', async () => {
      const api = mockApi([agm()]);
      const { user } = setup();
      const manage = await openManage(user);
      await user.click(within(manage).getByRole('button', { name: 'Delete preset AGM pack' }));

      expect(api.writes()).toHaveLength(0);
      const confirm = await screen.findByText('Delete this preset?');
      expect(confirm).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Delete preset' }));

      await waitFor(() => expect(api.writes()).toHaveLength(1));
      expect(api.writes()[0]).toMatchObject({ method: 'DELETE', url: '/api/document-template-presets/p-agm' });
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete preset AGM pack' })).not.toBeInTheDocument());
    });

    it('keeps the preset when the confirmation is cancelled', async () => {
      const api = mockApi([agm()]);
      const { user } = setup();
      const manage = await openManage(user);
      await user.click(within(manage).getByRole('button', { name: 'Delete preset AGM pack' }));
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      expect(api.writes()).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Delete preset AGM pack' })).toBeInTheDocument();
    });

    it('lists unavailable members so the preset can be tidied up', async () => {
      mockApi([preset('p-1', 'Old', [member(notice, { available: false, unavailableReason: 'not-word' }), member(minutes)])]);
      const { user } = setup();
      const manage = await openManage(user);
      expect(within(manage).getByText(/1 unavailable/)).toBeInTheDocument();
    });
  });
});

describe('BatchTemplatePicker presets row', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  const pickerProps = {
    templates: catalogue,
    selected: [] as EditableBatchItem[],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
  };

  it('is not shown unless the workspace wires it in, so the Word picker is unchanged', () => {
    render(<BatchTemplatePicker {...pickerProps} />);
    expect(screen.queryByRole('button', { name: 'Template presets' })).not.toBeInTheDocument();
  });

  it('is shown in the batch panel when wired in', async () => {
    mockApi([]);
    render(<ToastProvider><BatchTemplatePicker {...pickerProps} onAddMany={vi.fn()} /></ToastProvider>);
    const panel = screen.getByRole('region', { name: 'Documents in this batch' });
    expect(within(panel).getByRole('button', { name: 'Template presets' })).toBeInTheDocument();
  });
});
