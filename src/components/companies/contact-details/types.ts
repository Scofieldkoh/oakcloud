import type { ContactDetailType } from '@/generated/prisma';
import type { ContactDetail, ContactWithDetails } from '@/hooks/use-contact-details';
import { Mail, Phone, Globe, FileText } from 'lucide-react';

// Detail type icons and labels
export const detailTypeConfig: Record<ContactDetailType, { icon: typeof Mail; label: string; placeholder: string }> = {
  EMAIL: { icon: Mail, label: 'Email', placeholder: 'email@example.com' },
  PHONE: { icon: Phone, label: 'Phone', placeholder: '+65 1234 5678' },
  WEBSITE: { icon: Globe, label: 'Website', placeholder: 'https://example.com' },
  OTHER: { icon: FileText, label: 'Other', placeholder: 'Enter value' },
};

// Common label suggestions
export const labelSuggestions = [
  'Main Office',
  'Account Receivable',
  'Account Payable',
  'Human Resources',
  'Sales',
  'Support',
  'Personal',
  'Work',
  'Home',
  'Emergency',
];

// Relationship options
export const relationshipOptions = [
  'Agent',
  'Authorized Representative',
  'Accountant',
  'Lawyer',
  'Consultant',
  'Vendor',
  'Customer',
  'Partner',
  'Other',
];

// Edit form type
export interface EditFormState {
  detailType: ContactDetailType;
  value: string;
  label: string;
  purposes: string[];
  isPrimary: boolean;
}

// Re-export types
export type { ContactDetail, ContactWithDetails };
