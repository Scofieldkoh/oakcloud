'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface Step {
  id: string;
  label: string;
  description?: string;
  isOptional?: boolean;
}

export interface StepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export function Stepper({ steps, currentStep, onStepClick, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={cn('w-full', className)}>
      <ol className="flex items-start justify-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = onStepClick && isCompleted;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className="flex items-start">
              {/* Step with label */}
              <div className="flex flex-col items-center">
                {/* Step indicator */}
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all',
                    isCompleted && 'bg-oak-primary text-white',
                    isCurrent && 'border-2 border-oak-primary bg-background-primary text-oak-primary',
                    !isCompleted && !isCurrent && 'border-2 border-border-secondary bg-background-primary text-text-muted',
                    isClickable && 'cursor-pointer hover:bg-oak-light'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </button>

                {/* Step label - centered below indicator */}
                <div className="mt-2 text-center w-20">
                  <span
                    className={cn(
                      'text-xs font-medium leading-tight block',
                      isCurrent && 'text-oak-primary',
                      isCompleted && 'text-text-primary',
                      !isCompleted && !isCurrent && 'text-text-muted'
                    )}
                  >
                    {step.label}
                  </span>
                  {step.isOptional && (
                    <span className="block text-xs text-text-muted">(Optional)</span>
                  )}
                </div>
              </div>

              {/* Connector line - separate from step column */}
              {!isLast && (
                <div
                  className={cn(
                    'w-8 sm:w-12 md:w-16 h-0.5 mt-4 transition-colors',
                    isCompleted ? 'bg-oak-primary' : 'bg-border-secondary'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Compact horizontal stepper for smaller spaces
export function StepperCompact({ steps, currentStep, className }: Omit<StepperProps, 'onStepClick'>) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;

        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                isCompleted && 'bg-oak-primary text-white',
                isCurrent && 'border-2 border-oak-primary text-oak-primary',
                !isCompleted && !isCurrent && 'border border-border-secondary text-text-muted'
              )}
            >
              {isCompleted ? <Check className="h-3 w-3" /> : index + 1}
            </div>
            <span
              className={cn(
                'text-sm',
                isCurrent && 'font-medium text-text-primary',
                !isCurrent && 'text-text-muted'
              )}
            >
              {step.label}
            </span>
            {index !== steps.length - 1 && (
              <div
                className={cn(
                  'h-px w-4',
                  isCompleted ? 'bg-oak-primary' : 'bg-border-secondary'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
