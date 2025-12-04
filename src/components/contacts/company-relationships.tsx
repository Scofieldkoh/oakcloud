'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Link2,
  Briefcase,
  PieChart,
  ChevronDown,
  ChevronUp,
  Star,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface Company {
  id: string;
  name: string;
  uen: string;
}

interface CompanyRelation {
  id: string;
  company: Company;
  relationship: string;
  isPrimary: boolean;
}

interface OfficerPosition {
  id: string;
  company: Company;
  role: string;
  designation: string | null;
  appointmentDate: string | null;
  cessationDate: string | null;
  isCurrent: boolean;
}

interface Shareholding {
  id: string;
  company: Company;
  shareClass: string;
  numberOfShares: number;
  percentageHeld: number | null;
  isCurrent: boolean;
}

interface ConsolidatedRelationship {
  companyId: string;
  companyName: string;
  companyUen: string;
  isPrimary: boolean;
  generalRelationship: string | null;
  officerPositions: OfficerPosition[];
  shareholdings: Shareholding[];
}

interface CompanyRelationshipsProps {
  companyRelations: CompanyRelation[] | undefined;
  officerPositions: OfficerPosition[] | undefined;
  shareholdings: Shareholding[] | undefined;
  canUpdate: boolean;
  onLinkCompany: () => void;
  onUnlinkCompany: (companyId: string, relationship: string) => void;
}

