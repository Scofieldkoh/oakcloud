'use client';

import Link from 'next/link';
import { Mail, Phone, Plus, Building2, User } from 'lucide-react';
import { CopyButton } from './copy-button';
import type { ContactWithDetails } from './types';

// Helper to convert UPPERCASE to Title Case
function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Helper to deduplicate and clean up relationships
// Removes generic "Shareholder" if there's a more specific one like "Ordinary Shareholder"
function cleanRelationships(relationshipStr: string | undefined): string[] {
  if (!relationshipStr) return [];

  const rawRoles = [...new Set(relationshipStr.split(', ').filter(Boolean))].map(toTitleCase);

  // Check if there's a specific shareholder type (e.g., "Ordinary Shareholder", "Preference Shareholder")
  const hasSpecificShareholder = rawRoles.some(r => r.includes('Shareholder') && r !== 'Shareholder');

  // Filter out generic "Shareholder" if there's a more specific one
  return rawRoles.filter(r => !(r === 'Shareholder' && hasSpecificShareholder));
}

interface ContactRowProps {
  item: ContactWithDetails;
  canEdit: boolean;
  onAddDetail: () => void;
}

export function ContactRow({
  item,
  canEdit,
  onAddDetail,
}: ContactRowProps) {
  // Parse relationship to show badges (deduplicated, cleaned, and in title case)
  const relationships = cleanRelationships(item.contact.relationship);

  // Find email ContactDetail that matches the displayed email
  // Only show purposes if there's a matching ContactDetail record
  const displayedEmail = item.contact.email;
  const matchingEmailDetail = item.details.find(
    d => d.detailType === 'EMAIL' && d.value === displayedEmail
  );
  const emailPurposes = matchingEmailDetail?.purposes || [];

  return (
    <div className="flex items-center gap-4 py-3 px-4 hover:bg-surface-secondary rounded-lg transition-colors group">
      {/* Name with link */}
      <div className="flex-shrink-0 w-[240px] min-w-0">
        <Link
          href={`/contacts/${item.contact.id}`}
          className="font-medium text-text-primary hover:text-oak-light flex items-center gap-1.5 truncate"
        >
          {item.contact.contactType === 'CORPORATE' ? (
            <Building2 className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          ) : (
            <User className="w-4 h-4 text-text-tertiary flex-shrink-0" />
          )}
          <span className="truncate">{item.contact.fullName}</span>
        </Link>
      </div>

      {/* Relationship badges - widened for more space */}
      <div className="flex-shrink-0 w-[240px]">
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

      {/* Email */}
      <div className="flex-1 min-w-0">
        {item.contact.email ? (
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
            <span className="text-sm text-text-secondary truncate">{item.contact.email}</span>
            <CopyButton value={item.contact.email} />
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

      {/* Phone */}
      <div className="flex-shrink-0 w-[140px]">
        {item.contact.phone ? (
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-text-tertiary" />
            <span className="text-sm text-text-secondary">{item.contact.phone}</span>
            <CopyButton value={item.contact.phone} />
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">No phone</span>
        )}
      </div>

      {/* Actions - always visible */}
      {canEdit && (
        <div className="flex-shrink-0">
          <button
            onClick={onAddDetail}
            className="text-oak-light hover:text-oak-dark p-1.5 rounded hover:bg-surface-tertiary"
            title="Add contact detail"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
