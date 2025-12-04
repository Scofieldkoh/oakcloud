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
  Filter,
  X,
  Pencil,
  Trash2,
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
  hiddenCompanyCount?: number;  // Number of companies hidden due to RBAC
  canUpdate: boolean;
  onLinkCompany: () => void;
  onUnlinkCompany: (companyId: string, relationship: string) => void;
  onUnlinkOfficer?: (officerId: string, companyId: string) => void;
  onUnlinkShareholder?: (shareholderId: string, companyId: string) => void;
  onEditOfficer?: (officer: OfficerPosition, companyId: string) => void;
  onEditShareholder?: (shareholder: Shareholding, companyId: string) => void;
}

export function CompanyRelationships({
  companyRelations,
  officerPositions,
  shareholdings,
  hiddenCompanyCount,
  canUpdate,
  onLinkCompany,
  onUnlinkCompany,
  onUnlinkOfficer,
  onUnlinkShareholder,
  onEditOfficer,
  onEditShareholder,
}: CompanyRelationshipsProps) {
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [companyNameFilter, setCompanyNameFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [showCeased, setShowCeased] = useState(false);

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

  // Extract unique positions for the filter dropdown
  const availablePositions = useMemo(() => {
    const positions = new Set<string>();

    // Add officer roles
    officerPositions?.forEach((pos) => {
      positions.add(pos.role.replace(/_/g, ' '));
    });

    // Add "Shareholder" if there are any shareholdings
    if (shareholdings && shareholdings.length > 0) {
      positions.add('Shareholder');
    }

    // Add general relationships
    companyRelations?.forEach((rel) => {
      if (rel.relationship) {
        positions.add(rel.relationship);
      }
    });

    return Array.from(positions).sort();
  }, [companyRelations, officerPositions, shareholdings]);

  // Apply filters to consolidated relationships
  const filteredRelationships = useMemo(() => {
    return consolidatedRelationships.filter((rel) => {
      // Company name filter
      if (companyNameFilter) {
        const searchTerm = companyNameFilter.toLowerCase();
        const matchesName = rel.companyName.toLowerCase().includes(searchTerm);
        const matchesUen = rel.companyUen.toLowerCase().includes(searchTerm);
        if (!matchesName && !matchesUen) return false;
      }

      // Position filter
      if (positionFilter) {
        const normalizedFilter = positionFilter.toLowerCase();

        // Check officer positions (filter by current if showCeased is false)
        const matchingOfficers = rel.officerPositions.filter(pos => showCeased || pos.isCurrent);
        const hasOfficerMatch = matchingOfficers.some((pos) =>
          pos.role.replace(/_/g, ' ').toLowerCase() === normalizedFilter
        );

        // Check shareholdings (filter by current if showCeased is false)
        const matchingShareholdings = rel.shareholdings.filter(sh => showCeased || sh.isCurrent);
        const hasShareholderMatch = normalizedFilter === 'shareholder' && matchingShareholdings.length > 0;

        // Check general relationship
        const hasGeneralMatch = rel.generalRelationship?.toLowerCase() === normalizedFilter;

        if (!hasOfficerMatch && !hasShareholderMatch && !hasGeneralMatch) return false;
      }

      // If showCeased is false, filter out companies with only ceased positions
      if (!showCeased) {
        const hasCurrentOfficer = rel.officerPositions.some(pos => pos.isCurrent);
        const hasCurrentShareholder = rel.shareholdings.some(sh => sh.isCurrent);
        const hasGeneralRel = rel.generalRelationship;

        // Keep the company if it has any current position or general relationship
        if (!hasCurrentOfficer && !hasCurrentShareholder && !hasGeneralRel) return false;
      }

      return true;
    });
  }, [consolidatedRelationships, companyNameFilter, positionFilter, showCeased]);

  const hasActiveFilters = companyNameFilter || positionFilter || showCeased;

  const clearFilters = () => {
    setCompanyNameFilter('');
    setPositionFilter('');
    setShowCeased(false);
  };

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
      <div className="p-4 border-b border-border-primary">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-text-primary flex items-center gap-2">
            <Building2 className="w-4 h-4 text-text-tertiary" />
            Company Relationships
            <span className="text-xs text-text-muted">
              ({filteredRelationships.length}
              {hasActiveFilters && ` of ${consolidatedRelationships.length}`})
            </span>
            {hiddenCompanyCount !== undefined && hiddenCompanyCount > 0 && (
              <span className="text-xs text-status-warning" title="Some company relationships are hidden due to your access permissions">
                ({hiddenCompanyCount} hidden)
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {consolidatedRelationships.length > 0 && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`btn-ghost btn-xs flex items-center gap-1 ${
                  hasActiveFilters ? 'text-oak-light' : ''
                }`}
                title="Filter relationships"
              >
                <Filter className="w-3.5 h-3.5" />
                {hasActiveFilters && (
                  <span className="w-1.5 h-1.5 rounded-full bg-oak-light" />
                )}
              </button>
            )}
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
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-border-secondary animate-fade-in">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[150px] max-w-[250px]">
                <label className="text-xs text-text-tertiary mb-1 block">Company Name</label>
                <input
                  type="text"
                  value={companyNameFilter}
                  onChange={(e) => setCompanyNameFilter(e.target.value)}
                  placeholder="Search by name or UEN..."
                  className="input input-xs w-full"
                />
              </div>
              <div className="min-w-[140px]">
                <label className="text-xs text-text-tertiary mb-1 block">Position</label>
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="input input-xs w-full"
                >
                  <option value="">All Positions</option>
                  {availablePositions.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-ceased-contact"
                  checked={showCeased}
                  onChange={(e) => setShowCeased(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border-primary text-oak-primary focus:ring-oak-primary"
                />
                <label htmlFor="show-ceased-contact" className="text-xs text-text-secondary cursor-pointer">
                  Show ceased
                </label>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="btn-ghost btn-xs flex items-center gap-1 text-text-muted hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="divide-y divide-border-primary">
        {filteredRelationships.length === 0 && hasActiveFilters ? (
          <div className="p-6 text-center">
            <p className="text-text-secondary text-sm">No companies match your filters</p>
            <button
              onClick={clearFilters}
              className="btn-secondary btn-xs mt-2"
            >
              Clear Filters
            </button>
          </div>
        ) : null}
        {filteredRelationships.map((rel) => {
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
                    {currentOfficerPositions.map((pos) => {
                      // Avoid duplicate display when role and designation are the same
                      const roleDisplay = pos.role.replace(/_/g, ' ');
                      const designationDisplay = pos.designation?.replace(/_/g, ' ');
                      const showDesignation = designationDisplay &&
                        designationDisplay.toLowerCase() !== roleDisplay.toLowerCase();

                      return (
                        <span
                          key={pos.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-oak-primary/10 text-oak-light text-xs"
                        >
                          <Briefcase className="w-3 h-3" />
                          {roleDisplay}
                          {showDesignation && ` (${designationDisplay})`}
                        </span>
                      );
                    })}

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
                  {/* Only show Unlink for pure general relationships (no officers/shareholders) */}
                  {canUpdate && rel.generalRelationship &&
                    rel.officerPositions.length === 0 &&
                    rel.shareholdings.length === 0 && (
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
                        {rel.officerPositions.map((pos) => {
                          // Avoid duplicate display when role and designation are the same
                          const roleDisplay = pos.role.replace(/_/g, ' ');
                          const designationDisplay = pos.designation?.replace(/_/g, ' ');
                          const showDesignation = designationDisplay &&
                            designationDisplay.toLowerCase() !== roleDisplay.toLowerCase();

                          return (
                          <div
                            key={pos.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <div>
                              <span className="text-text-primary">
                                {roleDisplay}
                                {showDesignation && ` - ${designationDisplay}`}
                              </span>
                              {pos.appointmentDate && (
                                <p className="text-xs text-text-muted">
                                  Appointed: {formatDate(pos.appointmentDate)}
                                  {pos.cessationDate &&
                                    ` • Ceased: ${formatDate(pos.cessationDate)}`}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {pos.isCurrent ? (
                                <span className="badge badge-success text-2xs">Active</span>
                              ) : (
                                <span className="badge badge-neutral text-2xs">Ceased</span>
                              )}
                              {canUpdate && onEditOfficer && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditOfficer(pos, rel.companyId);
                                  }}
                                  className="text-text-muted hover:text-oak-light transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canUpdate && onUnlinkOfficer && pos.isCurrent && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnlinkOfficer(pos.id, rel.companyId);
                                  }}
                                  className="text-text-muted hover:text-status-error transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          );
                        })}
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
                            <div className="flex items-center gap-2">
                              {sh.isCurrent ? (
                                <span className="badge badge-success text-2xs">Active</span>
                              ) : (
                                <span className="badge badge-neutral text-2xs">Former</span>
                              )}
                              {canUpdate && onEditShareholder && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditShareholder(sh, rel.companyId);
                                  }}
                                  className="text-text-muted hover:text-oak-light transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canUpdate && onUnlinkShareholder && sh.isCurrent && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUnlinkShareholder(sh.id, rel.companyId);
                                  }}
                                  className="text-text-muted hover:text-status-error transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
