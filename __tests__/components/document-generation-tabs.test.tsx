import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/generated-documents' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

import { DocumentGenerationTabs } from '@/components/documents/document-generation-tabs';

describe('DocumentGenerationTabs', () => {
  beforeEach(() => {
    navigation.pathname = '/generated-documents';
  });

  it('marks Generated Documents active on its route', () => {
    render(<DocumentGenerationTabs />);

    expect(screen.getByRole('navigation', { name: 'Document Generation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Generated Documents' })).toHaveAttribute('href', '/generated-documents');
    expect(screen.getByRole('link', { name: 'Generated Documents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/template-partials');
    expect(screen.getByRole('link', { name: 'Templates' })).not.toHaveAttribute('aria-current');
  });

  it('marks Templates active on its route and descendants', () => {
    navigation.pathname = '/template-partials/editor/template-1';

    render(<DocumentGenerationTabs />);

    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Generated Documents' })).not.toHaveAttribute('aria-current');
  });
});
