import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tasks',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: () => null,
}));

vi.mock('@/hooks/use-auth', () => ({
  useSession: () => ({ data: { id: 'user-1', email: 'user@example.com', isSuperAdmin: false, isWorkspaceAdmin: false } }),
  useLogout: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/ui/company-selector', () => ({
  SidebarCompanyButton: () => null,
}));

vi.mock('@/components/ui/dropdown', () => ({
  Dropdown: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownLabel: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownSeparator: () => null,
}));

import { Sidebar } from '@/components/ui/sidebar';
import { useUIStore } from '@/stores/ui-store';

describe('Sidebar task workspace destinations', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    useUIStore.setState({ sidebarCollapsed: false, sidebarMobileOpen: false, theme: 'light' });
  });

  it('exposes Tasks and Pipelines as top-level destinations without legacy workflow links', () => {
    render(<Sidebar />);

    const menu = screen.getByRole('navigation', { name: 'Main menu' });
    expect(menu).toContainElement(screen.getByRole('link', { name: 'Tasks' }));
    expect(menu).toContainElement(screen.getByRole('link', { name: 'Pipelines' }));
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: 'Pipelines' })).toHaveAttribute('href', '/pipelines');
    expect(screen.queryByText('Workflow')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Templates' })).not.toBeInTheDocument();
  });
});
