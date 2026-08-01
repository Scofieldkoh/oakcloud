import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({
    options,
    value,
    onChange,
    placeholder,
    clearable,
    disabled,
  }: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    clearable?: boolean;
    disabled?: boolean;
  }) => (
    <div>
      <select
        aria-label={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {clearable && value && !disabled ? (
        <button type="button" aria-label="Clear selection" onClick={() => onChange('')}>
          Clear
        </button>
      ) : null}
    </div>
  ),
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

let currentPublicForm = publicForm;

function dropdownForm(isRequired: boolean) {
  return {
    ...publicForm,
    fields: [{
      id: 'field-1',
      type: 'DROPDOWN',
      label: 'Industry',
      key: 'industry',
      placeholder: 'Select an industry',
      subtext: null,
      helpText: null,
      inputType: null,
      options: [{ value: 'A', label: 'Agriculture' }, { value: 'B', label: 'Banking' }],
      validation: null,
      condition: null,
      isRequired,
      hideLabel: false,
      isReadOnly: false,
      layoutWidth: 100,
      position: 0,
    }],
  };
}

describe('PublicFormPage', () => {
  beforeEach(() => {
    currentPublicForm = publicForm;
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === '/api/public-bootstrap/forms/annual-return-declaration') {
        return new Response(JSON.stringify({ form: currentPublicForm }), {
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

  it('lets respondents clear an optional dropdown selection', async () => {
    currentPublicForm = dropdownForm(false);
    render(<PublicFormPage />);

    const combobox = await screen.findByRole('combobox', { name: 'Select an industry' });
    fireEvent.change(combobox, { target: { value: 'A' } });
    expect(combobox).toHaveValue('A');

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(combobox).toHaveValue('');
  });

  it('allows clearing a required dropdown but retains required validation', async () => {
    currentPublicForm = dropdownForm(true);
    render(<PublicFormPage />);

    const combobox = await screen.findByRole('combobox', { name: 'Select an industry' });
    fireEvent.change(combobox, { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send declaration' }));

    expect(await screen.findByText('Industry is required')).toBeVisible();
  });
});
