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
  StickyNote,
  Globe,
  User,
} from 'lucide-react';
import { useCompany, useDeleteCompany } from '@/hooks/use-companies';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate, formatCurrency, formatPercentage } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Link as LinkIcon } from 'lucide-react';

// Helper to convert UPPER_CASE or UPPERCASE to Title Case
function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

  const entityTypeLabels: Record<string, string> = {
    PRIVATE_LIMITED: 'Private Limited',
    PUBLIC_LIMITED: 'Public Limited',
    SOLE_PROPRIETORSHIP: 'Sole Proprietorship',
    PARTNERSHIP: 'Partnership',
    LIMITED_PARTNERSHIP: 'Limited Partnership',
    LIMITED_LIABILITY_PARTNERSHIP: 'LLP',
    FOREIGN_COMPANY: 'Foreign Company',
    VARIABLE_CAPITAL_COMPANY: 'VCC',
    OTHER: 'Other',
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
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 text-sm text-text-secondary">
            <span>{company.uen}</span>
            <span>{entityTypeLabels[company.entityType] || company.entityType}</span>
            {company.incorporationDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Incorporated {formatDate(company.incorporationDate)}
              </span>
            )}
          </div>
        </div>
        {(can.updateCompany || can.deleteCompany) && (
          <div className="flex items-center gap-2 sm:gap-3">
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
            <div className="p-4 border-b border-border-primary flex items-center justify-between">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Users className="w-4 h-4 text-text-tertiary" />
                Officers
              </h2>
              <span className="text-sm text-text-tertiary">
                {company._count?.officers || 0} total
              </span>
            </div>
            <div className="divide-y divide-border-primary">
              {company.officers && company.officers.length > 0 ? (
                company.officers.slice(0, 5).map((officer) => (
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
                            {toTitleCase(officer.designation || officer.role)}
                          </span>
                          {officer.contact?.id ? (
                            <Link
                              href={`/contacts/${officer.contact.id}`}
                              className="badge badge-success flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
                            >
                              <LinkIcon className="w-3 h-3" />
                              Linked
                            </Link>
                          ) : (
                            <span className="badge badge-neutral">Not Linked</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
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
                      {officer.nationality && (
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <Globe className="w-3.5 h-3.5 text-text-tertiary" />
                          {officer.nationality}
                        </div>
                      )}
                      {officer.address && (
                        <div className="col-span-2 flex items-start gap-1.5 text-text-secondary">
                          <MapPin className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                          <span className="text-xs">{officer.address}</span>
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
            </div>
          </div>

          {/* Shareholders */}
          <div className="card">
            <div className="p-4 border-b border-border-primary flex items-center justify-between">
              <h2 className="font-medium text-text-primary flex items-center gap-2">
                <Shield className="w-4 h-4 text-text-tertiary" />
                Shareholders
              </h2>
              <span className="text-sm text-text-tertiary">
                {company._count?.shareholders || 0} total
              </span>
            </div>
            <div className="divide-y divide-border-primary">
              {company.shareholders && company.shareholders.length > 0 ? (
                company.shareholders.map((shareholder) => (
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
                          {shareholder.contact?.id ? (
                            <Link
                              href={`/contacts/${shareholder.contact.id}`}
                              className="badge badge-success flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
                            >
                              <LinkIcon className="w-3 h-3" />
                              Linked
                            </Link>
                          ) : (
                            <span className="badge badge-neutral">Not Linked</span>
                          )}
                        </div>
                        <p className="text-sm text-text-secondary">
                          {shareholder.numberOfShares.toLocaleString()} {toTitleCase(shareholder.shareClass || 'Ordinary')} shares
                          {shareholder.percentageHeld && (
                            <span className="ml-2 text-text-tertiary">
                              ({formatPercentage(shareholder.percentageHeld)})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {shareholder.isCurrent && (
                          <span className="badge badge-success">Active</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {(shareholder.nationality || shareholder.placeOfOrigin) && (
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <Globe className="w-3.5 h-3.5 text-text-tertiary" />
                          {shareholder.nationality || shareholder.placeOfOrigin}
                        </div>
                      )}
                      {shareholder.address && (
                        <div className="col-span-2 flex items-start gap-1.5 text-text-secondary">
                          <MapPin className="w-3.5 h-3.5 text-text-tertiary shrink-0 mt-0.5" />
                          <span className="text-xs">{shareholder.address}</span>
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
              {company.homeCurrency && company.homeCurrency !== 'SGD' && (
                <div>
                  <p className="text-xs text-text-tertiary uppercase mb-1">Home Currency</p>
                  <p className="text-sm text-text-primary">{company.homeCurrency}</p>
                </div>
              )}
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

          {/* Internal Notes */}
          {company.internalNotes && (
            <div className="card">
              <div className="p-4 border-b border-border-primary">
                <h2 className="font-medium text-text-primary flex items-center gap-2">
                  <StickyNote className="w-4 h-4 text-text-tertiary" />
                  Internal Notes
                </h2>
              </div>
              <div className="p-4">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{company.internalNotes}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Company"
        description={`Are you sure you want to delete "${company?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        requireReason
        reasonLabel="Reason for deletion"
        reasonPlaceholder="Please provide a reason for deleting this company..."
        reasonMinLength={10}
        isLoading={deleteCompany.isPending}
      />
    </div>
  );
}
