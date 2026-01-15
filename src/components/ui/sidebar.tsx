'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Users,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Shield,
  Activity,
  Building,
  UserCog,
  Trash2,
  Plug,
  Share2,
  ScanText,
  HardDrive,
  DollarSign,
  BookOpen,
  Lock,
  Calculator,
  Briefcase,
} from 'lucide-react';
import { useSession, useLogout } from '@/hooks/use-auth';
import { useUIStore } from '@/stores/ui-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { getSidebarWidth as getSidebarWidthFn } from '@/lib/constants/layout';
import { SidebarTenantButton } from '@/components/ui/tenant-selector';
import { SidebarCompanyButton } from '@/components/ui/company-selector';
import { PetToggleButton } from '@/components/ui/pet-toggle-button';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  adminOnly?: boolean; // Only show to SUPER_ADMIN and TENANT_ADMIN
  superAdminOnly?: boolean; // Only show to SUPER_ADMIN
}

interface NavGroup {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const navigation: NavItem[] = [
  { name: 'Companies', href: '/companies', icon: Building2 },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Services', href: '/services', icon: Briefcase },
  { name: 'Document Processing', href: '/processing', icon: ScanText },
  { name: 'Document Generation', href: '/generated-documents', icon: FileText },
  { name: 'Shared Documents', href: '/shared-documents', icon: Share2 },
  { name: 'Settings', href: '/settings', icon: Settings, badge: 'Soon' },
];

// Ungrouped admin items (shown at top level)
const ungroupedAdminItems: NavItem[] = [
  { name: 'Templates', href: '/admin/template-partials', icon: FileText, adminOnly: true },
  { name: 'Connectors', href: '/admin/connectors', icon: Plug, adminOnly: true },
  { name: 'Recycle Bin', href: '/admin/data-purge', icon: Trash2, superAdminOnly: true },
];

// Grouped admin items
const adminNavGroups: NavGroup[] = [
  {
    id: 'security',
    name: 'Security',
    icon: Lock,
    items: [
      { name: 'Tenants', href: '/admin/tenants', icon: Building, superAdminOnly: true },
      { name: 'Users', href: '/admin/users', icon: UserCog, adminOnly: true },
      { name: 'Roles', href: '/admin/roles', icon: Shield, adminOnly: true },
      { name: 'Backup & Restore', href: '/admin/backup', icon: HardDrive, superAdminOnly: true },
      { name: 'Audit Logs', href: '/admin/audit-logs', icon: Activity, adminOnly: true },
    ],
  },
  {
    id: 'accounting',
    name: 'Accounting',
    icon: Calculator,
    items: [
      { name: 'Exchange Rates', href: '/admin/exchange-rates', icon: DollarSign, adminOnly: true },
      { name: 'Chart of Accounts', href: '/admin/chart-of-accounts', icon: BookOpen, adminOnly: true },
    ],
  },
];

// Navigation link component with route prefetching
function NavLink({
  item,
  collapsed,
  onNavigate,
  isActive
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  isActive: boolean;
}) {
  const Icon = item.icon;
  const isDisabled = !!item.badge;

  return (
    <Link
      key={item.name}
      href={isDisabled ? '#' : item.href}
      prefetch={!isDisabled} // Enable Next.js route prefetching
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
        } else {
          onNavigate?.();
        }
      }}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
        isActive
          ? 'bg-oak-primary/10 text-oak-light'
          : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary',
        isDisabled && 'opacity-50 cursor-not-allowed'
      )}
      title={collapsed ? item.name : undefined}
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1">{item.name}</span>
          {item.badge && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-background-tertiary text-text-muted">
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

// Collapsed sidebar popover for showing submenu items on hover
function CollapsedNavPopover({
  group,
  items,
  isActive,
  onNavigate,
  pathname,
}: {
  group: NavGroup;
  items: NavItem[];
  isActive: boolean;
  onNavigate?: () => void;
  pathname: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const Icon = group.icon;

  // Update popover position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPosition({
        top: rect.top,
        left: rect.right + 4, // 4px gap from sidebar
      });
    }
  }, [isOpen]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        ref={buttonRef}
        className={cn(
          'w-full flex items-center justify-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-oak-primary/10 text-oak-light'
            : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
        )}
        title={group.name}
      >
        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      </button>

      {/* Popover menu - rendered via portal to escape overflow clipping */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] min-w-48 bg-background-secondary border border-border-primary rounded-md shadow-lg py-1"
          style={{ top: popoverPosition.top, left: popoverPosition.left }}
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
        >
          {/* Group header */}
          <div className="px-3 py-2 border-b border-border-primary">
            <span className="text-xs font-medium uppercase text-text-muted tracking-wider">
              {group.name}
            </span>
          </div>
          {/* Menu items */}
          <div className="py-1">
            {items.map((item) => {
              const ItemIcon = item.icon;
              const itemIsActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => {
                    setIsOpen(false);
                    onNavigate?.();
                  }}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    itemIsActive
                      ? 'bg-oak-primary/10 text-oak-light'
                      : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
                  )}
                >
                  <ItemIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Group header component for collapsible nav groups
