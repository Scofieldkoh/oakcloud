'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormInput } from '@/components/ui/form-input';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { useCreateAccount, useUpdateAccount, type ChartOfAccount, type CreateAccountInput, type UpdateAccountInput } from '@/hooks/use-chart-of-accounts';
import { ACCOUNT_TYPES, ACCOUNT_STATUSES, ACCOUNT_TYPE_NAMES, ACCOUNT_STATUS_NAMES } from '@/lib/validations/chart-of-accounts';
import type { AccountType, AccountStatus } from '@/generated/prisma';
import { Loader2 } from 'lucide-react';

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  account?: ChartOfAccount | null;
  parentOptions?: SelectOption[];
  tenantId?: string | null;
  companyId?: string | null;
  onSuccess?: () => void;
}

export function AccountFormModal({
  isOpen,
  onClose,
  account,
  parentOptions = [],
  tenantId,
  companyId,
  onSuccess,
}: AccountFormModalProps) {
  const isEditing = !!account;
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('EXPENSE');
  const [status, setStatus] = useState<AccountStatus>('ACTIVE');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState('0');
  const [isTaxApplicable, setIsTaxApplicable] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes or account changes
  useEffect(() => {
    if (isOpen) {
      if (account) {
        setCode(account.code);
        setName(account.name);
        setDescription(account.description || '');
        setAccountType(account.accountType);
        setStatus(account.status);
        setParentId(account.parentId);
        setSortOrder(String(account.sortOrder));
        setIsTaxApplicable(account.isTaxApplicable);
      } else {
        // Reset to defaults for new account
        setCode('');
        setName('');
        setDescription('');
        setAccountType('EXPENSE');
        setStatus('ACTIVE');
        setParentId(null);
        setSortOrder('0');
        setIsTaxApplicable(true);
      }
      setErrors({});
    }
  }, [isOpen, account]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!code.trim()) {
      newErrors.code = 'Account code is required';
    } else if (!/^[A-Z0-9\-_]+$/i.test(code)) {
      newErrors.code = 'Account code must be alphanumeric';
    } else if (code.length > 20) {
      newErrors.code = 'Account code must not exceed 20 characters';
    }

    if (!name.trim()) {
      newErrors.name = 'Account name is required';
    } else if (name.length > 200) {
      newErrors.name = 'Account name must not exceed 200 characters';
    }

    if (description && description.length > 500) {
      newErrors.description = 'Description must not exceed 500 characters';
    }

    const sortOrderNum = parseInt(sortOrder, 10);
    if (isNaN(sortOrderNum) || sortOrderNum < 0) {
      newErrors.sortOrder = 'Sort order must be a non-negative number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      if (isEditing && account) {
        const updateData: UpdateAccountInput = {
          code: code !== account.code ? code : undefined,
          name: name !== account.name ? name : undefined,
          description: description || null,
          accountType: accountType !== account.accountType ? accountType : undefined,
          status: status !== account.status ? status : undefined,
          parentId,
          sortOrder: parseInt(sortOrder, 10),
          isTaxApplicable,
        };
        await updateAccount.mutateAsync({ id: account.id, data: updateData });
      } else {
        const createData: CreateAccountInput = {
          code,
          name,
          description: description || null,
          accountType,
          parentId,
          sortOrder: parseInt(sortOrder, 10),
          isTaxApplicable,
          tenantId,
          companyId,
        };
        await createAccount.mutateAsync(createData);
      }
      onSuccess?.();
      onClose();
    } catch {
      // Error is handled by the mutation
    }
  };

  const isLoading = createAccount.isPending || updateAccount.isPending;
  const error = createAccount.error || updateAccount.error;

  // Account type options
  const accountTypeOptions: SelectOption[] = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: ACCOUNT_TYPE_NAMES[type],
  }));

  // Status options (only for editing)
  const statusOptions: SelectOption[] = ACCOUNT_STATUSES.map((s) => ({
    value: s,
    label: ACCOUNT_STATUS_NAMES[s],
  }));

  // Parent options - filter to avoid circular references
  const filteredParentOptions = parentOptions.filter((opt) => opt.value !== account?.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Account' : 'Add Account'}
      size="lg"
    >
      <ModalBody className="space-y-4">
        {error && (
          <div className="p-3 text-sm text-status-error bg-red-50 dark:bg-red-900/20 rounded-lg">
            {error.message}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="Account Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g., 6100"
            error={errors.code}
            disabled={isLoading || (isEditing && account?.isSystem)}
          />
          <FormInput
            label="Account Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Advertising & Marketing"
            error={errors.name}
            disabled={isLoading || (isEditing && account?.isSystem)}
          />
        </div>

        <FormInput
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          error={errors.description}
          disabled={isLoading}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Account Type</label>
            <SearchableSelect
              value={accountType}
              onChange={(val) => setAccountType(val as AccountType)}
              options={accountTypeOptions}
              placeholder="Select type"
              disabled={isLoading || (isEditing && account?.isSystem)}
            />
          </div>

          {isEditing && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Status</label>
              <SearchableSelect
                value={status}
                onChange={(val) => setStatus(val as AccountStatus)}
                options={statusOptions}
                placeholder="Select status"
                disabled={isLoading}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Parent Account</label>
            <SearchableSelect
              value={parentId || ''}
              onChange={(val) => setParentId(val || null)}
              options={[{ value: '', label: '(No Parent)' }, ...filteredParentOptions]}
              placeholder="Select parent"
              disabled={isLoading}
            />
          </div>

          <FormInput
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            min={0}
            error={errors.sortOrder}
            disabled={isLoading}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isTaxApplicable"
            checked={isTaxApplicable}
            onChange={(e) => setIsTaxApplicable(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4 rounded border-border-primary text-oak-primary focus:ring-oak-primary"
          />
          <label htmlFor="isTaxApplicable" className="text-sm text-text-secondary">
            Tax Applicable
          </label>
        </div>

        {isEditing && account?.isSystem && (
          <p className="text-xs text-text-muted">
            Note: System accounts have limited editing capabilities. Some fields are locked.
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Account'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
