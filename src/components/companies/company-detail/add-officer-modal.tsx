'use client';

import { useState, useEffect } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { SearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import { useLinkContactToCompany } from '@/hooks/use-contacts';
import { useToast } from '@/components/ui/toast';
import { ContactSearchSelect } from '@/components/ui/contact-search-select';
import type { Contact } from '@/generated/prisma';

// Officer role options mapping
const OFFICER_ROLES: SelectOption[] = [
  { value: 'Director', label: 'Director' },
  { value: 'Managing Director', label: 'Managing Director' },
  { value: 'Alternate Director', label: 'Alternate Director' },
  { value: 'Secretary', label: 'Secretary' },
  { value: 'CEO', label: 'CEO' },
  { value: 'CFO', label: 'CFO' },
  { value: 'Auditor', label: 'Auditor' },
  { value: 'Liquidator', label: 'Liquidator' },
  { value: 'Receiver', label: 'Receiver' },
  { value: 'Judicial Manager', label: 'Judicial Manager' },
];

interface AddOfficerModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
}

export function AddOfficerModal({ isOpen, onClose, companyId, companyName }: AddOfficerModalProps) {
  const { success, error: toastError } = useToast();
  const linkContactMutation = useLinkContactToCompany();

  // Form state
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [role, setRole] = useState('Director');
  const [appointmentDate, setAppointmentDate] = useState('');

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedContactId('');
      setSelectedContact(null);
      setRole('Director');
      setAppointmentDate('');
    }
  }, [isOpen]);

  const handleContactChange = (contactId: string, contact: Contact | null) => {
    setSelectedContactId(contactId);
    setSelectedContact(contact);
  };

  const handleSubmit = async () => {
    if (!selectedContactId) {
      toastError('Please select a contact');
      return;
    }

    try {
      await linkContactMutation.mutateAsync({
        contactId: selectedContactId,
        companyId,
        relationship: role,
        appointmentDate: appointmentDate || undefined,
      });
      success(`${selectedContact?.fullName} added as ${role}`);
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to add officer');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Officer" size="lg">
      <ModalBody>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Link an existing contact as an officer to <span className="font-medium text-text-primary">{companyName}</span>
          </p>

          {/* Contact Select with server-side search */}
          <ContactSearchSelect
            label="Select Contact"
            value={selectedContactId}
            onChange={handleContactChange}
            placeholder="Search contacts by name or email..."
          />

          {/* Role */}
          <div>
            <SearchableSelect
              label="Role"
              options={OFFICER_ROLES}
              value={role}
              onChange={setRole}
              placeholder="Select role..."
              clearable={false}
              showKeyboardHints={false}
            />
          </div>

          {/* Appointment Date */}
          <div>
            <label className="label">Date of Appointment</label>
            <input
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="input input-sm w-full"
            />
            <p className="text-xs text-text-muted mt-1">Optional</p>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!selectedContactId || linkContactMutation.isPending}
        >
          {linkContactMutation.isPending ? 'Adding...' : 'Add Officer'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