function NavGroupHeader({
  group,
  isCollapsed,
  onToggle,
  sidebarCollapsed,
  isActive,
}: {
  group: NavGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  sidebarCollapsed: boolean;
  isActive: boolean;
}) {
  const Icon = group.icon;

  return (
    <button
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      aria-label={sidebarCollapsed ? `${group.name} menu` : undefined}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
        isActive
          ? 'bg-oak-primary/10 text-oak-light'
          : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
      )}
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
      {!sidebarCollapsed && (
        <>
          <span className="flex-1 text-left">{group.name}</span>
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" aria-hidden="true" />
          )}
        </>
      )}
    </button>
  );
}

// Group items component for rendering child nav items
function NavGroupItems({
  items,
  collapsed,
  onNavigate,
  pathname,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  pathname: string;
}) {
  if (collapsed) return null;

  return (
    <div className="ml-4 mt-1 space-y-0.5 border-l border-border-primary pl-2">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <NavLink
            key={item.name}
            item={item}
            collapsed={false}
            onNavigate={onNavigate}
            isActive={isActive}
          />
        );
      })}
    </div>
  );
}

// Shared navigation content
function NavigationContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: user } = useSession();

  // Collapse state - all groups collapsed by default
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(adminNavGroups.map((g) => g.id))
  );

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Filter ungrouped items based on permissions
  const filteredUngroupedItems = ungroupedAdminItems.filter((item) => {
    if (!user) return false;
    if (item.superAdminOnly) return user.isSuperAdmin;
    if (item.adminOnly) return user.isSuperAdmin || user.isTenantAdmin;
    return true;
  });

  // Filter groups - only show groups where user has access to at least one item
  const filteredGroups = adminNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!user) return false;
        if (item.superAdminOnly) return user.isSuperAdmin;
        if (item.adminOnly) return user.isSuperAdmin || user.isTenantAdmin;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  // Check if group has an active child
  const isGroupActive = (group: NavGroup): boolean => {
    return group.items.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  };

  const showAdminSection = filteredUngroupedItems.length > 0 || filteredGroups.length > 0;

  return (
    <nav aria-label="Main menu" className="p-2.5 space-y-1">
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <NavLink
            key={item.name}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
            isActive={isActive}
          />
        );
      })}

      {/* Admin Section */}
      {showAdminSection && (
        <>
          {!collapsed && (
            <div className="pt-4 pb-2">
              <div className="px-2.5 text-2xs font-medium uppercase text-text-muted tracking-wider">
                Administration
              </div>
            </div>
          )}
          {collapsed && <div className="pt-3 border-t border-border-primary mt-3" />}

          {/* Ungrouped admin items */}
          {filteredUngroupedItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <NavLink
                key={item.name}
                item={item}
                collapsed={collapsed}
                onNavigate={onNavigate}
                isActive={isActive}
              />
            );
          })}

          {/* Grouped admin items */}
          {filteredGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.id);
            const groupIsActive = isGroupActive(group);

            // When sidebar is collapsed, show popover on hover
            if (collapsed) {
              return (
                <CollapsedNavPopover
                  key={group.id}
                  group={group}
                  items={group.items}
                  isActive={groupIsActive}
                  onNavigate={onNavigate}
                  pathname={pathname}
                />
              );
            }

            // When sidebar is expanded, show collapsible groups
            return (
              <div key={group.id}>
                <NavGroupHeader
                  group={group}
                  isCollapsed={isGroupCollapsed}
                  onToggle={() => toggleGroup(group.id)}
                  sidebarCollapsed={collapsed}
                  isActive={groupIsActive}
                />
                <NavGroupItems
                  items={group.items}
                  collapsed={isGroupCollapsed}
                  onNavigate={onNavigate}
                  pathname={pathname}
                />
              </div>
            );
          })}
        </>
      )}
    </nav>
  );
}

// Theme toggle button
function ThemeToggleButton({ collapsed }: { collapsed: boolean }) {
  const { theme, toggleTheme } = useUIStore();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors w-full',
        'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
      )}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
      ) : (
        <Sun className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
      )}
      {!collapsed && (
        <span className="flex-1 text-left">
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </span>
      )}
    </button>
  );
}