export function CompanyRelationships({
  companyRelations,
  officerPositions,
  shareholdings,
  canUpdate,
  onLinkCompany,
  onUnlinkCompany,
}: CompanyRelationshipsProps) {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  // Consolidate all relationships by company
  const consolidatedRelationships = useMemo(() => {
    const map = new Map<string, ConsolidatedRelationship>();

    // Process company relations (general links)
    companyRelations?.forEach((rel) => {
      if (!map.has(rel.company.id)) {
        map.set(rel.company.id, {
          companyId: rel.company.id,
          companyName: rel.company.name,
          companyUen: rel.company.uen,
          isPrimary: rel.isPrimary,
          generalRelationship: rel.relationship,
          officerPositions: [],
          shareholdings: [],
        });
      } else {
        const existing = map.get(rel.company.id)!;
        if (rel.isPrimary) existing.isPrimary = true;
        if (!existing.generalRelationship) existing.generalRelationship = rel.relationship;
      }
    });

    // Process officer positions
    officerPositions?.forEach((pos) => {
      if (!map.has(pos.company.id)) {
        map.set(pos.company.id, {
          companyId: pos.company.id,
          companyName: pos.company.name,
          companyUen: pos.company.uen,
          isPrimary: false,
          generalRelationship: null,
          officerPositions: [pos],
          shareholdings: [],
        });
      } else {
        map.get(pos.company.id)!.officerPositions.push(pos);
      }
    });

    // Process shareholdings
    shareholdings?.forEach((sh) => {
      if (!map.has(sh.company.id)) {
        map.set(sh.company.id, {
          companyId: sh.company.id,
          companyName: sh.company.name,
          companyUen: sh.company.uen,
          isPrimary: false,
          generalRelationship: null,
          officerPositions: [],
          shareholdings: [sh],
        });
      } else {
        map.get(sh.company.id)!.shareholdings.push(sh);
      }
    });

    // Sort: primary first, then by company name
    return Array.from(map.values()).sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.companyName.localeCompare(b.companyName);
    });
  }, [companyRelations, officerPositions, shareholdings]);

  const toggleExpanded = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const hasDetails = (rel: ConsolidatedRelationship) =>
    rel.officerPositions.length > 0 || rel.shareholdings.length > 0;

  if (consolidatedRelationships.length === 0) {
    return (
      <div className="card">
        <div className="p-4 border-b border-border-primary flex items-center justify-between">
          <h2 className="font-medium text-text-primary flex items-center gap-2">
            <Building2 className="w-4 h-4 text-text-tertiary" />
            Company Relationships
          </h2>
          {canUpdate && (
            <button
              onClick={onLinkCompany}
              className="btn-secondary btn-xs flex items-center gap-1"
            >
              <Link2 className="w-3.5 h-3.5" />
              Add to Company
            </button>
          )}
        </div>
        <div className="p-8 text-center">
          <Building2 className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">Not associated with any companies</p>
          {canUpdate && (
            <button
              onClick={onLinkCompany}
              className="btn-primary btn-sm mt-4"
            >
              Add to Company
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="p-4 border-b border-border-primary flex items-center justify-between">
        <h2 className="font-medium text-text-primary flex items-center gap-2">
          <Building2 className="w-4 h-4 text-text-tertiary" />
          Company Relationships
          <span className="text-xs text-text-muted">({consolidatedRelationships.length})</span>
        </h2>
        {canUpdate && (
          <button
            onClick={onLinkCompany}
            className="btn-secondary btn-xs flex items-center gap-1"
          >
            <Link2 className="w-3.5 h-3.5" />
            Add to Company
          </button>
        )}
      </div>
      <div className="divide-y divide-border-primary">
        {consolidatedRelationships.map((rel) => {
          const isExpanded = expandedCompanies.has(rel.companyId);
          const hasDetailInfo = hasDetails(rel);
          const currentOfficerPositions = rel.officerPositions.filter((p) => p.isCurrent);
          const currentShareholdings = rel.shareholdings.filter((s) => s.isCurrent);

          return (
            <div key={rel.companyId} className="bg-background-secondary">
              {/* Company Header */}
              <div
                className={`p-4 flex items-start justify-between ${
                  hasDetailInfo ? 'cursor-pointer hover:bg-background-tertiary/50' : ''
                }`}
                onClick={() => hasDetailInfo && toggleExpanded(rel.companyId)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/companies/${rel.companyId}`}
                      className="text-text-primary font-medium hover:text-oak-light transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rel.companyName}
                    </Link>
                    <span className="text-sm text-text-tertiary">({rel.companyUen})</span>
                    {rel.isPrimary && (
                      <span className="badge badge-info text-xs flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Primary
                      </span>
                    )}
                  </div>

                  {/* Role Badges Summary */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {/* Officer badges */}
                    {currentOfficerPositions.map((pos) => (
                      <span
                        key={pos.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-oak-primary/10 text-oak-light text-xs"
                      >
                        <Briefcase className="w-3 h-3" />
                        {pos.role.replace(/_/g, ' ')}
                        {pos.designation && ` (${pos.designation})`}
                      </span>
                    ))}

                    {/* Shareholding badges */}
                    {currentShareholdings.map((sh) => (
                      <span
                        key={sh.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-status-info/10 text-status-info text-xs"
                      >
                        <PieChart className="w-3 h-3" />
                        {sh.numberOfShares.toLocaleString()} {sh.shareClass}
                        {sh.percentageHeld && ` (${sh.percentageHeld}%)`}
                      </span>
                    ))}

                    {/* General relationship badge if no specific roles */}
                    {rel.generalRelationship &&
                      currentOfficerPositions.length === 0 &&
                      currentShareholdings.length === 0 && (
                        <span className="badge badge-neutral text-xs">
                          {rel.generalRelationship}
                        </span>
                      )}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {canUpdate && rel.generalRelationship && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnlinkCompany(rel.companyId, rel.generalRelationship!);
                      }}
                      className="btn-ghost btn-xs text-status-error hover:bg-status-error/10"
                    >
                      Unlink
                    </button>
                  )}
                  {hasDetailInfo && (
                    <button className="p-1 text-text-muted hover:text-text-secondary">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && hasDetailInfo && (
                <div className="px-4 pb-4 space-y-3 animate-fade-in">
                  {/* Officer Positions Detail */}
                  {rel.officerPositions.length > 0 && (
                    <div className="bg-background-tertiary rounded-lg p-3">
                      <h4 className="text-xs font-medium text-text-secondary uppercase mb-2 flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5" />
                        Officer Positions
                      </h4>
                      <div className="space-y-2">
                        {rel.officerPositions.map((pos) => (
                          <div
                            key={pos.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div>
                              <span className="text-text-primary">
                                {pos.role.replace(/_/g, ' ')}
                                {pos.designation && ` - ${pos.designation}`}
                              </span>
                              {pos.appointmentDate && (
                                <p className="text-xs text-text-muted">
                                  Appointed: {formatDate(pos.appointmentDate)}
                                  {pos.cessationDate &&
                                    ` • Ceased: ${formatDate(pos.cessationDate)}`}
                                </p>
                              )}
                            </div>
                            {pos.isCurrent ? (
                              <span className="badge badge-success text-2xs">Active</span>
                            ) : (
                              <span className="badge badge-neutral text-2xs">Ceased</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shareholdings Detail */}
                  {rel.shareholdings.length > 0 && (
                    <div className="bg-background-tertiary rounded-lg p-3">
                      <h4 className="text-xs font-medium text-text-secondary uppercase mb-2 flex items-center gap-1">
                        <PieChart className="w-3.5 h-3.5" />
                        Shareholdings
                      </h4>
                      <div className="space-y-2">
                        {rel.shareholdings.map((sh) => (
                          <div
                            key={sh.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div>
                              <span className="text-text-primary">
                                {sh.numberOfShares.toLocaleString()} {sh.shareClass} shares
                              </span>
                              {sh.percentageHeld && (
                                <span className="text-text-secondary ml-2">
                                  ({sh.percentageHeld}% ownership)
                                </span>
                              )}
                            </div>
                            {sh.isCurrent ? (
                              <span className="badge badge-success text-2xs">Active</span>
                            ) : (
                              <span className="badge badge-neutral text-2xs">Former</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
