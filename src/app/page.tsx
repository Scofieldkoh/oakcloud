'use client';

import Link from 'next/link';
import { Building2, Users, Shield, FileText, Package, Plug, Link2, LayoutDashboard } from 'lucide-react';
import { useSession, useLogout } from '@/hooks/use-auth';

const modules = [
  {
    name: 'Company Management',
    description: 'Manage companies, BizFile uploads, and compliance tracking',
    href: '/companies',
    icon: Building2,
    status: 'active',
  },
  {
    name: 'User Management',
    description: 'Manage users, roles, and permissions',
    href: '/users',
    icon: Users,
    status: 'coming',
  },
  {
    name: 'RBAC & Permissions',
    description: 'Role-based access control configuration',
    href: '/permissions',
    icon: Shield,
    status: 'coming',
  },
  {
    name: 'Audit Logging',
    description: 'System-wide audit trail and activity logs',
    href: '/audit',
    icon: FileText,
    status: 'coming',
  },
  {
    name: 'Module Marketplace',
    description: 'Browse and install additional modules',
    href: '/marketplace',
    icon: Package,
    status: 'coming',
  },
  {
    name: 'Connectors Hub',
    description: 'Integrate with external services and APIs',
    href: '/connectors',
    icon: Plug,
    status: 'coming',
  },
  {
    name: 'Module Linking',
    description: 'Configure module-to-connector relationships',
    href: '/linking',
    icon: Link2,
    status: 'coming',
  },
  {
    name: 'SuperAdmin Dashboard',
    description: 'System overview and administration',
    href: '/admin',
    icon: LayoutDashboard,
    status: 'coming',
  },
];

export default function HomePage() {
  const { data: user } = useSession();
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Header */}
      <header className="border-b border-border-primary">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/falcon.svg" alt="Oakcloud" className="w-[4.5rem] h-[4.5rem]" />
              <span className="text-xl font-semibold text-text-primary">Oakcloud</span>
            </div>
            <nav className="flex items-center gap-4">
              {user && (
                <Link href="/companies" className="btn-ghost btn-sm">
                  Companies
                </Link>
              )}
              {user ? (
                <button onClick={() => logout.mutate()} className="btn-secondary btn-sm">
                  Sign Out
                </button>
              ) : (
                <Link href="/login" className="btn-primary btn-sm">
                  Sign In
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-border-primary">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold text-text-primary mb-4">
              Practice Management,{' '}
              <span className="text-oak-light">Simplified</span>
            </h1>
            <p className="text-lg text-text-secondary mb-8">
              A modular internal management system designed for accounting practices.
              Clean, efficient, and runs completely locally.
            </p>
            <div className="flex gap-4">
              <Link href="/companies" className="btn-primary btn-sm">
                View Companies
              </Link>
              <Link href="/docs/README.md" target="_blank" className="btn-secondary btn-sm">
                Documentation
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">
            Core Modules
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {modules.map((module) => {
              const Icon = module.icon;
              const isActive = module.status === 'active';

              return (
                <Link
                  key={module.name}
                  href={isActive ? module.href : '#'}
                  className={`card p-4 transition-all duration-150 ${
                    isActive
                      ? 'hover:border-oak-primary hover:shadow-elevation-2 cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded ${
                        isActive ? 'bg-oak-primary/10' : 'bg-background-elevated'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isActive ? 'text-oak-light' : 'text-text-muted'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-text-primary truncate">
                          {module.name}
                        </h3>
                        {!isActive && (
                          <span className="badge badge-neutral text-2xs">Soon</span>
                        )}
                      </div>
                      <p className="text-sm text-text-tertiary mt-1 line-clamp-2">
                        {module.description}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-primary mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between text-sm text-text-tertiary">
            <span>Oakcloud v0.1.0</span>
            <span>Built for local-first accounting practice management</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
