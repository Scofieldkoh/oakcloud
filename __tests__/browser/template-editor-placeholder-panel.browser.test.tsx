import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { userEvent } from 'vitest/browser';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { PlaceholderPanel } from '@/components/documents/template-editor/placeholder-panel';
import type { CustomPlaceholderDefinition } from '@/types/placeholders';

const existingField: CustomPlaceholderDefinition = {
  id: 'existing-field',
  key: 'reference_number',
  label: 'Reference number',
  type: 'text',
  required: true,
};

describe('template editor custom fields browser workflow', () => {
  let host: HTMLDivElement;
  let root: Root;
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('removes a custom field through its rendered delete control', async () => {
    const onCustomPlaceholdersChange = vi.fn();

    await act(async () => {
      root.render(
        <PlaceholderPanel
          onInsert={vi.fn()}
          partials={[]}
          isLoadingPartials={false}
          customPlaceholders={[existingField]}
          onCustomPlaceholdersChange={onCustomPlaceholdersChange}
        />,
      );
    });

    const deleteButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Delete Reference number',
    );
    expect(deleteButton).toBeTruthy();

    await act(async () => userEvent.click(deleteButton!));

    expect(onCustomPlaceholdersChange).toHaveBeenCalledWith([]);
  });
});
