'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ContactSearchSelect } from '@/components/ui/contact-search-select';
import { relationshipOptions } from './types';

interface LinkContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (contactId: string, relationship: string) => Promise<void>;
  isLoading: boolean;
}

export function LinkContactModal({ isOpen, onClose, onSubmit, isLoading }: LinkContactModalProps) {
  const [contactId, setContactId] = useState('');
  const [relationship, setRelationship] = useState('');

  const handleSubmit = async () => {
    await onSubmit(contactId, relationship);
    resetForm();
  };

  const resetForm = () => {
    setContactId('');
    setRelationship('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isValid = contactId && relationship;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Link Contact" size="lg">
      <ModalBody className="space-y-4">
        {/* Contact Search */}
        <ContactSearchSelect
          label="Contact"
          value={contactId}
          onChange={(id) => setContactId(id)}
          placeholder="Search for a contact..."
        />

        {/* Relationship */}
        <div>
          <label className="label">Relationship</label>
          <select
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="input input-sm w-full"
          >
            <option value="">Select relationship...</option>
            {relationshipOptions.map((rel) => (
              <option key={rel} value={rel}>{rel}</option>
            ))}
          </select>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isLoading || !isValid}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Link Contact
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// Keep backward compatibility - export both names
export { LinkContactModal as AddContactModal };
