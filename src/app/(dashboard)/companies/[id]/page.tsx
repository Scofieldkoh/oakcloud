'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Users,
  FileText,
  History,
  Pencil,
  Trash2,
  AlertCircle,
  Calendar,
  Briefcase,
  Landmark,
  Shield,
  Upload,
  Building2,
  CreditCard,
  Globe,
  User,
  Contact,
} from 'lucide-react';
import {
  useCompany,
  useDeleteCompany,
  useCompanyLinkInfo,
  useUpdateOfficer,
  useUpdateShareholder,
  useRemoveOfficer,
  useRemoveShareholder,
} from '@/hooks/use-companies';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate, formatCurrency, formatPercentage } from '@/lib/utils';
import { getEntityTypeLabel } from '@/lib/constants';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { X, Filter, Pencil as PencilIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { InternalNotes } from '@/components/notes/internal-notes';
import { ContactDetailsModal } from '@/components/companies/contact-details';

// Helper to convert UPPER_CASE or UPPERCASE to Title Case
function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Helper to get contact address
function getContactAddress(contact: {
  fullAddress?: string | null;
} | null | undefined): string | null {
  if (!contact) return null;
  return contact.fullAddress || null;
}

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: company, isLoading, error } = useCompany(id);
  const deleteCompany = useDeleteCompany();
  const { success, error: toastError } = useToast();
  // Get permissions for this specific company
  const { can } = usePermissions(id);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactDetailsModalOpen, setContactDetailsModalOpen] = useState(false);

  // Filter state for officers
  const [officerNameFilter, setOfficerNameFilter] = useState('');
  const [officerRoleFilter, setOfficerRoleFilter] = useState('');
  const [showCeasedOfficers, setShowCeasedOfficers] = useState(false);
  const [showOfficerFilters, setShowOfficerFilters] = useState(false);

  // Filter state for shareholders
  const [shareholderNameFilter, setShareholderNameFilter] = useState('');
  const [showFormerShareholders, setShowFormerShareholders] = useState(false);
  const [showShareholderFilters, setShowShareholderFilters] = useState(false);

  // Update and remove hooks
  const updateOfficerMutation = useUpdateOfficer(id);
  const updateShareholderMutation = useUpdateShareholder(id);
  const removeOfficerMutation = useRemoveOfficer(id);
  const removeShareholderMutation = useRemoveShareholder(id);

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
  } | null>(null);
  const [editOfficerForm, setEditOfficerForm] = useState({
    appointmentDate: '',
    cessationDate: '',
  });
  const [editShareholderForm, setEditShareholderForm] = useState({
    numberOfShares: '',
    shareClass: '',
  });

  // Handle remove action (mark as ceased/former)
  const handleRemove = async (type: 'officer' | 'shareholder', targetId: string) => {
    try {
      if (type === 'officer') {
        await removeOfficerMutation.mutateAsync(targetId);
      } else {
        await removeShareholderMutation.mutateAsync(targetId);
      }
      success(`${type === 'officer' ? 'Officer' : 'Shareholder'} removed successfully`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  // Open edit officer modal
  const openEditOfficerModal = (officer: {
    id: string;
    name: string;
    role: string;
    appointmentDate?: Date | string | null;
    cessationDate?: Date | string | null;
  }) => {
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
  const openEditShareholderModal = (shareholder: {
    id: string;
    name: string;
    numberOfShares: number;
    shareClass?: string | null;
  }) => {
    setSelectedShareholder({
      id: shareholder.id,
      name: shareholder.name,
      numberOfShares: shareholder.numberOfShares,
      shareClass: shareholder.shareClass || null,
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

  // Fetch link info when delete dialog opens
  const { data: linkInfo } = useCompanyLinkInfo(deleteDialogOpen ? id : null);

  // Build warning message based on links
  const getDeleteWarning = () => {
    if (!linkInfo?.hasLinks) {
      return 'This action cannot be undone. The company will be soft-deleted and can be restored later.';
    }

    const parts: string[] = [];
    if (linkInfo.officerCount > 0) parts.push(`${linkInfo.officerCount} officer(s)`);
    if (linkInfo.shareholderCount > 0) parts.push(`${linkInfo.shareholderCount} shareholder(s)`);
    if (linkInfo.chargeCount > 0) parts.push(`${linkInfo.chargeCount} charge(s)`);
    if (linkInfo.documentCount > 0) parts.push(`${linkInfo.documentCount} document(s)`);

    return `Warning: This company has ${parts.join(', ')} linked. Deleting will remove these links, but the underlying data (contacts, documents) will remain. This action cannot be undone.`;
  };

  const handleDeleteConfirm = async (reason?: string) => {
    if (!reason) return;

    try {
      await deleteCompany.mutateAsync({ id, reason });
      success('Company deleted successfully');
      router.push('/companies');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete company');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton" />
          <div className="h-4 w-48 skeleton" />
          <div className="grid grid-cols-3 gap-6">
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
            <div className="h-32 skeleton rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-6">
        <div className="card p-8 text-center">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Company not found</h2>
          <p className="text-text-secondary mb-4">
            {error instanceof Error ? error.message : 'The company you are looking for does not exist.'}
          </p>
          <Link href="/companies" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig: Record<string, { color: string; label: string }> = {
    LIVE: { color: 'badge-success', label: 'Live' },
    STRUCK_OFF: { color: 'badge-error', label: 'Struck Off' },
    WINDING_UP: { color: 'badge-warning', label: 'Winding Up' },
    DISSOLVED: { color: 'badge-neutral', label: 'Dissolved' },
    IN_LIQUIDATION: { color: 'badge-warning', label: 'In Liquidation' },
    IN_RECEIVERSHIP: { color: 'badge-warning', label: 'In Receivership' },
    AMALGAMATED: { color: 'badge-info', label: 'Amalgamated' },
    CONVERTED: { color: 'badge-info', label: 'Converted' },
    OTHER: { color: 'badge-neutral', label: 'Other' },
  };


  const currentStatus = statusConfig[company.status] || { color: 'badge-neutral', label: company.status };

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <Link
            href="/companies"
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Companies
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">{company.name}</h1>
            <span className={`badge ${currentStatus.color}`}>
              {currentStatus.label}
            </span>
            {company.statusDate && (
              <span className="text-xs text-text-muted">
                As at {formatDate(company.statusDate)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 text-sm text-text-secondary">
            <span>{company.uen}</span>
            <span>{getEntityTypeLabel(company.entityType, true)}</span>
            {company.incorporationDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Incorporated {formatDate(company.incorporationDate)}
              </span>
            )}
          </div>
        </div>
        {(can.updateCompany || can.deleteCompany || can.readCompany) && (
          <div className="flex items-center gap-2 sm:gap-3">
            {can.readCompany && (
              <button
                onClick={() => setContactDetailsModalOpen(true)}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Contact className="w-4 h-4" />
                <span className="hidden sm:inline">Contact Details</span>
                <span className="sm:hidden">Contacts</span>
              </button>
            )}
            {can.updateCompany && (
              <Link
                href={`/companies/upload?companyId=${id}`}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Update via BizFile</span>
                <span className="sm:hidden">BizFile</span>
              </Link>
            )}
            {can.updateCompany && (
              <Link
                href={`/companies/${id}/edit`}
                className="btn-secondary btn-sm flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
            {can.deleteCompany && (
              <button
                onClick={() => setDeleteDialogOpen(true)}
                className="btn-danger btn-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

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
                    <p className="text-sm text-text-primary">{address.fullAddress}</p>
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
                    {company._count?.officers || 0} total
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
                    if (!showCeasedOfficers && !officer.isCurrent) return false;
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
                              {officer.name}
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
                        {can.updateCompany && officer.isCurrent && (
                          <button
                            onClick={() => handleRemove('officer', officer.id)}
                            className="text-text-muted hover:text-status-error transition-colors"
                            title="Remove officer"
                            disabled={removeOfficerMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {officer.isCurrent ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <span className="badge badge-neutral">Ceased</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {officer.appointmentDate && (
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                          Appointed {formatDate(officer.appointmentDate)}
                        </div>
                      )}
                      {(officer.contact?.nationality || officer.nationality) && (
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <Globe className="w-3.5 h-3.5 text-text-tertiary" />
                          {officer.contact?.nationality || officer.nationality}
                        </div>
                      )}
                      {(getContactAddress(officer.contact) || officer.address) && (
                        <div className="col-span-2 flex items-start gap-1.5 text-text-secondary">
                          <MapPin className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                          <span className="text-xs">{getContactAddress(officer.contact) || officer.address}</span>
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
                  if (!showCeasedOfficers && !officer.isCurrent) return false;
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
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {shareholder.contact?.id ? (
                            <Link
                              href={`/contacts/${shareholder.contact.id}`}
                              className="text-text-primary font-medium hover:text-oak-light transition-colors"
                            >
                              {shareholder.name}
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
                        <p className="text-sm text-text-secondary">
                          {shareholder.numberOfShares.toLocaleString()} {toTitleCase(shareholder.shareClass || 'Ordinary')} shares
                          {shareholder.percentageHeld !== null && shareholder.percentageHeld !== undefined && (
                            <span className="ml-2 text-text-tertiary">
                              ({formatPercentage(shareholder.percentageHeld)})
                            </span>
                          )}
                        </p>
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
                        {can.updateCompany && shareholder.isCurrent && (
                          <button
                            onClick={() => handleRemove('shareholder', shareholder.id)}
                            className="text-text-muted hover:text-status-error transition-colors"
                            title="Remove shareholder"
                            disabled={removeShareholderMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {shareholder.isCurrent && (
                          <span className="badge badge-success">Active</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
                      {(shareholder.contact?.identificationNumber || shareholder.identificationNumber) && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-text-tertiary" />
                          <span>
                            {shareholder.contact?.identificationType || shareholder.identificationType || 'ID'}:{' '}
                            {shareholder.contact?.identificationNumber || shareholder.identificationNumber}
                          </span>
                        </div>
                      )}
                      {(shareholder.contact?.nationality || shareholder.nationality || shareholder.placeOfOrigin) && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-text-tertiary" />
                          {shareholder.contact?.nationality || shareholder.nationality || shareholder.placeOfOrigin}
                        </div>
                      )}
                      {(getContactAddress(shareholder.contact) || shareholder.address) && (
                        <div className="col-span-2 flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                          <span>{getContactAddress(shareholder.contact) || shareholder.address}</span>
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
            <div className="p-4">
              <Link
                href={`/companies/${id}/documents`}
                className="btn-secondary btn-sm w-full justify-center"
              >
                View Documents
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
                href={`/companies/${id}/audit`}
                className="btn-secondary btn-sm w-full justify-center"
              >
                View History
              </Link>
            </div>
          </div>

        </div>
      </div>

      {/* Internal Notes - Full Width */}
      <InternalNotes
        entityType="company"
        entityId={id}
        canEdit={can.updateCompany}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Company"
        description={`Are you sure you want to delete "${company?.name}"? ${getDeleteWarning()}`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this company..."
        reasonMinLength={10}
        isLoading={deleteCompany.isPending}
      />

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

      {/* Contact Details Modal */}
      <ContactDetailsModal
        isOpen={contactDetailsModalOpen}
        onClose={() => setContactDetailsModalOpen(false)}
        companyId={id}
        companyName={company?.name || ''}
        canEdit={can.updateCompany}
      />
    </div>
  );
}
