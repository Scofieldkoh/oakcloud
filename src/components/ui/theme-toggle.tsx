'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown';
  showLabel?: boolean;
}

export function ThemeToggle({ variant = 'button', showLabel = false }: ThemeToggleProps) {
  const { theme, setTheme, toggleTheme } = useUIStore();

  if (variant === 'button') {
    return (
      <button
        onClick={toggleTheme}
        className="btn-ghost btn-sm btn-icon"
        title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      >
        {theme === 'light' ? (
          <Moon className="w-4 h-4" />
        ) : (
          <Sun className="w-4 h-4" />
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1 bg-background-tertiary rounded-lg">
      <button
        onClick={() => setTheme('light')}
        className={`p-1.5 rounded transition-colors ${
          theme === 'light'
            ? 'bg-background-elevated text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title="Light mode"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('dark')}
        className={`p-1.5 rounded transition-colors ${
          theme === 'dark'
            ? 'bg-background-elevated text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title="Dark mode"
      >
        <Moon className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTheme('system')}
        className={`p-1.5 rounded transition-colors ${
          theme === 'system'
            ? 'bg-background-elevated text-text-primary shadow-sm'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title="System preference"
      >
        <Monitor className="w-4 h-4" />
      </button>
    </div>
  );
}
