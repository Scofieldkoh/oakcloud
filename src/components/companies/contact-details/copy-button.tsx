'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  className?: string;
}

export function CopyButton({ value, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Failed to copy
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded hover:bg-surface-tertiary transition-colors ${className}`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <Check className="w-3 h-3 text-status-success" />
      ) : (
        <Copy className="w-3 h-3 text-text-muted hover:text-text-secondary" />
      )}
    </button>
  );
}
