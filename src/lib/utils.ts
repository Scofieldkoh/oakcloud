import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Decimal } from '@prisma/client/runtime/library';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to convert Decimal to number
export function toNumber(value: Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  // Decimal type has toString() method
  return parseFloat(value.toString());
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(
  amount: Decimal | number | string | null | undefined,
  currency: string = 'SGD'
): string {
  const num = toNumber(amount);
  if (num === null) return '-';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
  }).format(num);
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('en-SG').format(num);
}

export function formatPercentage(value: Decimal | number | string | null | undefined): string {
  const num = toNumber(value);
  if (num === null) return '-';
  return `${num.toFixed(2)}%`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

export function parseUEN(uen: string): {
  isValid: boolean;
  type?: 'business' | 'local_company' | 'others';
  yearOfRegistration?: string;
} {
  const businessPattern = /^\d{8}[A-Z]$/;
  const localCompanyPattern = /^\d{9}[A-Z]$/;
  const othersPattern = /^[A-Z]\d{2}[A-Z]{2}\d{4}[A-Z]$/;

  if (businessPattern.test(uen)) {
    return {
      isValid: true,
      type: 'business',
      yearOfRegistration: uen.substring(0, 4),
    };
  }

  if (localCompanyPattern.test(uen)) {
    return {
      isValid: true,
      type: 'local_company',
      yearOfRegistration: `20${uen.substring(0, 2)}`,
    };
  }

  if (othersPattern.test(uen)) {
    return {
      isValid: true,
      type: 'others',
      yearOfRegistration: `20${uen.substring(1, 3)}`,
    };
  }

  return { isValid: false };
}

export function getComplianceStatus(
  lastFilingDate: Date | null,
  financialYearEndMonth: number | null
): 'compliant' | 'due_soon' | 'overdue' | 'unknown' {
  if (!financialYearEndMonth) return 'unknown';

  const now = new Date();
  const currentYear = now.getFullYear();
  const fyeMonth = financialYearEndMonth - 1;

  let fyeDate = new Date(currentYear, fyeMonth, 1);
  fyeDate.setMonth(fyeDate.getMonth() + 1);
  fyeDate.setDate(0);

  if (fyeDate > now) {
    fyeDate = new Date(currentYear - 1, fyeMonth, 1);
    fyeDate.setMonth(fyeDate.getMonth() + 1);
    fyeDate.setDate(0);
  }

  const arDueDate = new Date(fyeDate);
  arDueDate.setMonth(arDueDate.getMonth() + 7);

  const daysUntilDue = Math.ceil((arDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 30) return 'due_soon';
  return 'compliant';
}

export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
