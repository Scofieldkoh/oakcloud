'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Users,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useSession, useLogout } from '@/hooks/use-auth';
import { useUIStore } from '@/stores/ui-store';
import { useIsMobile } from '@/hooks/use-media-query';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navigation: NavItem[] = [
  { name: 'Companies', href: '/companies', icon: Building2 },
  { name: 'Contacts', href: '/contacts', icon: Users, badge: 'Soon' },
  { name: 'Documents', href: '/documents', icon: FileText, badge: 'Soon' },
  { name: 'Settings', href: '/settings', icon: Settings, badge: 'Soon' },
];

// Shared navigation content
function NavigationContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="p-2.5 space-y-1">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const isDisabled = !!item.badge;

        return (
          <Link
            key={item.name}
            href={isDisabled ? '#' : item.href}
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
      })}
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
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Moon className="w-[18px] h-[18px] flex-shrink-0" />
      ) : (
        <Sun className="w-[18px] h-[18px] flex-shrink-0" />
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
function UserSection({ collapsed }: { collapsed: boolean }) {
  const { data: user } = useSession();
  const logout = useLogout();

  const getInitials = () => {
    if (!user) return 'U';
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  };

  const handleLogout = () => {
    logout.mutate();
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 border-t border-border-primary">
      {/* Theme toggle */}
      <div className="p-2.5 pb-0">
        <ThemeToggleButton collapsed={collapsed} />
      </div>

      {/* User info */}
      <div className="p-2.5">
        <div
          className={cn(
            'flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-background-tertiary',
            collapsed && 'justify-center'
          )}
        >
          <div className="w-7 h-7 rounded-full bg-oak-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-oak-light text-xs font-medium">{getInitials()}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user ? `${user.firstName} ${user.lastName}` : 'Loading...'}
              </p>
              <p className="text-xs text-text-tertiary truncate">{user?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-background-secondary text-text-muted hover:text-status-error transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            className="w-full mt-1.5 p-2 rounded hover:bg-background-secondary text-text-muted hover:text-status-error transition-colors flex items-center justify-center"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
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
      className={cn(
        'fixed left-0 top-0 h-screen bg-background-secondary border-r border-border-primary transition-all duration-200 z-40 hidden lg:block',
        sidebarCollapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn(
        "h-12 flex items-center border-b border-border-primary",
        sidebarCollapsed ? "justify-center px-2" : "justify-between px-3"
      )}>
        {sidebarCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="w-7 h-7 rounded-md bg-oak-primary flex items-center justify-center hover:bg-oak-hover transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        ) : (
          <>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-oak-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-sm">O</span>
              </div>
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

      <NavigationContent collapsed={sidebarCollapsed} />
      <UserSection collapsed={sidebarCollapsed} />
    </aside>
  );
}

// Mobile Header with hamburger
function MobileHeader() {
  const { toggleMobileSidebar, theme, toggleTheme } = useUIStore();

  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-background-secondary border-b border-border-primary z-30 lg:hidden">
      <div className="flex items-center justify-between h-full px-4">
        <button
          onClick={toggleMobileSidebar}
          className="p-2 -ml-2 rounded hover:bg-background-tertiary text-text-secondary"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-oak-primary flex items-center justify-center">
            <span className="text-white font-semibold text-sm">O</span>
          </div>
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
      <aside className="absolute left-0 top-0 h-full w-64 bg-background-secondary border-r border-border-primary animate-slide-in-left">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-3 border-b border-border-primary">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setMobileSidebarOpen(false)}>
            <div className="w-7 h-7 rounded-md bg-oak-primary flex items-center justify-center">
              <span className="text-white font-semibold text-sm">O</span>
            </div>
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

        <NavigationContent collapsed={false} onNavigate={() => setMobileSidebarOpen(false)} />
        <UserSection collapsed={false} />
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
export function useSidebarWidth() {
  const { sidebarCollapsed } = useUIStore();
  const isMobile = useIsMobile();

  if (isMobile) return 0;
  return sidebarCollapsed ? 56 : 224;
}
