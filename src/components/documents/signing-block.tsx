'use client';

import { forwardRef, useMemo } from 'react';
import { PenLine, Calendar, User, Building2, Stamp } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export type SigningBlockVariant = 'single' | 'dual' | 'witness' | 'corporate';

export interface Signatory {
  name?: string;
  title?: string;
  company?: string;
  nric?: string;
  date?: string;
}

export interface SigningBlockProps {
  /**
   * Variant of the signing block
   */
  variant?: SigningBlockVariant;
  /**
   * Primary signatory
   */
  signatory?: Signatory;
  /**
   * Secondary signatory (for dual/witness variants)
   */
  secondarySignatory?: Signatory;
  /**
   * Label for the signature line (e.g., "Signed by:", "Director:")
   */
  label?: string;
  /**
   * Label for secondary signature (e.g., "Witness:", "Secretary:")
   */
  secondaryLabel?: string;
  /**
   * Show date field
   */
  showDate?: boolean;
  /**
   * Show NRIC/ID field
   */
  showNric?: boolean;
  /**
   * Show company seal placeholder
   */
  showSeal?: boolean;
  /**
   * Signature line width
   */
  lineWidth?: 'sm' | 'md' | 'lg' | 'full';
  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================================
// Line Width Config
// ============================================================================

const LINE_WIDTH_MAP = {
  sm: 'w-40',
  md: 'w-56',
  lg: 'w-72',
  full: 'w-full',
};

// ============================================================================
// Single Signature Block
// ============================================================================

interface SingleSignatureProps {
  signatory?: Signatory;
  label?: string;
  showDate?: boolean;
  showNric?: boolean;
  lineWidth: string;
}

function SingleSignature({
  signatory,
  label = 'Signed by',
  showDate = true,
  showNric = false,
  lineWidth,
}: SingleSignatureProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-text-primary">{label}:</p>

      <div className="space-y-6">
        {/* Signature line */}
        <div className={lineWidth}>
          <div className="h-px bg-text-primary mb-1.5" />
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <PenLine className="w-3 h-3" />
            <span>Signature</span>
          </div>
        </div>

        {/* Name */}
        <div className={lineWidth}>
          <p className="text-sm text-text-primary min-h-[20px] mb-1">
            {signatory?.name || <span className="text-text-tertiary">________________</span>}
          </p>
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <User className="w-3 h-3" />
            <span>Name</span>
          </div>
        </div>

        {/* Title/Designation */}
        {signatory?.title && (
          <div className={lineWidth}>
            <p className="text-sm text-text-primary">{signatory.title}</p>
            <p className="text-xs text-text-muted">Designation</p>
          </div>
        )}

        {/* NRIC */}
        {showNric && (
          <div className={lineWidth}>
            <p className="text-sm text-text-primary min-h-[20px] mb-1">
              {signatory?.nric || <span className="text-text-tertiary">________________</span>}
            </p>
            <p className="text-xs text-text-muted">NRIC/Passport No.</p>
          </div>
        )}

        {/* Date */}
        {showDate && (
          <div className={lineWidth}>
            <p className="text-sm text-text-primary min-h-[20px] mb-1">
              {signatory?.date || <span className="text-text-tertiary">________________</span>}
            </p>
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <Calendar className="w-3 h-3" />
              <span>Date</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Corporate Signature Block
// ============================================================================

interface CorporateSignatureProps {
  signatory?: Signatory;
  showSeal?: boolean;
  lineWidth: string;
}

function CorporateSignature({
  signatory,
  showSeal = true,
  lineWidth,
}: CorporateSignatureProps) {
  return (
    <div className="space-y-4">
      {/* Company name */}
      <div>
        <p className="text-sm font-medium text-text-primary mb-1">
          Executed as a Deed by:
        </p>
        <p className="text-sm font-semibold text-text-primary">
          {signatory?.company || '[COMPANY NAME]'}
        </p>
      </div>

      {/* Seal placeholder */}
      {showSeal && (
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 border-2 border-dashed border-border-secondary rounded-full flex items-center justify-center">
            <div className="text-center">
              <Stamp className="w-6 h-6 text-text-tertiary mx-auto mb-1" />
              <span className="text-2xs text-text-tertiary">Company Seal</span>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            {/* Director signature */}
            <div className={lineWidth}>
              <div className="h-px bg-text-primary mb-1.5" />
              <p className="text-xs text-text-muted">Director</p>
            </div>

            {/* Secretary signature */}
            <div className={lineWidth}>
              <div className="h-px bg-text-primary mb-1.5" />
              <p className="text-xs text-text-muted">Secretary</p>
            </div>
          </div>
        </div>
      )}

      {/* Without seal */}
      {!showSeal && (
        <div className="grid grid-cols-2 gap-8">
          <div className={lineWidth}>
            <div className="h-px bg-text-primary mb-1.5" />
            <p className="text-xs text-text-muted">Director</p>
          </div>
          <div className={lineWidth}>
            <div className="h-px bg-text-primary mb-1.5" />
            <p className="text-xs text-text-muted">Director/Secretary</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const SigningBlock = forwardRef<HTMLDivElement, SigningBlockProps>(
  function SigningBlock(
    {
      variant = 'single',
      signatory,
      secondarySignatory,
      label = 'Signed by',
      secondaryLabel = 'Witness',
      showDate = true,
      showNric = false,
      showSeal = true,
      lineWidth = 'md',
      className = '',
    },
    ref
  ) {
    const lineWidthClass = LINE_WIDTH_MAP[lineWidth];

    const content = useMemo(() => {
      switch (variant) {
        case 'single':
          return (
            <SingleSignature
              signatory={signatory}
              label={label}
              showDate={showDate}
              showNric={showNric}
              lineWidth={lineWidthClass}
            />
          );

        case 'dual':
          return (
            <div className="grid grid-cols-2 gap-8">
              <SingleSignature
                signatory={signatory}
                label={label}
                showDate={showDate}
                showNric={showNric}
                lineWidth="w-full"
              />
              <SingleSignature
                signatory={secondarySignatory}
                label={secondaryLabel}
                showDate={showDate}
                showNric={showNric}
                lineWidth="w-full"
              />
            </div>
          );

        case 'witness':
          return (
            <div className="space-y-8">
              <SingleSignature
                signatory={signatory}
                label={label}
                showDate={showDate}
                showNric={showNric}
                lineWidth={lineWidthClass}
              />
              <div className="pl-8 border-l-2 border-border-secondary">
                <p className="text-xs text-text-muted mb-4">In the presence of:</p>
                <SingleSignature
                  signatory={secondarySignatory}
                  label={secondaryLabel}
                  showDate={showDate}
                  showNric={true}
                  lineWidth={lineWidthClass}
                />
              </div>
            </div>
          );

        case 'corporate':
          return (
            <CorporateSignature
              signatory={signatory}
              showSeal={showSeal}
              lineWidth={lineWidthClass}
            />
          );

        default:
          return null;
      }
    }, [
      variant,
      signatory,
      secondarySignatory,
      label,
      secondaryLabel,
      showDate,
      showNric,
      showSeal,
      lineWidthClass,
    ]);

    return (
      <div
        ref={ref}
        className={`py-6 ${className}`}
        data-signing-block="true"
        data-variant={variant}
      >
        {content}
      </div>
    );
  }
);

// ============================================================================
// Signing Block Preview (for templates)
// ============================================================================

export interface SigningBlockPreviewProps {
  variant: SigningBlockVariant;
  selected?: boolean;
  onClick?: () => void;
}

export function SigningBlockPreview({
  variant,
  selected = false,
  onClick,
}: SigningBlockPreviewProps) {
  const previewConfig: Record<
    SigningBlockVariant,
    { label: string; description: string; icon: React.ElementType }
  > = {
    single: {
      label: 'Single Signature',
      description: 'One signatory',
      icon: PenLine,
    },
    dual: {
      label: 'Dual Signature',
      description: 'Two signatories side by side',
      icon: User,
    },
    witness: {
      label: 'With Witness',
      description: 'Signatory with witness',
      icon: User,
    },
    corporate: {
      label: 'Corporate Seal',
      description: 'Company execution with seal',
      icon: Building2,
    },
  };

  const config = previewConfig[variant];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left p-3 rounded-lg border transition-all
        ${
          selected
            ? 'border-accent-primary bg-accent-primary/5 ring-1 ring-accent-primary'
            : 'border-border-primary bg-background-elevated hover:border-border-secondary'
        }
      `}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-background-secondary flex items-center justify-center">
          <Icon className="w-5 h-5 text-text-muted" />
        </div>
        <div>
          <p className="font-medium text-text-primary">{config.label}</p>
          <p className="text-xs text-text-muted">{config.description}</p>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Signing Block Insert Menu
// ============================================================================

export interface SigningBlockMenuProps {
  onSelect: (variant: SigningBlockVariant) => void;
  className?: string;
}

export function SigningBlockMenu({ onSelect, className = '' }: SigningBlockMenuProps) {
  const variants: SigningBlockVariant[] = ['single', 'dual', 'witness', 'corporate'];

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
        Insert Signing Block
      </p>
      {variants.map((variant) => (
        <SigningBlockPreview
          key={variant}
          variant={variant}
          onClick={() => onSelect(variant)}
        />
      ))}
    </div>
  );
}

export default SigningBlock;
