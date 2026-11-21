import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeadlineOverview } from '@/components/services/deadlines/deadline-overview';
import { useComplianceOverview } from '@/hooks/use-deadlines';

vi.mock('@/hooks/use-deadlines', () => ({
  useComplianceOverview: vi.fn(),
}));

const onChange = vi.fn();
const onOpenCell = vi.fn();
const onOpenMonth = vi.fn();

const matrix = {
  overview: 'MATRIX' as const,
  financialYear: 2025,
  years: [2025, 2026] as [number, number],
  columns: ['SG_ECI', 'SG_FORM_C', 'SG_AGM_DUE', 'SG_ANNUAL_RETURN'] as const,
  rows: [
    {
      companyId: 'company-a',
      companyName: 'Alpha',
      displayLabel: 'Alpha',
      cellsByYear: {
        2025: {
          SG_ECI: { deadlineId: 'eci-2025', dueDate: '2026-03-31', status: 'FILED', overdue: false, occurrenceCount: 1 },
        },
        2026: {
          SG_ECI: { deadlineId: 'eci-2026', dueDate: '2027-03-31', status: 'PENDING_FILING', overdue: false, occurrenceCount: 1 },
        },
      },
    },
  ],
  totalCompanies: 1,
  page: 1,
  totalPages: 1,
};

function showMatrix(props: Partial<React.ComponentProps<typeof DeadlineOverview>> = {}) {
  return render(
    <DeadlineOverview
      view="MATRIX"
      financialYear={2025}
      dueYear={2026}
      companyQuery=""
      status="ALL"
      page={1}
      matrixSortOrder="asc"
      onChange={onChange}
      onOpenCell={onOpenCell}
      onOpenMonth={onOpenMonth}
      {...props}
    />,
  );
}

describe('two-year compliance matrix', () => {
  beforeEach(() => {
    onChange.mockReset();
    onOpenCell.mockReset();
    onOpenMonth.mockReset();
    vi.mocked(useComplianceOverview).mockReturnValue({
      data: matrix,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as never);
  });

  it('shows both FY/YA periods and the four clickable filing headers per year', () => {
    showMatrix();
    expect(screen.getByText('FY 2025 / YA 2026', { selector: 'th' })).toBeVisible();
    expect(screen.getByText('FY 2026 / YA 2027', { selector: 'th' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Sort FY \d{4}/ })).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Sort FY 2026 ECI by due date ascending' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Sort FY 2026 ECI by due date ascending' }));
    expect(onChange).toHaveBeenLastCalledWith({
      matrixSortYear: '2026',
      matrixSortCode: 'SG_ECI',
      matrixSortOrder: 'asc',
      page: '1',
    });
  });

  it('toggles the same service header to descending and preserves the FY when opening a deadline', () => {
    showMatrix({ matrixSortYear: 2025, matrixSortCode: 'SG_ECI' });
    expect(screen.getByRole('button', { name: 'Sort FY 2025 ECI by due date descending' }).closest('th')).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Sort FY 2025 ECI by due date descending' }));
    expect(onChange).toHaveBeenLastCalledWith({
      matrixSortYear: '2025',
      matrixSortCode: 'SG_ECI',
      matrixSortOrder: 'desc',
      page: '1',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open FY 2026 ECI deadline due 31 Mar 2027, Pending filing' }));
    expect(onOpenCell).toHaveBeenCalledWith('company-a', 'SG_ECI', 2026);
  });

  it('preserves a pair of displayed years when the starting financial year changes', () => {
    showMatrix();
    fireEvent.change(screen.getByRole('combobox', { name: 'Starting financial year / YA' }), {
      target: { value: '2024' },
    });
    expect(onChange).toHaveBeenCalledWith({
      financialYear: '2024',
      matrixSortYear: undefined,
      matrixSortCode: undefined,
      matrixSortOrder: undefined,
      page: '1',
    });
  });
});
