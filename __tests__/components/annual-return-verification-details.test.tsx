import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RecordedAdditionalPositions,
  RecordedShareholdings,
  formatRecordedAppointmentDate,
} from '@/components/forms/annual-return-verification-details';

describe('Annual Return verification details', () => {
  it('displays each extra appointment beside its date as read-only text', () => {
    render(<RecordedAdditionalPositions value={[
      { role: 'CEO', date: '2025-02-26' },
      { role: 'CFO', date: '2025-03-10' },
    ]} />);
    expect(screen.getByText('Position 4')).toBeTruthy();
    expect(screen.getByText('Appointment date 4')).toBeTruthy();
    expect(screen.getByText('Position 5')).toBeTruthy();
    expect(screen.getByText('Appointment date 5')).toBeTruthy();
    expect(screen.getByText('26 Feb 2025')).toBeTruthy();
    expect(screen.getAllByRole('textbox').every((element) =>
      element.getAttribute('aria-readonly') === 'true')).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('displays issued holdings without add, remove or editable inputs', () => {
    const { rerender } = render(<RecordedShareholdings value={[
      { shareClass: 'ORDINARY', shares: '10000' },
      { shareClass: 'PREFERENCE', shares: '50' },
    ]} />);
    expect(screen.getByText('ORDINARY')).toBeTruthy();
    expect(screen.getByText('10,000')).toBeTruthy();
    expect(screen.getByText('PREFERENCE')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getAllByRole('textbox').every((element) => element.className.includes('bg-[#D9DFDE]'))).toBe(true);
    rerender(<RecordedShareholdings value={[]} />);
    expect(screen.getByText('No shares recorded for this person.')).toBeTruthy();
  });

  it('formats dates without local timezone shifts', () => {
    expect(formatRecordedAppointmentDate('2026-02-26')).toBe('26 Feb 2026');
    expect(formatRecordedAppointmentDate('')).toBe('Not recorded');
  });
});
