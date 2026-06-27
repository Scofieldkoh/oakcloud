import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PublicFormPage from '@/app/(public)/forms/f/[slug]/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'annual-return-declaration' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/forms/f/annual-return-declaration',
}));

vi.mock('@/components/esigning/signing/esigning-signature-modal', () => ({
  EsigningSignatureModal: () => null,
}));

const publicForm = {
  id: 'form-1',
  slug: 'annual-return-declaration',
  title: 'Annual Return Declaration',
  description: null,
  status: 'PUBLISHED',
  tenantLogoUrl: null,
  tenantName: 'OakCloud',
  fields: [],
  settings: {
    i18n: {
      defaultLocale: 'en',
      enabledLocales: ['en'],
      translations: {
        en: {
          ui: {
            loading_form: 'Loading translated form...',
            submit: 'Send declaration',
          },
        },
      },
    },
  },
};

describe('PublicFormPage', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/public-bootstrap/forms/annual-return-declaration') {
        return new Response(JSON.stringify({ form: publicForm }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Unexpected request: ${url}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a public form once when localized UI labels become available', async () => {
    render(<PublicFormPage />);

    await screen.findByRole('heading', { name: 'Annual Return Declaration' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
