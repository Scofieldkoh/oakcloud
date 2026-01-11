'use client';

import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useContacts } from '@/hooks/use-contacts';
import { AsyncSearchSelect, type AsyncSearchSelectOption } from './async-search-select';
import type { Contact } from '@/generated/prisma';

// Extend the base option interface with Contact-specific fields
interface ContactOption extends AsyncSearchSelectOption {
  contact: Contact;
}

interface ContactSearchSelectProps {
  label?: string;
  value: string;
  onChange: (contactId: string, contact: Contact | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ContactSearchSelect({
  label,
  value,
  onChange,
  placeholder = 'Search contacts...',
  disabled = false,
  className,
}: ContactSearchSelectProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch contacts with server-side search
  const { data: contactsData, isLoading } = useContacts({
    query: debouncedQuery || undefined,
    limit: 50,
    sortBy: 'fullName',
    sortOrder: 'asc',
  });

  // Transform contacts to options format
  const options: ContactOption[] = (contactsData?.contacts || []).map((contact) => ({
    id: contact.id,
    label: contact.fullName,
    description: contact.identificationNumber || undefined,
    contact,
  }));

  const handleChange = (id: string, option: ContactOption | null) => {
    onChange(id, option?.contact || null);
  };

  return (
    <AsyncSearchSelect<ContactOption>
      label={label}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      options={options}
      isLoading={isLoading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      icon={<User className="w-4 h-4" />}
      emptySearchText="Type to search contacts"
      noResultsText="No contacts found"
    />
  );
}
