'use client';

import Link from 'next/link';
import { Mail, Phone, Pencil, Building2, User, Trash2, Star, Loader2 } from 'lucide-react';
import { CopyButton } from './copy-button';
import type { ContactWithDetails } from './types';

// Helper to normalize and convert to Title Case
// Replaces underscores with spaces and converts to title case
function normalizeRole(str: string): string {
  return str
    .replace(/_/g, ' ')  // Replace underscores with spaces
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Helper to deduplicate and clean up relationships
// - Normalizes underscores and casing for proper deduplication
// - Removes generic "Shareholder" if there's a more specific one like "Ordinary Shareholder"
function cleanRelationships(relationshipStr: string | undefined): string[] {
  if (!relationshipStr) return [];

  // Split, normalize, and deduplicate
  const normalizedRoles = relationshipStr
    .split(', ')
    .filter(Boolean)
    .map(normalizeRole);

  // Deduplicate after normalization
  const uniqueRoles = [...new Set(normalizedRoles)];

  // Check if there's a specific shareholder type (e.g., "Ordinary Shareholder", "Preference Shareholder")
  const hasSpecificShareholder = uniqueRoles.some(r => r.includes('Shareholder') && r !== 'Shareholder');

  // Filter out generic "Shareholder" if there's a more specific one
  return uniqueRoles.filter(r => {
    if (r === 'Shareholder' && hasSpecificShareholder) return false;
    return true;
  });
}

interface ContactRowProps {
  item: ContactWithDetails;
  companyId: string;
  canEdit: boolean;
  onAddDetail: () => void;
  onUnlink?: () => void;
  onTogglePoc?: (isPoc: boolean) => void;
  isTogglingPoc?: boolean;
}

export function ContactRow({
  item,
  companyId,
  canEdit,
  onAddDetail,
  onUnlink,
  onTogglePoc,
  isTogglingPoc,
}: ContactRowProps) {
  // Parse relationship to show badges (deduplicated, cleaned, and in title case)
  const relationships = cleanRelationships(item.contact.relationship);

  // Check if contact has Director or Shareholder roles (cannot unlink these directly)
  const hasProtectedRole = relationships.some(
    (rel) => rel.toLowerCase().includes('director') || rel.toLowerCase().includes('shareholder')
  );

  // Get company-specific email/phone for THIS company, otherwise fall back to contact's default detail
  // Company-specific details have both contactId AND companyId set (must match current company)
  // Default details have contactId but companyId is null
  const companySpecificEmail = item.details.find(
    d => d.detailType === 'EMAIL' && d.companyId === companyId
  );
  const companySpecificPhone = item.details.find(
    d => d.detailType === 'PHONE' && d.companyId === companyId
  );
  const defaultEmail = item.details.find(
    d => d.detailType === 'EMAIL' && d.companyId === null
  );
  const defaultPhone = item.details.find(
    d => d.detailType === 'PHONE' && d.companyId === null
  );

  // Use company-specific (for THIS company) if available, otherwise contact's default detail
  const displayedEmail = companySpecificEmail?.value || defaultEmail?.value || null;
  const displayedPhone = companySpecificPhone?.value || defaultPhone?.value || null;

  // Get purposes from the displayed email's detail record
  const emailDetail = companySpecificEmail || defaultEmail;
  const emailPurposes = emailDetail?.purposes || [];

  // POC status is now company-specific, stored on CompanyContact
  const hasPoc = item.isPoc;

  // Handle POC toggle - toggle the company-specific POC status
  const handlePocClick = () => {
    if (!onTogglePoc || !canEdit) return;
    onTogglePoc(!hasPoc);
  };

  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-surface-secondary rounded-lg transition-colors group">
      {/* Name with link - widened 1.5x */}
      <div className="flex-shrink-0 w-[360px] min-w-0">
        <Link
          href={`/contacts/${item.contact.id}`}
          className="font-medium text-text-primary hover:text-oak-light flex items-center gap-1.5 truncate"
        >
          {item.contact.contactType === 'CORPORATE' ? (
            <Building2 className="w-4 h-4 text-text-tertiary flex-shrink-0" aria-hidden="true" />
          ) : (
            <User className="w-4 h-4 text-text-tertiary flex-shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{item.contact.fullName}</span>
        </Link>
      </div>

      {/* Relationship badges - w-[300px] */}
      <div className="flex-shrink-0 w-[300px]">
        <div className="flex flex-wrap gap-1 items-center">
          {relationships.length > 0 ? (
            <>
              {relationships.slice(0, 2).map((rel, idx) => (
                <span key={idx} className="text-xs font-medium text-white bg-oak-light px-2 py-0.5 rounded">
                  {rel}
                </span>
              ))}
              {relationships.length > 2 && (
                <span
                  className="text-xs text-text-muted cursor-help relative group/tooltip"
                  title={relationships.slice(2).join(', ')}
                >
                  +{relationships.length - 2}
                  {/* Tooltip */}
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50">
                    {relationships.slice(2).join(', ')}
                  </span>
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-text-muted italic">No role</span>
          )}
        </div>
      </div>

      {/* POC column - w-[80px] */}
      <div className="flex-shrink-0 w-[80px] flex items-center justify-center">
        {canEdit ? (
          <button
            onClick={handlePocClick}
            disabled={isTogglingPoc}
            className={`p-1.5 rounded transition-colors ${
              hasPoc
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-text-muted hover:text-amber-500'
            } disabled:opacity-50`}
            aria-label={hasPoc ? `Remove ${item.contact.fullName} as point of contact` : `Set ${item.contact.fullName} as point of contact`}
            aria-pressed={hasPoc}
          >
            {isTogglingPoc ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Star className={`w-4 h-4 ${hasPoc ? 'fill-current' : ''}`} aria-hidden="true" />
            )}
          </button>
        ) : hasPoc ? (
          <span className="text-amber-500" aria-label={`${item.contact.fullName} is point of contact`}>
            <Star className="w-4 h-4 fill-current" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      {/* Phone */}
      <div className="flex-shrink-0 w-[210px]">
        {displayedPhone ? (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-text-tertiary" aria-hidden="true" />
            <span className="text-sm text-text-primary">{displayedPhone}</span>
            <CopyButton value={displayedPhone} label="phone number" />
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">No phone</span>
        )}
      </div>

      {/* Email with automation badges */}
      <div className="flex-1 min-w-0">
        {displayedEmail ? (
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" aria-hidden="true" />
            <span className="text-sm text-text-primary truncate">{displayedEmail}</span>
            <CopyButton value={displayedEmail} label="email address" />
            {emailPurposes.length > 0 && (
              <div className="flex gap-1 flex-shrink-0">
                {emailPurposes.slice(0, 2).map((purpose) => (
                  <span key={purpose} className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    {purpose}
                  </span>
                ))}
                {emailPurposes.length > 2 && (
                  <span className="text-[10px] text-text-muted">+{emailPurposes.length - 2}</span>
                )}
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">No email</span>
        )}
      </div>

      {/* Actions - always visible */}
      {canEdit && (
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={onAddDetail}
            className="text-text-muted hover:text-oak-light transition-colors"
            aria-label={`Edit contact details for ${item.contact.fullName}`}
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {onUnlink && !hasProtectedRole && (
            <button
              onClick={onUnlink}
              className="text-text-muted hover:text-status-error transition-colors"
              aria-label={`Remove ${item.contact.fullName} from company`}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
