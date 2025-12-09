'use client';

import { useState } from 'react';
import { Modal, ModalBody, ModalFooter } from './modal';
import { Button } from './button';
import { FormInput } from './form-input';
import { cn } from '@/lib/utils';
import { dialogVariants, type DialogVariant } from './variants';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonMinLength?: number;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  requireReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Please provide a reason...',
  reasonMinLength = 10,
  isLoading = false,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const config = dialogVariants[variant];
  const Icon = config.icon;

  const handleConfirm = async () => {
    if (requireReason) {
      if (!reason.trim()) {
        setError('Reason is required');
        return;
      }
      if (reason.trim().length < reasonMinLength) {
        setError(`Reason must be at least ${reasonMinLength} characters`);
        return;
      }
    }

    setError('');
    await onConfirm(requireReason ? reason.trim() : undefined);
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    setError('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="sm"
      showCloseButton={false}
      closeOnOverlayClick={!isLoading}
      closeOnEscape={!isLoading}
    >
      <ModalBody>
        <div className="flex flex-col items-center text-center">
          <div className={cn('p-3 rounded-full mb-4', config.iconBgClass)}>
            <Icon className={cn('w-6 h-6', config.iconColorClass)} />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
          {description && (
            <p className="text-sm text-text-secondary mb-4">{description}</p>
          )}

          {requireReason && (
            <div className="w-full text-left mt-2">
              <FormInput
                label={reasonLabel}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError('');
                }}
                placeholder={reasonPlaceholder}
                error={error}
                disabled={isLoading}
                inputSize="sm"
              />
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter className="justify-center">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleClose}
          disabled={isLoading}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={config.buttonVariant}
          size="sm"
          onClick={handleConfirm}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// Hook for easier confirm dialog usage
export function useConfirmDialog() {
  const [state, setState] = useState<{
    isOpen: boolean;
    props: Omit<ConfirmDialogProps, 'isOpen' | 'onClose' | 'onConfirm'>;
    resolve: ((value: string | boolean | null) => void) | null;
  }>({
    isOpen: false,
    props: { title: '' },
    resolve: null,
  });

  const confirm = (
    props: Omit<ConfirmDialogProps, 'isOpen' | 'onClose' | 'onConfirm'>
  ): Promise<string | boolean | null> => {
    return new Promise((resolve) => {
      setState({ isOpen: true, props, resolve });
    });
  };

  const handleClose = () => {
    state.resolve?.(null);
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  const handleConfirm = (reason?: string) => {
    state.resolve?.(reason ?? true);
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  };

  const ConfirmDialogComponent = () => (
    <ConfirmDialog
      {...state.props}
      isOpen={state.isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  );

  return { confirm, ConfirmDialog: ConfirmDialogComponent };
}
