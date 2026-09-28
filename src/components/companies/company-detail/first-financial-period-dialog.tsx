'use client';

import { useEffect, useState } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { useConfirmFinancialPeriod } from '@/hooks/use-client-services';
import type { FirstFinancialPeriodSuggestion } from '@/services/compliance-monitoring/financial-periods';

/**
 * Confirm the company's first financial period after incorporation (it may
 * run longer than 12 months) and its Year of Assessment. Saved to the company
 * straight away, independent of the service being added or edited.
 */
export function FirstFinancialPeriodDialog({
  companyId,
  isOpen,
  onClose,
  suggestion,
}: {
  companyId: string;
  isOpen: boolean;
  onClose: () => void;
  suggestion: FirstFinancialPeriodSuggestion | null;
}) {
  const confirm = useConfirmFinancialPeriod(companyId);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [yearOfAssessment, setYearOfAssessment] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setPeriodStart(suggestion?.periodStart ?? '');
    setPeriodEnd(suggestion?.periodEnd ?? '');
    setYearOfAssessment(suggestion ? String(suggestion.yearOfAssessment) : '');
    setError('');
  }, [isOpen, suggestion]);

  const save = async () => {
    setError('');
    const year = Number(yearOfAssessment);
    if (!periodStart || !periodEnd || !Number.isInteger(year)) {
      setError('Enter the period start, period end and Year of Assessment.');
      return;
    }
    try {
      await confirm.mutateAsync({ periodStart, periodEnd, yearOfAssessment: year });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the financial period.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!confirm.isPending) onClose(); }}
      title="Confirm first financial period"
      description="The first period runs from incorporation to the first financial year end and can be longer than 12 months. This is saved to the company."
      size="md"
    >
      <ModalBody>
        <div className="space-y-4">
          {error ? <Alert variant="error" compact>{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SingleDateInput id="first-period-start" label="Period start" required value={periodStart} onChange={setPeriodStart} disabled={confirm.isPending} />
            <SingleDateInput id="first-period-end" label="First financial year end" required value={periodEnd} onChange={setPeriodEnd} disabled={confirm.isPending} />
          </div>
          <FormInput
            id="first-period-ya"
            label="Year of Assessment"
            inputMode="numeric"
            value={yearOfAssessment}
            onChange={(event) => setYearOfAssessment(event.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            hint="Usually the year after the period ends."
            disabled={confirm.isPending}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={confirm.isPending}>Cancel</Button>
        <Button onClick={() => void save()} isLoading={confirm.isPending}>Confirm period</Button>
      </ModalFooter>
    </Modal>
  );
}
