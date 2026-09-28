'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';

export interface DocumentDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, permanent: boolean) => void | Promise<void>;
  /** Number of documents being deleted (1 for a single row). */
  count?: number;
  /** Shows the "Delete permanently" option (workspace and super admins). */
  canDeletePermanently?: boolean;
}

/**
 * Delete confirmation for generated documents. Deleting sends documents to the
 * Recycle Bin; admins can tick "Delete permanently" to remove them for good.
 */
export function DocumentDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  count = 1,
  canDeletePermanently = false,
}: DocumentDeleteDialogProps) {
  const [permanent, setPermanent] = useState(false);
  const isPermanent = canDeletePermanently && permanent;
  const noun = count === 1 ? 'Document' : `${count} Documents`;
  const these = count === 1 ? 'this document' : 'these documents';

  const handleClose = () => {
    setPermanent(false);
    onClose();
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={handleClose}
      onConfirm={async (reason) => {
        await onConfirm(reason ?? '', isPermanent);
        setPermanent(false);
      }}
      title={isPermanent ? `Permanently Delete ${noun}` : `Delete ${noun}`}
      description={isPermanent
        ? `This cannot be undone. ${count === 1 ? 'The document' : 'The documents'}, including finalized ones, will be removed for good with their comments, drafts and stored files. E-signing envelopes keep their own signed copies.`
        : `${count === 1 ? 'The document' : 'The documents'} will be moved to the Recycle Bin, where an administrator can restore or permanently delete ${count === 1 ? 'it' : 'them'}.`}
      confirmLabel={isPermanent ? 'Delete Permanently' : `Delete ${noun}`}
      variant="danger"
      requireReason
      reasonLabel="Reason for deletion"
      reasonPlaceholder={`Please provide a reason for deleting ${these}...`}
      reasonMinLength={10}
    >
      {canDeletePermanently && (
        <Checkbox
          size="sm"
          checked={permanent}
          onChange={(event) => setPermanent(event.target.checked)}
          label="Delete permanently"
          description="Skip the Recycle Bin. This cannot be undone."
        />
      )}
    </ConfirmDialog>
  );
}
