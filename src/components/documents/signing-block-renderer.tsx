'use client';

import { useMemo } from 'react';
import { PenLine, Calendar, User, Briefcase, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface Signatory {
  id: string;
  name: string;
  role?: string;
  designation?: string;
  company?: string;
  identificationNumber?: string;
  email?: string;
}

export interface SigningBlockProps {
  signatories: Signatory[];
  layout?: 'vertical' | 'horizontal' | 'grid';
  columns?: number;
  showDate?: boolean;
  showWitness?: boolean;
  witnessLabel?: string;
  signatureLineWidth?: string;
  className?: string;
  variant?: 'default' | 'formal' | 'compact' | 'modern';
}

export interface SingleSignatureBlockProps {
  signatory: Signatory;
  showDate?: boolean;
  showWitness?: boolean;
  witnessLabel?: string;
  signatureLineWidth?: string;
  variant?: 'default' | 'formal' | 'compact' | 'modern';
  className?: string;
}

// ============================================================================
// Single Signature Block Component
// ============================================================================

export function SingleSignatureBlock({
  signatory,
  showDate = true,
  showWitness = false,
  witnessLabel = 'Witness',
  signatureLineWidth = '200px',
  variant = 'default',
  className,
}: SingleSignatureBlockProps) {
  if (variant === 'compact') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div
          className="border-b border-gray-800 dark:border-gray-400"
          style={{ width: signatureLineWidth }}
        />
        <div className="text-sm">
          <p className="font-medium text-text-primary">{signatory.name}</p>
          {signatory.role && (
            <p className="text-text-muted">{signatory.role}</p>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'modern') {
    return (
      <div
        className={cn(
          'p-4 border border-border-primary rounded-lg bg-background-secondary',
          className
        )}
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
            <PenLine className="w-5 h-5 text-accent-primary" />
          </div>
          <div className="flex-1">
            <div
              className="h-12 border-b-2 border-dashed border-gray-300 dark:border-gray-600 mb-3"
              style={{ minWidth: signatureLineWidth }}
            />
            <p className="font-medium text-text-primary">{signatory.name}</p>
            {signatory.role && (
              <p className="text-sm text-text-muted">{signatory.role}</p>
            )}
            {signatory.designation && (
              <p className="text-sm text-text-muted">{signatory.designation}</p>
            )}
            {showDate && (
              <div className="flex items-center gap-1 mt-2 text-xs text-text-muted">
                <Calendar className="w-3 h-3" />
                <span>Date: _______________</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'formal') {
    return (
      <div className={cn('space-y-6', className)}>
        {/* Signature */}
        <div>
          <div
            className="border-b border-gray-800 dark:border-gray-400 mb-1"
            style={{ width: signatureLineWidth }}
          />
          <p className="text-xs text-text-muted uppercase tracking-wide">
            Signature
          </p>
        </div>

        {/* Name */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-text-muted" />
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">
                Name
              </p>
              <p className="font-medium text-text-primary">{signatory.name}</p>
            </div>
          </div>

          {/* Role/Designation */}
          {(signatory.role || signatory.designation) && (
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide">
                  Designation
                </p>
                <p className="text-text-primary">
                  {signatory.role || signatory.designation}
                </p>
              </div>
            </div>
          )}

          {/* Company */}
          {signatory.company && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide">
                  Company
                </p>
                <p className="text-text-primary">{signatory.company}</p>
              </div>
            </div>
          )}

          {/* NRIC/ID */}
          {signatory.identificationNumber && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">
                NRIC/Passport No.
              </p>
              <p className="text-text-primary">
                {signatory.identificationNumber}
              </p>
            </div>
          )}

          {/* Date */}
          {showDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted uppercase tracking-wide">
                  Date
                </p>
                <div
                  className="border-b border-gray-400 dark:border-gray-600 h-6"
                  style={{ width: '150px' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Witness section */}
        {showWitness && (
          <div className="mt-8 pt-6 border-t border-border-secondary">
            <p className="text-sm font-medium text-text-secondary mb-4">
              {witnessLabel}
            </p>
            <div className="space-y-4">
              <div>
                <div
                  className="border-b border-gray-800 dark:border-gray-400 mb-1"
                  style={{ width: signatureLineWidth }}
                />
                <p className="text-xs text-text-muted">Signature</p>
              </div>
              <div>
                <div
                  className="border-b border-gray-400 dark:border-gray-600 mb-1"
                  style={{ width: signatureLineWidth }}
                />
                <p className="text-xs text-text-muted">Name</p>
              </div>
              <div>
                <div
                  className="border-b border-gray-400 dark:border-gray-600 mb-1"
                  style={{ width: '150px' }}
                />
                <p className="text-xs text-text-muted">Date</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default variant
  return (
    <div className={cn('space-y-2', className)}>
      {/* Signature line */}
      <div
        className="border-b border-gray-800 dark:border-gray-400"
        style={{ width: signatureLineWidth }}
      />

      {/* Name */}
      <div>
        <p className="text-sm font-medium text-text-primary">
          Name: {signatory.name}
        </p>
      </div>

      {/* Designation/Role */}
      {(signatory.role || signatory.designation) && (
        <p className="text-sm text-text-secondary">
          Designation: {signatory.role || signatory.designation}
        </p>
      )}

      {/* ID Number */}
      {signatory.identificationNumber && (
        <p className="text-sm text-text-secondary">
          NRIC/Passport No.: {signatory.identificationNumber}
        </p>
      )}

      {/* Date */}
      {showDate && (
        <p className="text-sm text-text-secondary">Date: _______________</p>
      )}

      {/* Witness */}
      {showWitness && (
        <div className="mt-6 pt-4 border-t border-border-secondary space-y-2">
          <p className="text-sm font-medium text-text-secondary">
            {witnessLabel}:
          </p>
          <div
            className="border-b border-gray-800 dark:border-gray-400"
            style={{ width: signatureLineWidth }}
          />
          <p className="text-sm text-text-secondary">
            Name: _________________________
          </p>
          <p className="text-sm text-text-secondary">Date: _______________</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Multi-Signatory Signing Block Component
// ============================================================================

export function SigningBlock({
  signatories,
  layout = 'vertical',
  columns = 2,
  showDate = true,
  showWitness = false,
  witnessLabel = 'Witness',
  signatureLineWidth = '200px',
  className,
  variant = 'default',
}: SigningBlockProps) {
  // useMemo must be called unconditionally (before any early returns)
  const containerClass = useMemo(() => {
    switch (layout) {
      case 'horizontal':
        return 'flex flex-wrap gap-8';
      case 'grid':
        return `grid gap-6 grid-cols-${columns}`;
      default:
        return 'space-y-8';
    }
  }, [layout, columns]);

  if (signatories.length === 0) {
    return (
      <div
        className={cn(
          'p-6 border border-dashed border-border-secondary rounded-lg text-center',
          className
        )}
      >
        <PenLine className="w-8 h-8 mx-auto text-text-muted mb-2" />
        <p className="text-text-muted">No signatories configured</p>
      </div>
    );
  }

  return (
    <div className={cn('signing-block-container', className)}>
      {/* Header */}
      <div className="mb-6 pb-3 border-b border-border-secondary">
        <p className="text-sm font-medium text-text-secondary uppercase tracking-wide">
          Signatures
        </p>
      </div>

      {/* Signature blocks */}
      <div
        className={containerClass}
        style={
          layout === 'grid'
            ? { gridTemplateColumns: `repeat(${columns}, 1fr)` }
            : undefined
        }
      >
        {signatories.map((signatory, index) => (
          <div
            key={signatory.id || index}
            className={cn(
              layout === 'horizontal' && 'flex-1 min-w-[250px]',
              layout === 'vertical' && index > 0 && 'pt-6 border-t border-border-secondary'
            )}
          >
            <SingleSignatureBlock
              signatory={signatory}
              showDate={showDate}
              showWitness={showWitness}
              witnessLabel={witnessLabel}
              signatureLineWidth={signatureLineWidth}
              variant={variant}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Director Signing Block (Specialized for Director Resolutions)
// ============================================================================

interface DirectorSigningBlockProps {
  directors: Array<{
    id: string;
    name: string;
    identificationNumber?: string;
    nationality?: string;
  }>;
  title?: string;
  showNric?: boolean;
  showNationality?: boolean;
  className?: string;
}

export function DirectorSigningBlock({
  directors,
  title = 'Signed by the Director(s)',
  showNric = true,
  showNationality = false,
  className,
}: DirectorSigningBlockProps) {
  return (
    <div className={cn('director-signing-block', className)}>
      <p className="text-sm font-medium text-text-secondary mb-6">{title}</p>

      <div className="space-y-8">
        {directors.map((director, index) => (
          <div
            key={director.id || index}
            className={cn(
              index > 0 && 'pt-6 border-t border-border-secondary'
            )}
          >
            {/* Signature line */}
            <div className="w-52 border-b border-gray-800 dark:border-gray-400 mb-3" />

            {/* Director info */}
            <div className="space-y-1 text-sm">
              <p className="text-text-primary">
                <span className="text-text-muted">Name:</span>{' '}
                <span className="font-medium">{director.name}</span>
              </p>
              <p className="text-text-muted">Designation: Director</p>
              {showNric && director.identificationNumber && (
                <p className="text-text-muted">
                  NRIC/Passport No.: {director.identificationNumber}
                </p>
              )}
              {showNationality && director.nationality && (
                <p className="text-text-muted">
                  Nationality: {director.nationality}
                </p>
              )}
              <p className="text-text-muted">Date: _______________</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Shareholder Signing Block (Specialized for Shareholder Resolutions)
// ============================================================================

interface ShareholderSigningBlockProps {
  shareholders: Array<{
    id: string;
    name: string;
    shareClass?: string;
    numberOfShares?: number;
    identificationNumber?: string;
  }>;
  title?: string;
  showShareInfo?: boolean;
  className?: string;
}

export function ShareholderSigningBlock({
  shareholders,
  title = 'Signed by the Shareholder(s)',
  showShareInfo = true,
  className,
}: ShareholderSigningBlockProps) {
  return (
    <div className={cn('shareholder-signing-block', className)}>
      <p className="text-sm font-medium text-text-secondary mb-6">{title}</p>

      <div className="space-y-8">
        {shareholders.map((shareholder, index) => (
          <div
            key={shareholder.id || index}
            className={cn(
              index > 0 && 'pt-6 border-t border-border-secondary'
            )}
          >
            {/* Signature line */}
            <div className="w-52 border-b border-gray-800 dark:border-gray-400 mb-3" />

            {/* Shareholder info */}
            <div className="space-y-1 text-sm">
              <p className="text-text-primary">
                <span className="text-text-muted">Name:</span>{' '}
                <span className="font-medium">{shareholder.name}</span>
              </p>
              {shareholder.identificationNumber && (
                <p className="text-text-muted">
                  NRIC/Passport No.: {shareholder.identificationNumber}
                </p>
              )}
              {showShareInfo && (
                <>
                  {shareholder.shareClass && (
                    <p className="text-text-muted">
                      Share Class: {shareholder.shareClass}
                    </p>
                  )}
                  {shareholder.numberOfShares !== undefined && (
                    <p className="text-text-muted">
                      No. of Shares:{' '}
                      {shareholder.numberOfShares.toLocaleString()}
                    </p>
                  )}
                </>
              )}
              <p className="text-text-muted">Date: _______________</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CSS for Print
// ============================================================================

export const signingBlockPrintStyles = `
  @media print {
    .signing-block-container {
      page-break-inside: avoid;
    }

    .director-signing-block,
    .shareholder-signing-block {
      page-break-inside: avoid;
    }
  }
`;

export default SigningBlock;
