import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  SentrowebOverallBadge,
  SentrowebResultBadge,
  formatSentrowebCategoryCounts,
  sentrowebOverallBadge,
  sentrowebResultBadge,
  sentrowebRoleLabel,
} from '@/components/companies/company-detail/sentroweb-badges';
import type { SentrowebRunDto } from '@/lib/sentroweb/types';

type OverallInput = Pick<SentrowebRunDto, 'status' | 'overallResult'>;

describe('sentrowebResultBadge', () => {
  it('is green "Clear" only for the exact status CLEAR', () => {
    expect(sentrowebResultBadge('CLEAR')).toMatchObject({ label: 'Clear', className: 'badge-success' });
  });

  it.each([
    ['POSSIBLE_MATCH', 'Possible match', 'badge-error'],
    ['ERROR', 'Error', 'badge-warning'],
    ['NOT_RUN', 'Not run', 'badge-neutral'],
  ])('%s is %s and never Clear or green', (status, label, className) => {
    const badge = sentrowebResultBadge(status);
    expect(badge.label).toBe(label);
    expect(badge.className).toBe(className);
    expect(badge.label).not.toBe('Clear');
    expect(badge.className).not.toBe('badge-success');
  });

  it.each(['clear', 'Clear', '', null, undefined, 'PASSED'])('never treats %s as clear', (status) => {
    const badge = sentrowebResultBadge(status as string | null | undefined);
    expect(badge.label).not.toBe('Clear');
    expect(badge.className).not.toBe('badge-success');
  });

  it('renders the label as text, not colour only', () => {
    render(<SentrowebResultBadge status="POSSIBLE_MATCH" />);
    expect(screen.getByText('Possible match')).toHaveClass('badge-error');
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });
});

describe('sentrowebOverallBadge', () => {
  const cases: Array<[string, OverallInput, string, string]> = [
    ['COMPLETED + CLEAR', { status: 'COMPLETED', overallResult: 'CLEAR' }, 'Clear', 'badge-success'],
    ['COMPLETED + POSSIBLE_MATCH', { status: 'COMPLETED', overallResult: 'POSSIBLE_MATCH' }, 'Possible match', 'badge-error'],
    ['COMPLETED + INCOMPLETE', { status: 'COMPLETED', overallResult: 'INCOMPLETE' }, 'Incomplete', 'badge-warning'],
    ['COMPLETED + null', { status: 'COMPLETED', overallResult: null }, 'Incomplete', 'badge-warning'],
    ['FAILED + null', { status: 'FAILED', overallResult: null }, 'Incomplete', 'badge-warning'],
    ['FAILED + CLEAR', { status: 'FAILED', overallResult: 'CLEAR' }, 'Incomplete', 'badge-warning'],
    ['FAILED + INCOMPLETE', { status: 'FAILED', overallResult: 'INCOMPLETE' }, 'Incomplete', 'badge-warning'],
    ['RUNNING + null', { status: 'RUNNING', overallResult: null }, 'In progress', 'badge-neutral'],
    ['QUEUED + null', { status: 'QUEUED', overallResult: null }, 'In progress', 'badge-neutral'],
    ['RUNNING + CLEAR (stale)', { status: 'RUNNING', overallResult: 'CLEAR' }, 'In progress', 'badge-neutral'],
  ];

  it.each(cases)('%s', (_name, input, label, className) => {
    expect(sentrowebOverallBadge(input)).toMatchObject({ label, className });
  });

  it('renders "Incomplete" and no "Clear" for an INCOMPLETE overall result', () => {
    render(<SentrowebOverallBadge run={{ status: 'COMPLETED', overallResult: 'INCOMPLETE' }} />);
    expect(screen.getByText('Incomplete')).toHaveClass('badge-warning');
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });

  it('renders "Incomplete" for a FAILED run whose overall result is CLEAR', () => {
    render(<SentrowebOverallBadge run={{ status: 'FAILED', overallResult: 'CLEAR' }} />);
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });
});

describe('labels', () => {
  it('maps role codes to readable labels', () => {
    expect(sentrowebRoleLabel('COMPANY')).toBe('Company');
    expect(sentrowebRoleLabel('MANAGING_DIRECTOR')).toBe('Managing director');
    expect(sentrowebRoleLabel('ALTERNATE_DIRECTOR')).toBe('Alternate director');
    expect(sentrowebRoleLabel('NOMINEE_DIRECTOR')).toBe('Nominee director');
    expect(sentrowebRoleLabel('SHAREHOLDER')).toBe('Shareholder');
    expect(sentrowebRoleLabel('SOME_NEW_ROLE')).toBe('Some new role');
  });

  it('formats category counts', () => {
    expect(formatSentrowebCategoryCounts({ PEP: 2, SIP: 1 })).toBe('PEP 2 \u00b7 SIP 1');
    expect(formatSentrowebCategoryCounts({ SIE: 0 })).toBe('None');
    expect(formatSentrowebCategoryCounts({})).toBe('None');
  });
});
