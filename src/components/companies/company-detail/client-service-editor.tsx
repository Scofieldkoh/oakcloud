'use client';

import { useId, useState } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormInput } from '@/components/ui/form-input';
import type { ClientServiceDto } from '@/services/client-service';
import {
  isHttpRequestError,
  useArchiveClientService,
  useClientService,
  useUpdateClientService,
} from '@/hooks/use-client-services';
import { OperationalServiceForm } from './operational-service-form';
import {
  operationalFieldValues,
  updateFeeLines,
  validateOperationalServiceValues,
  valuesFromClientService,
  type OperationalFieldErrors,
  type OperationalServiceValues,
} from './client-service-form-state';

export function ClientServiceEditor({
  service,
  isOpen,
  onClose,
}: {
  service: ClientServiceDto;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [serviceName, setServiceName] = useState(service.serviceName);
  const [familyName, setFamilyName] = useState(service.familyName);
  const [values, setValues] = useState<OperationalServiceValues>(() => valuesFromClientService(service));
  const [updatedAt, setUpdatedAt] = useState(service.updatedAt);
  const [fieldErrors, setFieldErrors] = useState<OperationalFieldErrors>({});
  const [formError, setFormError] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const errorId = useId();
  const update = useUpdateClientService();
  const archive = useArchiveClientService();
  const latestService = useClientService(service.id);

  const agreementBacked = service.source === 'AGREEMENT';
  const editDescription = agreementBacked
    ? 'Operational edits do not change the signed agreement.'
    : 'This service was added manually. Operational changes are recorded in the audit history.';
  const archiveDescription = agreementBacked
    ? 'Archiving removes this operational service without changing the signed agreement.'
    : 'Archiving removes this manually added service from the active company view.';

  const replaceForm = (next: ClientServiceDto) => {
    setServiceName(next.serviceName);
    setFamilyName(next.familyName);
    setValues(valuesFromClientService(next));
    setUpdatedAt(next.updatedAt);
    setFieldErrors({});
  };

  const validate = () => {
    const errors = validateOperationalServiceValues(values);
    if (!serviceName.trim()) errors.serviceName = 'Service name is required.';
    if (!familyName.trim()) errors.familyName = 'Service family is required.';
    setFieldErrors(errors);
    return Object.values(errors).find(Boolean) ?? '';
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (hasConflict) {
      setFormError('Reload the latest service before saving again.');
      return;
    }
    setFormError('');
    try {
      await update.mutateAsync({
        id: service.id,
        companyId: service.companyId,
        data: {
          updatedAt,
          serviceName,
          familyName,
          status: values.status,
          serviceCadence: values.serviceCadence,
          customCadenceLabel: values.serviceCadence === 'CUSTOM' ? values.customCadenceLabel : null,
          startDate: values.startDate,
          endDate: values.endDate || null,
          fieldValues: operationalFieldValues(values),
          feeLines: updateFeeLines(values),
        },
      });
      onClose();
    } catch (error) {
      if (isHttpRequestError(error, 409)) {
        setHasConflict(true);
        setFormError('This service was updated by someone else. Reload the latest service before saving again.');
        return;
      }
      setFormError(error instanceof Error ? error.message : 'Unable to save service changes.');
    }
  };

  const reloadLatest = async () => {
    setFormError('');
    try {
      const result = await latestService.refetch();
      if (!result.data) throw new Error('Unable to reload the latest service.');
      replaceForm(result.data);
      setHasConflict(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to reload the latest service.');
    }
  };

  const archiveService = async (reason?: string) => {
    setArchiveError('');
    try {
      await archive.mutateAsync({ id: service.id, companyId: service.companyId, reason: reason ?? '' });
      setArchiveOpen(false);
      onClose();
    } catch (error) {
      setArchiveError(error instanceof Error ? error.message : 'Unable to archive service.');
      throw error;
    }
  };

  return <>
    <Modal isOpen={isOpen} onClose={onClose} title="Edit service" description={editDescription} size="2xl">
      <ModalBody className="max-h-[70vh] space-y-4 overflow-y-auto" aria-describedby={formError ? errorId : undefined}>
        {formError ? (
          <div id={errorId}>
            <Alert variant="error">
              <div className="flex flex-col gap-2">
                <p>{formError}</p>
                {hasConflict ? <Button size="sm" variant="secondary" isLoading={latestService.isFetching} onClick={reloadLatest}>Reload latest service</Button> : null}
              </div>
            </Alert>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput id="client-service-name" label="Service name" value={serviceName} error={fieldErrors.serviceName} onChange={(event) => setServiceName(event.target.value)} />
          <FormInput id="client-service-family" label="Service family" value={familyName} error={fieldErrors.familyName} onChange={(event) => setFamilyName(event.target.value)} />
        </div>
        <OperationalServiceForm values={values} onChange={setValues} errors={fieldErrors} />
        <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3">
          <p className="text-sm text-text-secondary">{archiveDescription}</p>
          <Button className="mt-2" variant="danger" size="sm" onClick={() => { setArchiveError(''); setArchiveOpen(true); }}>Archive service</Button>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button isLoading={update.isPending} disabled={hasConflict} onClick={save}>Save changes</Button>
      </ModalFooter>
    </Modal>
    <ConfirmDialog isOpen={archiveOpen} onClose={() => { setArchiveError(''); setArchiveOpen(false); }} onConfirm={archiveService} title="Archive service?" description="This service will no longer appear in the company Services list." confirmLabel="Archive service" requireReason reasonLabel="Archive reason" reasonPlaceholder="Explain why this service is being archived" reasonMinLength={10} isLoading={archive.isPending}>
      {archiveError ? <div role="alert" className="rounded-lg border border-status-error/30 bg-status-error/5 p-2 text-sm text-status-error">{archiveError}</div> : null}
    </ConfirmDialog>
  </>;
}
