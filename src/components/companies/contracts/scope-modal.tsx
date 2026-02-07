'use client';

import { Modal, ModalBody } from '@/components/ui/modal';
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
      size="4xl"
      className="overflow-hidden"
    >
      <ModalBody className="p-6 sm:p-8">
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          {scope ? (
            <RichTextDisplay content={scope} />
          ) : (
            <div className="py-12 text-center">
              <p className="text-text-muted">
                No scope of work defined for this service.
              </p>
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
