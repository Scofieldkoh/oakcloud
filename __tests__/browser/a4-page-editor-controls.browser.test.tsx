import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { A4PageEditor } from '@/components/documents/a4-page-editor';
import '@/app/globals.css';

declare global {
  // React's act() checks this flag on globalThis to enable act environment.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('A4PageEditor page controls', () => {
  let host: HTMLDivElement;
  let root: Root;
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
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

  it('keeps delete controls visible within the page bounds without requiring hover', async () => {
    await act(async () => {
      root.render(
        <A4PageEditor
          value={'<p>First page</p><div class="page-break" data-page-break="true"></div><p>Second page</p>'}
        />,
      );
    });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const deleteControls = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button[title="Delete page"]'),
    );
    expect(deleteControls).toHaveLength(2);
    deleteControls.forEach((control) => {
      expect(getComputedStyle(control).opacity).toBe('1');
      const controlBounds = control.getBoundingClientRect();
      const pageBounds = control.parentElement!.getBoundingClientRect();
      expect(controlBounds.right).toBeLessThanOrEqual(pageBounds.right);
      expect(controlBounds.left).toBeGreaterThanOrEqual(pageBounds.left);
    });
  });
});
