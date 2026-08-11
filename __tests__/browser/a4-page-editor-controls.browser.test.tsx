import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page, userEvent } from 'vitest/browser';
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
import { A4PageEditor } from '@/components/documents/a4-page-editor';
import '@/app/globals.css';

declare global {
  // React's act() checks this flag on globalThis to enable act environment.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe('A4PageEditor page controls', () => {
  let host: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;
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
    consoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      const message = args.map(String).join(' ');
      if (message.includes('not wrapped in act')) {
        throw new Error(`Unexpected React act warning: ${message}`);
      }
      if (message.includes('download the React DevTools')) return;
      throw new Error(`Unexpected console.error: ${message}`);
    });
  });

  afterEach(async () => {
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    consoleError.mockRestore();
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
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    const deleteControls = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        'button[title="Delete explicit page section"]',
      ),
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

  it('removes a hard page break from the visible break control and keeps the content', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <A4PageEditor
          value={
            '<p>First page</p><div class="page-break" data-break-type="hard"></div><p>Second page</p>'
          }
          onChange={onChange}
        />,
      );
    });
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    const removeBreak = Array.from(host.querySelectorAll('button')).find(
      (button) =>
        button.getAttribute('aria-label') ===
        'Remove page break before page 2',
    );
    expect(removeBreak).toBeTruthy();
    expect(
      Array.from(host.querySelectorAll('button')).some(
        (button) =>
          button.getAttribute('aria-label') ===
          'Remove page break before page 1',
      ),
    ).toBe(false);

    await act(async () => userEvent.click(removeBreak!));
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    expect(
      host.querySelectorAll('[data-testid^="a4-page-content-"]').length,
    ).toBe(1);
    expect(
      new DOMParser()
        .parseFromString(
          host.querySelector(
            '[data-testid="a4-page-content-1"]',
          )!.innerHTML,
          'text/html',
        )
        .body.textContent,
    ).toBe('First pageSecond page');
    expect(
      onChange.mock.calls.at(-1)?.[0],
    ).not.toContain('page-break');
  });

  it('hides the remove-break control for soft pagination and in preview mode', async () => {
    host.style.zoom = '0.25';
    await act(async () => {
      root.render(
        <A4PageEditor
          value={Array.from(
            { length: 120 },
            (_, index) => `<p>Soft page marker ${index + 1}</p>`,
          ).join('')}
        />,
      );
    });
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    expect(
      host.querySelectorAll('[data-testid^="a4-page-content-"]').length,
    ).toBeGreaterThan(1);
    expect(
      Array.from(host.querySelectorAll('button')).some((button) =>
        button
          .getAttribute('aria-label')
          ?.startsWith('Remove page break before page'),
      ),
    ).toBe(false);

    await act(async () => root.unmount());
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root.render(
        <A4PageEditor
          value={
            '<p>First page</p><div class="page-break" data-break-type="hard"></div><p>Second page</p>'
          }
          readOnly
        />,
      );
    });
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    expect(
      Array.from(host.querySelectorAll('button')).some((button) =>
        button
          .getAttribute('aria-label')
          ?.startsWith('Remove page break before page'),
      ),
    ).toBe(false);
  });

  it('hides page-chrome deletion and disables Delete Current Page for soft-only pagination', async () => {
    host.style.zoom = '0.25';
    await act(async () => {
      root.render(
        <A4PageEditor
          value={Array.from(
            { length: 120 },
            (_, index) => `<p>Soft page marker ${index + 1}</p>`,
          ).join('')}
        />,
      );
    });
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    expect(
      host.querySelectorAll('[data-testid^="a4-page-content-"]').length,
    ).toBeGreaterThan(1);
    expect(
      host.querySelectorAll('button[title="Delete explicit page section"]'),
    ).toHaveLength(0);
    const deleteCurrent = Array.from(host.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Delete current page',
    );
    expect(deleteCurrent?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps the editor reachable at a narrow viewport without body overflow', async () => {
    await page.viewport(1024, 720);
    await act(async () => {
      root.render(<A4PageEditor value="<p>Narrow viewport content</p>" />);
    });
    await act(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve()),
        ),
      );
    });

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(1024);

    const surface = host.querySelector<HTMLElement>(
      '[data-testid="a4-document-surface"]',
    )!;
    const scrollContainer = surface.parentElement!.parentElement!;
    scrollContainer.scrollLeft = 0;
    expect(scrollContainer.scrollLeft).toBe(0);
    scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    expect(scrollContainer.scrollLeft).toBe(
      Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth),
    );

    const fontSize = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Font size"]',
    )!;
    const addPage = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Add Page',
    )!;
    await act(async () => {
      fontSize.focus();
    });
    expect(document.activeElement).toBe(fontSize);
    await act(async () => {
      addPage.focus();
    });
    expect(document.activeElement).toBe(addPage);
  });
});
