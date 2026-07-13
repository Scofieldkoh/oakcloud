import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page, userEvent } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { BizFileReviewWorkspace } from '@/components/companies/bizfile-review/bizfile-review-workspace';
import type { ExtractedBizFileData } from '@/services/bizfile';
import '@/app/globals.css';

const fixture: ExtractedBizFileData = {
  entityDetails: {
    uen: '202400001A',
    name: 'Example Pte. Ltd.',
    entityType: 'PRIVATE_LIMITED',
    status: 'LIVE',
  },
  registeredAddress: { streetName: 'Oak Street', postalCode: '123456' },
  ssicActivities: {
    primary: { code: '62011', description: 'Software development' },
  },
  paidUpCapital: { amount: 1000, currency: 'SGD' },
  issuedCapital: { amount: 1000, currency: 'SGD' },
  officers: [{ name: 'Alex Tan', role: 'DIRECTOR' }],
  shareholders: [{ name: 'Jamie Lim', type: 'INDIVIDUAL', shareClass: 'ORDINARY', numberOfShares: 1000 }],
  auditor: { name: 'Audit LLP' },
  financialYear: { endDay: 31, endMonth: 12 },
  charges: [{ chargeNumber: 'C1', chargeHolderName: 'Oak Bank' }],
  documentMetadata: { receiptNo: 'ACRA123' },
};

describe('BizFileReviewWorkspace responsive workflow', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.height = '100vh';
    host.style.width = '100%';
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  async function mount(onConfirm = vi.fn()) {
    await act(async () => {
      root.render(
        <BizFileReviewWorkspace
          initialData={fixture}
          sourcePanel={<div aria-label="Source document">BizFile source viewer</div>}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    });
    return onConfirm;
  }

  async function click(element: HTMLElement) {
    await act(async () => userEvent.click(element));
  }

  async function fill(element: HTMLElement, value: string) {
    await act(async () => userEvent.fill(element, value));
  }

  async function makeDirty() {
    await fill(screen.getByLabelText('Company name'), 'Changed Pte. Ltd.');
  }

  function applicationLink(attributes: Record<string, string> = {}) {
    const anchor = document.createElement('a');
    anchor.href = '/companies';
    anchor.textContent = 'Application link';
    for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
    host.append(anchor);
    return anchor;
  }

  it('keeps source and editor together while correcting and confirming on desktop', async () => {
    await page.viewport(1440, 900);
    const onConfirm = await mount();

    await expect.element(screen.getByTestId('desktop-split')).toBeVisible();
    await expect.element(screen.getByLabelText('Source document')).toBeVisible();
    await page.screenshot({ path: '__screenshots__/bizfile-review-desktop-1440x900.png' });
    const name = screen.getByLabelText('Company name');
    await fill(name, 'Corrected Pte. Ltd.');

    await click(screen.getByRole('button', { name: /Officers,/ }));
    await click(screen.getByRole('button', { name: 'Add Officers' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);
    await click(screen.getByRole('button', { name: 'Remove Officer 2' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);

    await click(screen.getByRole('button', { name: /Entity details,/ }));
    const returnedName = screen.getByLabelText('Company name');
    await fill(returnedName, '');
    await click(screen.getByRole('button', { name: 'Confirm & Save' }));
    await expect.element(screen.getByText('Company name is required')).toBeVisible();
    expect(returnedName).toHaveFocus();
    await fill(returnedName, '  Corrected Pte. Ltd.  ');
    await click(screen.getByRole('button', { name: 'Confirm & Save' }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      entityDetails: expect.objectContaining({ name: 'Corrected Pte. Ltd.' }),
      officers: [expect.objectContaining({ name: 'Alex Tan' })],
    }));
  });

  it('switches Document and Review without horizontal overflow on a narrow viewport', async () => {
    await page.viewport(390, 844);
    await mount();

    await expect.element(screen.getByRole('tab', { name: 'Document' })).toBeVisible();
    await click(screen.getByRole('tab', { name: 'Document' }));
    await expect.element(screen.getByLabelText('Source document')).toBeVisible();
    await click(screen.getByRole('tab', { name: 'Review' }));
    await expect.element(screen.getByLabelText('Company name')).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(document.documentElement.clientWidth);
    await page.screenshot({ path: '__screenshots__/bizfile-review-mobile-390x844.png' });
  });

  it('guards ordinary same-origin application links while dirty', async () => {
    await mount();
    await makeDirty();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const anchor = applicationLink();
    const bubble = vi.fn();
    anchor.addEventListener('click', bubble);

    const declined = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(declined);
    expect(confirm).toHaveBeenCalledOnce();
    expect(declined.defaultPrevented).toBe(true);
    expect(bubble).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    anchor.addEventListener('click', (event) => event.preventDefault());
    const accepted = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(accepted);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(bubble).toHaveBeenCalledOnce();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    confirm.mockReturnValue(false);
    const secondLink = applicationLink({ href: '/contacts' });
    const secondClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    secondLink.dispatchEvent(secondClick);
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(secondClick.defaultPrevented).toBe(true);
    const laterUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(laterUnload);
    expect(laterUnload.defaultPrevented).toBe(true);
  });

  it.each([
    ['modified', {}, { ctrlKey: true }],
    ['external', { href: 'https://example.com/elsewhere' }, {}],
    ['download', { download: 'file.pdf' }, {}],
    ['new-tab', { target: '_blank' }, {}],
  ])('does not guard %s links', async (_kind, attributes, init) => {
    await mount();
    await makeDirty();
    const confirm = vi.spyOn(window, 'confirm');
    const anchor = applicationLink(attributes);
    anchor.addEventListener('click', (event) => event.preventDefault());
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('lets clean application links pass without prompting', async () => {
    await mount();
    const confirm = vi.spyOn(window, 'confirm');
    const anchor = applicationLink();
    anchor.addEventListener('click', (event) => event.preventDefault());
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('rearms an accepted popstate on the next task while suppressing same-task unload', async () => {
    await mount();
    await makeDirty();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    window.dispatchEvent(new PopStateEvent('popstate'));
    const sameTaskUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(sameTaskUnload);
    expect(sameTaskUnload.defaultPrevented).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 0));
    const laterUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(laterUnload);
    expect(laterUnload.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });
});
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = false;
  });
