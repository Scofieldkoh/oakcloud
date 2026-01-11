'use client';

import { Modal } from '@/components/ui/modal';
import { RichTextDisplay } from '@/components/ui/rich-text-editor';

interface ScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  serviceName: string;
  scope: string;
}

export function ScopeModal({
  isOpen,
  onClose,
  serviceName,
  scope,
}: ScopeModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Scope of Work: ${serviceName}`}
      size="lg"
    >
      <div className="py-2">
        {scope ? (
          <RichTextDisplay content={scope} />
        ) : (
          <p className="text-text-muted text-center py-8">
            No scope of work defined for this service.
          </p>
        )}
      </div>
    </Modal>
  );
}
