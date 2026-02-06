'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Users,
  FileText,
  History,
  Calendar,
  Briefcase,
  Landmark,
  Shield,
  Building2,
  CreditCard,
  User,
  Filter,
  Pencil as PencilIcon,
  X,
  Plus,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import {
  useUpdateOfficer,
  useUpdateShareholder,
  useDeleteOfficer,
  useRemoveShareholder,
  useDeleteShareholder,
  useCompanyBizFile,
} from '@/hooks/use-companies';
import { formatDate, formatCurrency, formatPercentage } from '@/lib/utils';
import type { CompanyWithRelations } from '@/services/company/types';
import { AddOfficerModal } from './add-officer-modal';
import { AddShareholderModal } from './add-shareholder-modal';

// Extract officer and shareholder types from CompanyWithRelations
type Officer = NonNullable<CompanyWithRelations['officers']>[number];
type Shareholder = NonNullable<CompanyWithRelations['shareholders']>[number];

// Helper to convert UPPER_CASE or UPPERCASE to Title Case
// Preserves known acronyms like CEO, CFO
const KNOWN_ACRONYMS = ['CEO', 'CFO'];
function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => {
      const upper = word.toUpperCase();
      // Keep known acronyms uppercase
      if (KNOWN_ACRONYMS.includes(upper)) return upper;
      // Otherwise title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// Helper to format address with proper punctuation
function formatAddress(address: string | null | undefined): string | null {
  if (!address) return null;

  // If address already has commas, return as-is
  if (address.includes(',')) return address;

  // Common Singapore address pattern: "123 Street Name #01-23 Building Name Singapore 123456"
  // Try to add commas intelligently
  let formatted = address;

  // Add comma before unit number (#XX-XX)
  formatted = formatted.replace(/\s+(#\d+[-–]\d+)/g, ', $1');

  // Add comma before "Singapore" (with or without postal code)
  formatted = formatted.replace(/\s+(Singapore)(\s+\d{6})?$/gi, ', $1$2');

  return formatted;
}

// Helper to get contact address
function getContactAddress(contact: {
  fullAddress?: string | null;
} | null | undefined): string | null {
  if (!contact) return null;
  return formatAddress(contact.fullAddress);
}

function isOfficerActive(officer: Officer): boolean {
  return officer.isCurrent && !officer.cessationDate;
}

interface CompanyProfileTabProps {
  company: CompanyWithRelations;
  companyId: string;
  can: {
    updateCompany: boolean;
    deleteOfficer?: boolean;
    deleteShareholder?: boolean;
  };
}

export function CompanyProfileTab({ company, companyId, can }: CompanyProfileTabProps) {
  const { success, error: toastError } = useToast();

  // Check if BizFile is available
  const { data: bizFileInfo, isLoading: isBizFileLoading } = useCompanyBizFile(companyId);

  // Filter state for officers
  const [officerNameFilter, setOfficerNameFilter] = useState('');
  const [officerRoleFilter, setOfficerRoleFilter] = useState('');
  const [showCeasedOfficers, setShowCeasedOfficers] = useState(false);
  const [showOfficerFilters, setShowOfficerFilters] = useState(false);

  // Filter state for shareholders
  const [shareholderNameFilter, setShareholderNameFilter] = useState('');
  const [showFormerShareholders, setShowFormerShareholders] = useState(false);
  const [showShareholderFilters, setShowShareholderFilters] = useState(false);

  // Add modal state
  const [addOfficerModalOpen, setAddOfficerModalOpen] = useState(false);
  const [addShareholderModalOpen, setAddShareholderModalOpen] = useState(false);

  // Update and remove hooks
  const updateOfficerMutation = useUpdateOfficer(companyId);
  const updateShareholderMutation = useUpdateShareholder(companyId);
  const deleteOfficerMutation = useDeleteOfficer(companyId);
  const removeShareholderMutation = useRemoveShareholder(companyId);
  const deleteShareholderMutation = useDeleteShareholder(companyId);

  // Edit modals state
  const [editOfficerModalOpen, setEditOfficerModalOpen] = useState(false);
  const [editShareholderModalOpen, setEditShareholderModalOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<{
    id: string;
    name: string;
    role: string;
    appointmentDate: string | null;
    cessationDate: string | null;
  } | null>(null);
  const [selectedShareholder, setSelectedShareholder] = useState<{
    id: string;
    name: string;
    numberOfShares: number;
    shareClass: string | null;
    isCurrent: boolean;
  } | null>(null);
  const [editOfficerForm, setEditOfficerForm] = useState({
    appointmentDate: '',
    cessationDate: '',
  });
  const [editShareholderForm, setEditShareholderForm] = useState({
    numberOfShares: '',
    shareClass: '',
  });
  const [deleteOfficerConfirm, setDeleteOfficerConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteShareholderConfirm, setDeleteShareholderConfirm] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteOfficer = async () => {
    if (!deleteOfficerConfirm) return;

    try {
      await deleteOfficerMutation.mutateAsync(deleteOfficerConfirm.id);
      success('Officer deleted successfully');
      setDeleteOfficerConfirm(null);
      setEditOfficerModalOpen(false);
      setSelectedOfficer(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete officer');
    }
  };

  const handleDeleteShareholder = async () => {
    if (!deleteShareholderConfirm) return;

    try {
      await deleteShareholderMutation.mutateAsync(deleteShareholderConfirm.id);
      success('Shareholder deleted successfully');
      setDeleteShareholderConfirm(null);
      setEditShareholderModalOpen(false);
      setSelectedShareholder(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete shareholder');
    }
  };

  // Open edit officer modal
  const openEditOfficerModal = (officer: Officer) => {
    const appointmentDateStr = officer.appointmentDate
      ? (typeof officer.appointmentDate === 'string' ? officer.appointmentDate : officer.appointmentDate.toISOString()).split('T')[0]
      : '';
    const cessationDateStr = officer.cessationDate
      ? (typeof officer.cessationDate === 'string' ? officer.cessationDate : officer.cessationDate.toISOString()).split('T')[0]
      : '';
    setSelectedOfficer({
      id: officer.id,
      name: officer.name,
      role: officer.role,
      appointmentDate: appointmentDateStr || null,
      cessationDate: cessationDateStr || null,
    });
    setEditOfficerForm({
      appointmentDate: appointmentDateStr,
      cessationDate: cessationDateStr,
    });
    setEditOfficerModalOpen(true);
  };

  // Handle edit officer
  const handleEditOfficer = async () => {
    if (!selectedOfficer) return;

    // Validate cessation date is not before appointment date
    if (editOfficerForm.appointmentDate && editOfficerForm.cessationDate) {
      const appointmentDate = new Date(editOfficerForm.appointmentDate);
      const cessationDate = new Date(editOfficerForm.cessationDate);
      if (cessationDate < appointmentDate) {
        toastError('Cessation date cannot be earlier than appointment date');
        return;
      }
    }

    try {
      await updateOfficerMutation.mutateAsync({
        officerId: selectedOfficer.id,
        data: {
          appointmentDate: editOfficerForm.appointmentDate || null,
          cessationDate: editOfficerForm.cessationDate || null,
        },
      });
      success('Officer updated successfully');
      setEditOfficerModalOpen(false);
      setSelectedOfficer(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update officer');
    }
  };

  // Open edit shareholder modal
  const openEditShareholderModal = (shareholder: Shareholder) => {
    setSelectedShareholder({
      id: shareholder.id,
      name: shareholder.name,
      numberOfShares: shareholder.numberOfShares,
      shareClass: shareholder.shareClass || null,
      isCurrent: shareholder.isCurrent,
    });
    setEditShareholderForm({
      numberOfShares: shareholder.numberOfShares.toString(),
      shareClass: shareholder.shareClass || 'Ordinary',
    });
    setEditShareholderModalOpen(true);
  };

  // Handle edit shareholder
  const handleEditShareholder = async () => {
    if (!selectedShareholder) return;

    const numberOfShares = parseInt(editShareholderForm.numberOfShares);
    if (isNaN(numberOfShares) || numberOfShares <= 0) {
      toastError('Please enter a valid number of shares');
      return;
    }

    try {
      await updateShareholderMutation.mutateAsync({
        shareholderId: selectedShareholder.id,
        data: {
          numberOfShares,
          shareClass: editShareholderForm.shareClass,
        },
      });
      success('Shareholder updated successfully');
      setEditShareholderModalOpen(false);
      setSelectedShareholder(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update shareholder');
    }
  };

  const handleMarkShareholderFormer = async () => {
    if (!selectedShareholder) return;

    try {
      await removeShareholderMutation.mutateAsync(selectedShareholder.id);
      success('Shareholder marked as former');
      setEditShareholderModalOpen(false);
      setSelectedShareholder(null);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mark shareholder as former');
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Business Activity */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-text-tertiary" />
                Business Activity
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {company.primarySsicCode && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase mb-1">Primary Activity</p>
                  <p className="text-text-primary">
                    <span className="text-text-secondary mr-2">{company.primarySsicCode}</span>
                    {company.primarySsicDescription}
                  </p>
                </div>
              )}
              {company.secondarySsicCode && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase mb-1">Secondary Activity</p>
                  <p className="text-text-primary">
                    <span className="text-text-secondary mr-2">{company.secondarySsicCode}</span>
                    {company.secondarySsicDescription}
                  </p>
                </div>
              )}
              {!company.primarySsicCode && !company.secondarySsicCode && (
                <p className="text-text-muted">No business activity recorded</p>
              )}
            </div>
          </div>

          {/* Addresses */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <MapPin className="w-4 h-4 text-text-tertiary" />
                Addresses
              </h2>
            </div>
            <div className="divide-y divide-border-primary">
              {company.addresses && company.addresses.length > 0 ? (
                company.addresses.map((address) => (
                  <div key={address.id} className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-text-tertiary uppercase">
                        {address.addressType.replace(/_/g, ' ')}
                      </span>
                      {address.isCurrent && (
                        <span className="badge badge-success text-2xs">Current</span>
                      )}
                    </div>
                    <p className="text-sm text-text-primary">{formatAddress(address.fullAddress)}</p>
                    {company.dateOfAddress && address.addressType === 'REGISTERED_OFFICE' && address.isCurrent && (
                      <p className="text-xs text-text-secondary mt-1">
                        Effective since {formatDate(company.dateOfAddress)}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4">
                  <p className="text-text-muted">No addresses recorded</p>
                </div>
              )}
            </div>
          </div>

          {/* Officers */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <Users className="w-4 h-4 text-text-tertiary" />
                  Officers
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-tertiary">
                    {(() => {
                      const officers = company.officers || [];
                      const activeCount = officers.filter(isOfficerActive).length;
                      const pastCount = officers.length - activeCount;
                      return `${activeCount} active; ${pastCount} past`;
                    })()}
                  </span>
                  {company.officers && company.officers.length > 0 && (
                    <button
                      onClick={() => setShowOfficerFilters(!showOfficerFilters)}
                      className={`btn-ghost btn-xs flex items-center gap-1 ${
                        officerNameFilter || officerRoleFilter || showCeasedOfficers ? 'text-oak-light' : ''
                      }`}
                      title="Filter officers"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {can.updateCompany && (
                    <button
                      onClick={() => setAddOfficerModalOpen(true)}
                      className="btn-ghost btn-xs flex items-center gap-1 text-oak-light hover:text-oak-dark"
                      title="Add officer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {/* Filter Panel */}
              {showOfficerFilters && (
                <div className="mt-3 pt-3 border-t border-border-secondary animate-fade-in">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[120px] max-w-[180px]">
                      <label className="text-xs text-text-tertiary mb-1 block">Name</label>
                      <input
                        type="text"
                        value={officerNameFilter}
                        onChange={(e) => setOfficerNameFilter(e.target.value)}
                        placeholder="Search..."
                        className="input input-xs w-full"
                      />
                    </div>
                    <div className="min-w-[120px]">
                      <label className="text-xs text-text-tertiary mb-1 block">Role</label>
                      <select
                        value={officerRoleFilter}
                        onChange={(e) => setOfficerRoleFilter(e.target.value)}
                        className="input input-xs w-full"
                      >
                        <option value="">All Roles</option>
                        {Array.from(new Set(company.officers?.map(o => o.role) || [])).sort().map(role => (
                          <option key={role} value={role}>{toTitleCase(role)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 h-[26px]">
                      <Checkbox
                        id="show-ceased-officers"
                        checked={showCeasedOfficers}
                        onChange={(e) => setShowCeasedOfficers(e.target.checked)}
                        size="sm"
                      />
                      <label htmlFor="show-ceased-officers" className="text-xs text-text-secondary cursor-pointer">
                        Show ceased
                      </label>
                    </div>
                    {(officerNameFilter || officerRoleFilter || showCeasedOfficers) && (
                      <button
                        onClick={() => {
                          setOfficerNameFilter('');
                          setOfficerRoleFilter('');
                          setShowCeasedOfficers(false);
                        }}
                        className="btn-ghost btn-xs text-text-muted hover:text-text-primary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="divide-y divide-border-primary">
              {company.officers && company.officers.length > 0 ? (
                company.officers
                  .filter((officer) => {
                    // Name filter
                    if (officerNameFilter) {
                      const searchTerm = officerNameFilter.toLowerCase();
                      if (!officer.name.toLowerCase().includes(searchTerm)) return false;
                    }
                    // Role filter
                    if (officerRoleFilter) {
                      if (officer.role !== officerRoleFilter) return false;
                    }
                    // Show ceased filter
                    if (!showCeasedOfficers && !isOfficerActive(officer)) return false;
                    return true;
                  })
                  .map((officer) => (
                  <div key={officer.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {officer.contact?.id ? (
                            <Link
                              href={`/contacts/${officer.contact.id}`}
                              className="text-text-primary font-medium hover:text-oak-light transition-colors"
                            >
                              {officer.contact.fullName || officer.name}
                            </Link>
                          ) : (
                            <span className="text-text-primary font-medium">{officer.name}</span>
                          )}
                          <span className="badge badge-info">
                            {toTitleCase(officer.role)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {can.updateCompany && (
                          <button
                            onClick={() => openEditOfficerModal(officer)}
                            className="text-text-muted hover:text-oak-light transition-colors"
                            title="Edit officer"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isOfficerActive(officer) ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-neutral">Ceased</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      {/* Appointment Date */}
                      {officer.appointmentDate && (
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                          Appointed {formatDate(officer.appointmentDate)}
                        </div>
                      )}
                      {/* NRIC | Nationality | Address - inline with separators */}
                      {(officer.contact?.identificationNumber || officer.contact?.nationality || officer.nationality || getContactAddress(officer.contact) || officer.address) && (
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-text-secondary">
                          {officer.contact?.identificationNumber && (
                            <>
                              <span>{officer.contact.identificationType || 'NRIC'}: {officer.contact.identificationNumber}</span>
                              {((officer.contact?.nationality || officer.nationality) || (getContactAddress(officer.contact) || officer.address)) && (
                                <span className="text-text-tertiary">•</span>
                              )}
                            </>
                          )}
                          {(officer.contact?.nationality || officer.nationality) && (
                            <>
                              <span>{officer.contact?.nationality || officer.nationality}</span>
                              {(getContactAddress(officer.contact) || officer.address) && (
                                <span className="text-text-tertiary">•</span>
                              )}
                            </>
                          )}
                          {(getContactAddress(officer.contact) || officer.address) && (
                            <span>{getContactAddress(officer.contact) || formatAddress(officer.address)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4">
                  <p className="text-text-muted">No officers recorded</p>
                </div>
              )}
              {company.officers && company.officers.length > 0 &&
                company.officers.filter((officer) => {
                  if (officerNameFilter && !officer.name.toLowerCase().includes(officerNameFilter.toLowerCase())) return false;
                  if (officerRoleFilter && officer.role !== officerRoleFilter) return false;
                  if (!showCeasedOfficers && !isOfficerActive(officer)) return false;
                  return true;
                }).length === 0 && (
                <div className="p-4 text-center">
                  <p className="text-text-muted text-sm">No officers match your filters</p>
                </div>
              )}
            </div>
          </div>

          {/* Shareholders */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <Shield className="w-4 h-4 text-text-tertiary" />
                  Shareholders
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-tertiary">
                    {company._count?.shareholders || 0} total
                  </span>
                  {company.shareholders && company.shareholders.length > 0 && (
                    <button
                      onClick={() => setShowShareholderFilters(!showShareholderFilters)}
                      className={`btn-ghost btn-xs flex items-center gap-1 ${
                        shareholderNameFilter || showFormerShareholders ? 'text-oak-light' : ''
                      }`}
                      title="Filter shareholders"
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {can.updateCompany && (
                    <button
                      onClick={() => setAddShareholderModalOpen(true)}
                      className="btn-ghost btn-xs flex items-center gap-1 text-oak-light hover:text-oak-dark"
                      title="Add shareholder"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {/* Filter Panel */}
              {showShareholderFilters && (
                <div className="mt-3 pt-3 border-t border-border-secondary animate-fade-in">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[120px] max-w-[180px]">
                      <label className="text-xs text-text-tertiary mb-1 block">Name</label>
                      <input
                        type="text"
                        value={shareholderNameFilter}
                        onChange={(e) => setShareholderNameFilter(e.target.value)}
                        placeholder="Search..."
                        className="input input-xs w-full"
                      />
                    </div>
                    <div className="flex items-center gap-2 h-[26px]">
                      <Checkbox
                        id="show-former-shareholders"
                        checked={showFormerShareholders}
                        onChange={(e) => setShowFormerShareholders(e.target.checked)}
                        size="sm"
                      />
                      <label htmlFor="show-former-shareholders" className="text-xs text-text-secondary cursor-pointer">
                        Show former
                      </label>
                    </div>
                    {(shareholderNameFilter || showFormerShareholders) && (
                      <button
                        onClick={() => {
                          setShareholderNameFilter('');
                          setShowFormerShareholders(false);
                        }}
                        className="btn-ghost btn-xs text-text-muted hover:text-text-primary"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="divide-y divide-border-primary">
              {company.shareholders && company.shareholders.length > 0 ? (
                company.shareholders
                  .filter((shareholder) => {
                    // Name filter
                    if (shareholderNameFilter) {
                      const searchTerm = shareholderNameFilter.toLowerCase();
                      if (!shareholder.name.toLowerCase().includes(searchTerm)) return false;
                    }
                    // Show former filter
                    if (!showFormerShareholders && !shareholder.isCurrent) return false;
                    return true;
                  })
                  .map((shareholder) => (
                  <div key={shareholder.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {shareholder.contact?.id ? (
                          <Link
                            href={`/contacts/${shareholder.contact.id}`}
                            className="text-text-primary font-medium hover:text-oak-light transition-colors"
                          >
                            {shareholder.contact.fullName || shareholder.name}
                          </Link>
                        ) : (
                          <span className="text-text-primary font-medium">{shareholder.name}</span>
                        )}
                        {shareholder.shareholderType === 'CORPORATE' && (
                          <span title="Corporate Shareholder">
                            <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                          </span>
                        )}
                        {shareholder.shareholderType === 'INDIVIDUAL' && (
                          <span title="Individual Shareholder">
                            <User className="w-3.5 h-3.5 text-text-tertiary" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {can.updateCompany && (
                          <button
                            onClick={() => openEditShareholderModal(shareholder)}
                            className="text-text-muted hover:text-oak-light transition-colors"
                            title="Edit shareholder"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {shareholder.isCurrent && (
                          <span className="badge badge-success">Active</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm text-text-secondary">
                      {/* Shares Details */}
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-text-tertiary" />
                        {shareholder.numberOfShares.toLocaleString()} {toTitleCase(shareholder.shareClass || 'Ordinary')} shares
                        {shareholder.percentageHeld !== null && shareholder.percentageHeld !== undefined && (
                          <span className="ml-1 text-text-tertiary">
                            ({formatPercentage(shareholder.percentageHeld)})
                          </span>
                        )}
                      </div>
                      {/* NRIC | Nationality | Address - inline with separators */}
                      {(shareholder.contact?.identificationNumber || shareholder.identificationNumber || shareholder.contact?.nationality || shareholder.nationality || shareholder.placeOfOrigin || getContactAddress(shareholder.contact) || shareholder.address) && (
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          {(shareholder.contact?.identificationNumber || shareholder.identificationNumber) && (
                            <>
                              <span>
                                {shareholder.contact?.identificationType || shareholder.identificationType || 'NRIC'}:{' '}
                                {shareholder.contact?.identificationNumber || shareholder.identificationNumber}
                              </span>
                              {((shareholder.contact?.nationality || shareholder.nationality || shareholder.placeOfOrigin) || (getContactAddress(shareholder.contact) || shareholder.address)) && (
                                <span className="text-text-tertiary">•</span>
                              )}
                            </>
                          )}
                          {(shareholder.contact?.nationality || shareholder.nationality || shareholder.placeOfOrigin) && (
                            <>
                              <span>{shareholder.contact?.nationality || shareholder.nationality || shareholder.placeOfOrigin}</span>
                              {(getContactAddress(shareholder.contact) || shareholder.address) && (
                                <span className="text-text-tertiary">•</span>
                              )}
                            </>
                          )}
                          {(getContactAddress(shareholder.contact) || shareholder.address) && (
                            <span>{getContactAddress(shareholder.contact) || formatAddress(shareholder.address)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4">
                  <p className="text-text-muted">No shareholders recorded</p>
                </div>
              )}
              {company.shareholders && company.shareholders.length > 0 &&
                company.shareholders.filter((shareholder) => {
                  if (shareholderNameFilter && !shareholder.name.toLowerCase().includes(shareholderNameFilter.toLowerCase())) return false;
                  if (!showFormerShareholders && !shareholder.isCurrent) return false;
                  return true;
                }).length === 0 && (
                <div className="p-4 text-center">
                  <p className="text-text-muted text-sm">No shareholders match your filters</p>
                </div>
              )}
            </div>
          </div>

          {/* Charges */}
          {(company.charges && company.charges.length > 0) || company.hasCharges ? (
            <div className="card">
              <div className="p-4 border-b border-border-primary flex items-center justify-between">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-text-tertiary" />
                  Charges
                </h2>
                <span className="text-sm text-text-tertiary">
                  {company._count?.charges || 0} total
                </span>
              </div>
              <div className="divide-y divide-border-primary">
                {company.charges && company.charges.length > 0 ? (
                  company.charges.map((charge) => {
                    // Determine if chargeType should be hidden (duplicate of amount or amount-related term)
                    const chargeTypeNormalized = charge.chargeType?.toLowerCase().replace(/\s+/g, '') || '';
                    const amountTextNormalized = charge.amountSecuredText?.toLowerCase().replace(/\s+/g, '') || '';

                    // Hide chargeType if it matches amountSecuredText or is an amount-related term
                    const amountRelatedTerms = ['allmonies', 'allmoneys', 'fixedsum', 'fixedamount'];
                    const isAmountRelatedTerm = amountRelatedTerms.includes(chargeTypeNormalized);
                    const isDuplicateType = (chargeTypeNormalized && amountTextNormalized &&
                      chargeTypeNormalized === amountTextNormalized) || isAmountRelatedTerm;

                    // Format amount text with proper casing
                    const formatAmountText = (text: string) => {
                      if (text.toUpperCase() === text) {
                        return toTitleCase(text);
                      }
                      return text;
                    };

                    return (
                      <div key={charge.id} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-text-primary font-medium">{charge.chargeHolderName}</p>
                            {charge.chargeType && !isDuplicateType && (
                              <p className="text-sm text-text-tertiary">{toTitleCase(charge.chargeType)}</p>
                            )}
                          </div>
                          {charge.isFullyDischarged ? (
                            <span className="badge badge-success">Discharged</span>
                          ) : (
                            <span className="badge badge-warning">Active</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {charge.chargeNumber && (
                            <div className="text-text-secondary">
                              <span className="text-text-tertiary">Charge #:</span> {charge.chargeNumber}
                            </div>
                          )}
                          {(charge.amountSecured || charge.amountSecuredText) && (
                            <div className="text-text-secondary">
                              <span className="text-text-tertiary">Amount:</span>{' '}
                              {charge.amountSecuredText
                                ? formatAmountText(charge.amountSecuredText)
                                : formatCurrency(charge.amountSecured, charge.currency || 'SGD')}
                            </div>
                          )}
                          {charge.registrationDate && (
                            <div className="text-text-secondary">
                              <span className="text-text-tertiary">Registered:</span> {formatDate(charge.registrationDate)}
                            </div>
                          )}
                          {charge.dischargeDate && (
                            <div className="text-text-secondary">
                              <span className="text-text-tertiary">Discharged:</span> {formatDate(charge.dischargeDate)}
                            </div>
                          )}
                          {charge.description && (
                            <div className="col-span-2 text-text-secondary text-xs mt-1">
                              {charge.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4">
                    <p className="text-text-muted">Charge details not available</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Capital */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Landmark className="w-4 h-4 text-text-tertiary" />
                Capital
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Paid Up Capital</p>
                <p className="text-sm text-text-primary">
                  {company.paidUpCapitalAmount
                    ? formatCurrency(company.paidUpCapitalAmount, company.paidUpCapitalCurrency || 'SGD')
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Issued Capital</p>
                <p className="text-sm text-text-primary">
                  {company.issuedCapitalAmount
                    ? formatCurrency(company.issuedCapitalAmount, company.issuedCapitalCurrency || 'SGD')
                    : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Compliance */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                Compliance
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Financial Year End</p>
                <p className="text-sm text-text-primary">
                  {company.financialYearEndMonth && company.financialYearEndDay
                    ? `${company.financialYearEndDay} ${new Date(2000, company.financialYearEndMonth - 1).toLocaleString('default', { month: 'long' })}`
                    : '-'}
                </p>
              </div>
              {company.fyeAsAtLastAr && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase mb-1">FYE as at Last AR</p>
                  <p className="text-sm text-text-primary">{formatDate(company.fyeAsAtLastAr)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Home Currency</p>
                <p className="text-sm text-text-primary">{company.homeCurrency || 'SGD'}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Last AGM</p>
                <p className="text-sm text-text-primary">{formatDate(company.lastAgmDate)}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase mb-1">Last AR Filed</p>
                <p className="text-sm text-text-primary">{formatDate(company.lastArFiledDate)}</p>
              </div>
              {company.hasCharges && (
                <div className="pt-2 border-t border-border-primary">
                  <span className="badge badge-warning">Has Outstanding Charges</span>
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="card">
            <div className="p-4 border-b border-border-primary flex items-center justify-between">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <FileText className="w-4 h-4 text-text-tertiary" />
                Documents
              </h2>
              <span className="text-sm text-text-tertiary">
                {company._count?.documents || 0}
              </span>
            </div>
            <div className="p-4 space-y-2">
              {/* Only show View BizFile button if BizFile is available */}
              {!isBizFileLoading && bizFileInfo && (
                <button
                  onClick={() => {
                    window.open(bizFileInfo.pdfUrl, '_blank');
                  }}
                  className="btn-primary btn-sm w-full justify-center flex items-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View BizFile
                </button>
              )}
              <Link
                href={`/companies/${companyId}/documents`}
                className="btn-secondary btn-sm w-full justify-center"
              >
                View All Documents
              </Link>
            </div>
          </div>

          {/* Audit History */}
          <div className="card">
            <div className="p-4 border-b border-border-primary">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <History className="w-4 h-4 text-text-tertiary" />
                Audit History
              </h2>
            </div>
            <div className="p-4">
              <Link
                href={`/companies/${companyId}/audit`}
                className="btn-secondary btn-sm w-full justify-center"
              >
                View History
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Officer Modal */}
      <Modal
        isOpen={editOfficerModalOpen}
        onClose={() => {
          setEditOfficerModalOpen(false);
          setSelectedOfficer(null);
        }}
        title="Edit Officer"
      >
        <ModalBody>
          {selectedOfficer && (
            <div className="space-y-4">
              <div className="text-sm text-text-secondary mb-4">
                <span className="font-medium text-text-primary">{selectedOfficer.name}</span>
                <span className="mx-2">-</span>
                <span>{toTitleCase(selectedOfficer.role)}</span>
              </div>
              <div>
                <label className="label">Date of Appointment</label>
                <input
                  type="date"
                  value={editOfficerForm.appointmentDate}
                  onChange={(e) => setEditOfficerForm((prev) => ({ ...prev, appointmentDate: e.target.value }))}
                  className="input input-sm w-full"
                />
              </div>
              <div>
                <label className="label">Date of Cessation</label>
                <input
                  type="date"
                  value={editOfficerForm.cessationDate}
                  onChange={(e) => setEditOfficerForm((prev) => ({ ...prev, cessationDate: e.target.value }))}
                  className="input input-sm w-full"
                />
                <p className="text-xs text-text-muted mt-1">
                  Leave empty if the position is still active
                </p>
              </div>
            </div>
          )}
        </ModalBody>
      <ModalFooter>
        {can.deleteOfficer && selectedOfficer && (
          <Button
            variant="danger"
            onClick={() => setDeleteOfficerConfirm({ id: selectedOfficer.id, name: selectedOfficer.name })}
            disabled={deleteOfficerMutation.isPending}
          >
            Delete
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setEditOfficerModalOpen(false);
            setSelectedOfficer(null);
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleEditOfficer}
          disabled={updateOfficerMutation.isPending}
        >
          {updateOfficerMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </ModalFooter>
    </Modal>

    {/* Delete Officer Confirmation */}
    <ConfirmDialog
      isOpen={!!deleteOfficerConfirm}
      onClose={() => setDeleteOfficerConfirm(null)}
      onConfirm={handleDeleteOfficer}
      title="Delete Officer"
      description={`Are you sure you want to delete "${deleteOfficerConfirm?.name}"? This action cannot be undone.`}
      variant="danger"
      confirmLabel="Delete"
      isLoading={deleteOfficerMutation.isPending}
    />

      {/* Edit Shareholder Modal */}
      <Modal
        isOpen={editShareholderModalOpen}
        onClose={() => {
          setEditShareholderModalOpen(false);
          setSelectedShareholder(null);
        }}
        title="Edit Shareholder"
      >
        <ModalBody>
          {selectedShareholder && (
            <div className="space-y-4">
              <div className="text-sm text-text-secondary mb-4">
                <span className="font-medium text-text-primary">{selectedShareholder.name}</span>
              </div>
              <div>
                <label className="label">Number of Shares</label>
                <input
                  type="number"
                  min="1"
                  value={editShareholderForm.numberOfShares}
                  onChange={(e) => setEditShareholderForm((prev) => ({ ...prev, numberOfShares: e.target.value }))}
                  className="input input-sm w-full"
                  placeholder="Enter number of shares"
                />
              </div>
              <div>
                <label className="label">Share Class</label>
                <select
                  value={editShareholderForm.shareClass}
                  onChange={(e) => setEditShareholderForm((prev) => ({ ...prev, shareClass: e.target.value }))}
                  className="input input-sm w-full"
                >
                  <option value="Ordinary">Ordinary</option>
                  <option value="Preference">Preference</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {selectedShareholder?.isCurrent && (
            <Button
              variant="secondary"
              onClick={handleMarkShareholderFormer}
              disabled={removeShareholderMutation.isPending}
            >
              Mark as Former
            </Button>
          )}
          {can.deleteShareholder && selectedShareholder && (
            <Button
              variant="danger"
              onClick={() => setDeleteShareholderConfirm({ id: selectedShareholder.id, name: selectedShareholder.name })}
              disabled={deleteShareholderMutation.isPending}
            >
              Delete
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setEditShareholderModalOpen(false);
              setSelectedShareholder(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleEditShareholder}
            disabled={updateShareholderMutation.isPending}
          >
            {updateShareholderMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Shareholder Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteShareholderConfirm}
        onClose={() => setDeleteShareholderConfirm(null)}
        onConfirm={handleDeleteShareholder}
        title="Delete Shareholder"
        description={`Are you sure you want to delete "${deleteShareholderConfirm?.name}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteShareholderMutation.isPending}
      />

      {/* Add Officer Modal */}
      <AddOfficerModal
        isOpen={addOfficerModalOpen}
        onClose={() => setAddOfficerModalOpen(false)}
        companyId={companyId}
        companyName={company.name}
      />

      {/* Add Shareholder Modal */}
      <AddShareholderModal
        isOpen={addShareholderModalOpen}
        onClose={() => setAddShareholderModalOpen(false)}
        companyId={companyId}
        companyName={company.name}
      />
    </>
  );
}
