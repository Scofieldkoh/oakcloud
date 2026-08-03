import type { ReactNode } from 'react';

interface CompanyAccentSectionProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function CompanyAccentSection({
  title,
  actions,
  children,
}: CompanyAccentSectionProps) {
  return <section className="card overflow-hidden p-0">
    <header className="flex min-h-12 items-center justify-between gap-3 bg-oak-primary px-4 py-3 text-white">
      <h2 className="text-sm font-semibold leading-5">{title}</h2>
      {actions}
    </header>
    <div>{children}</div>
  </section>;
}