// User section
function UserSection({ collapsed, isMobile = false }: { collapsed: boolean; isMobile?: boolean }) {
  const { data: user } = useSession();
  const logout = useLogout();

  const getInitials = () => {
    if (!user) return 'U';
    const first = user.firstName?.[0] || '';
    const last = user.lastName?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  const handleLogout = () => {
    logout.mutate();
  };

  return (
    <div className={cn(
      "border-t border-border-primary bg-background-tertiary",
      // Desktop: absolute positioned at bottom
      // Mobile: relative positioned, stays in flow
      isMobile ? "relative mt-auto" : "absolute bottom-0 left-0 right-0"
    )}>
      {/* All items use consistent p-2.5 with space-y-1 for uniform spacing */}
      <div className="p-2.5 space-y-1">
        {/* Tenant selector for SUPER_ADMIN */}
        {user?.isSuperAdmin && (
          <SidebarTenantButton collapsed={collapsed} />
        )}

        {/* Company selector - available to all users */}
        <SidebarCompanyButton collapsed={collapsed} />

        {/* Theme toggle - hidden on mobile since it's in the header */}
        {!isMobile && (
          <>
            <ThemeToggleButton collapsed={collapsed} />
            <PetToggleButton collapsed={collapsed} />
          </>
        )}

        {/* User info */}
        <div
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-background-secondary',
            collapsed && 'justify-center'
          )}
        >
          <div className="w-7 h-7 rounded-full bg-oak-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-oak-light text-xs font-medium">{getInitials()}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User' : 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary truncate">{user?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-status-error transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            className="w-full p-2 rounded hover:bg-background-tertiary text-text-muted hover:text-status-error transition-colors flex items-center justify-center"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

// Desktop Sidebar
function DesktopSidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'fixed left-0 top-0 h-screen bg-background-secondary border-r border-border-primary transition-all duration-200 z-40 hidden lg:flex lg:flex-col',
        sidebarCollapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn(
        "h-14 flex items-center border-b border-border-primary flex-shrink-0",
        sidebarCollapsed ? "justify-center px-2" : "justify-between px-3"
      )}>
        {sidebarCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:opacity-80 transition-opacity"
            aria-label="Expand sidebar"
          >
            <Image src="/falcon.svg" alt="Oakcloud" width={54} height={54} unoptimized />
          </button>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/falcon.svg" alt="Oakcloud" width={54} height={54} className="flex-shrink-0" unoptimized />
              <span className="text-sm font-semibold text-text-primary">Oakcloud</span>
            </Link>
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-secondary transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Scrollable navigation area */}
      <div className="flex-1 overflow-y-auto">
        <NavigationContent collapsed={sidebarCollapsed} />
      </div>

      {/* User section at bottom */}
      <UserSection collapsed={sidebarCollapsed} isMobile={false} />
    </aside>
  );
}

// Mobile Header with hamburger
function MobileHeader() {
  const { toggleMobileSidebar, theme, toggleTheme } = useUIStore();

  return (
    <header className="fixed top-0 left-0 right-0 bg-background-secondary border-b border-border-primary z-30 lg:hidden pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between h-14 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <button
          onClick={toggleMobileSidebar}
          className="p-2 -ml-2 rounded hover:bg-background-tertiary text-text-secondary"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <Image src="/falcon.svg" alt="Oakcloud" width={54} height={54} unoptimized />
          <span className="text-sm font-semibold text-text-primary">Oakcloud</span>
        </Link>
        <button
          onClick={toggleTheme}
          className="p-2 -mr-2 rounded hover:bg-background-tertiary text-text-secondary"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
        </button>
      </div>
    </header>
  );
}

// Mobile Drawer
function MobileDrawer() {
  const { sidebarMobileOpen, setMobileSidebarOpen } = useUIStore();

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };

    if (sidebarMobileOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [sidebarMobileOpen, setMobileSidebarOpen]);

  if (!sidebarMobileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60"
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className="absolute left-0 top-0 h-full w-64 bg-background-secondary border-r border-border-primary animate-slide-in-left flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border-primary flex-shrink-0">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileSidebarOpen(false)}>
            <Image src="/falcon.svg" alt="Oakcloud" width={54} height={54} unoptimized />
            <span className="text-sm font-semibold text-text-primary">Oakcloud</span>
          </Link>
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-secondary transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable navigation area */}
        <div className="flex-1 overflow-y-auto">
          <NavigationContent collapsed={false} onNavigate={() => setMobileSidebarOpen(false)} />
        </div>

        {/* User section at bottom */}
        <UserSection collapsed={false} isMobile={true} />
      </aside>
    </div>
  );
}

// Main Sidebar component
export function Sidebar() {
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile ? (
        <>
          <MobileHeader />
          <MobileDrawer />
        </>
      ) : (
        <DesktopSidebar />
      )}
    </>
  );
}

// Export for layout to know sidebar width
export { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED } from '@/lib/constants/layout';

export function useSidebarWidth() {
  const { sidebarCollapsed } = useUIStore();
  const isMobile = useIsMobile();

  // Use centralized constants for consistency
  return getSidebarWidthFn(sidebarCollapsed, isMobile);
}
