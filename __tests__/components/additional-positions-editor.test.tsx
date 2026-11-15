import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdditionalPositionsEditor } from '@/components/forms/additional-positions-editor';
import type { AdditionalPosition } from '@/lib/forms/additional-positions';

vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ options, value, onChange, ariaLabel }: {
    options: Array<{ label: string; value: string }>;
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select position</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));

function Harness() {
  const [positions, setPositions] = useState<AdditionalPosition[]>([]);
  return <AdditionalPositionsEditor
    value={positions}
    onChange={setPositions}
    idPrefix="position-test"
    options={['Director', 'Secretary', 'CEO', 'CFO', 'Auditor'].map((role) => ({ value: role, label: role }))}
  />;
}

describe('additional officer positions editor', () => {
  it('renders fourth to sixth positions as structured editable rows', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add position' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add position' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add position' }));
    expect(screen.getByText('Position 4')).toBeTruthy();
    expect(screen.getByText('Position 5')).toBeTruthy();
    expect(screen.getByText('Position 6')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Position 5 role'), { target: { value: 'CEO' } });
    fireEvent.change(screen.getByLabelText('Appointment date for position 5'), { target: { value: '2024-03-01' } });
    expect((screen.getByLabelText('Position 5 role') as HTMLSelectElement).value).toBe('CEO');
    expect((screen.getByLabelText('Appointment date for position 5') as HTMLInputElement).value).toBe('2024-03-01');
    fireEvent.click(screen.getByRole('button', { name: 'Remove position 5' }));
    expect(screen.queryByText('Position 6')).toBeNull();
  });
});
