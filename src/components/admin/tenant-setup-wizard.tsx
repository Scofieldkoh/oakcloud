'use client';

import { useState, useCallback } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Stepper, type Step } from '@/components/ui/stepper';
import { StepTenantInfo } from './wizard-steps/step-tenant-info';
import { StepCreateAdmin } from './wizard-steps/step-create-admin';
import { StepCreateCompany } from './wizard-steps/step-create-company';
import { StepReviewActivate } from './wizard-steps/step-review-activate';
import {
  setupTenantInfoSchema,
  setupAdminUserSchema,
  setupFirstCompanySchema,
  type SetupTenantInfoInput,
  type SetupAdminUserInput,
  type SetupFirstCompanyInput,
} from '@/lib/validations/tenant';
import { ArrowLeft, ArrowRight, Rocket, Copy, Check, Key } from 'lucide-react';
import { z } from 'zod';

const WIZARD_STEPS: Step[] = [
  { id: 'tenant-info', label: 'Tenant Info' },
  { id: 'admin-user', label: 'Admin User' },
  { id: 'first-company', label: 'First Company', isOptional: true },
  { id: 'review', label: 'Review & Activate' },
];

interface TenantSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: {
    id: string;
    name: string;
    slug: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  onComplete: () => void;
}

interface SetupResult {
  tenant: { id: string; name: string; slug: string; status: string };
  adminUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    temporaryPassword?: string;
  };
  company?: { id: string; uen: string; name: string } | null;
}

export function TenantSetupWizard({
  isOpen,
  onClose,
  tenant,
  onComplete,
}: TenantSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Form state
  const [tenantInfo, setTenantInfo] = useState<SetupTenantInfoInput>({
    name: tenant.name,
    contactEmail: tenant.contactEmail,
    contactPhone: tenant.contactPhone,
  });

  const [adminUser, setAdminUser] = useState<SetupAdminUserInput | null>(null);
  const [firstCompany, setFirstCompany] = useState<SetupFirstCompanyInput | null>(null);
  const [isCompanySkipped, setIsCompanySkipped] = useState(false);

  // Validate current step
  const validateStep = useCallback((step: number): boolean => {
    setStepErrors({});

    try {
      switch (step) {
        case 0:
          setupTenantInfoSchema.parse(tenantInfo);
          return true;
        case 1:
          if (!adminUser) {
            setStepErrors({ email: 'Admin user details are required' });
            return false;
          }
          setupAdminUserSchema.parse(adminUser);
          return true;
        case 2:
          if (!isCompanySkipped && firstCompany) {
            setupFirstCompanySchema.parse(firstCompany);
          }
          return true;
        case 3:
          return !!adminUser;
        default:
          return true;
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach((e) => {
          const path = e.path.join('.');
          errors[path] = e.message;
        });
        setStepErrors(errors);
      }
      return false;
    }
  }, [tenantInfo, adminUser, firstCompany, isCompanySkipped]);

  // Navigation
  const canGoNext = currentStep < WIZARD_STEPS.length - 1;
  const canGoBack = currentStep > 0;

  const goNext = () => {
    if (validateStep(currentStep) && canGoNext) {
      setCurrentStep((prev) => prev + 1);
      setError(null);
    }
  };

  const goBack = () => {
    if (canGoBack) {
      setCurrentStep((prev) => prev - 1);
      setError(null);
      setStepErrors({});
    }
  };

  const handleStepClick = (index: number) => {
    if (index < currentStep) {
      setCurrentStep(index);
      setError(null);
      setStepErrors({});
    }
  };

  // Submit setup
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;
    if (!adminUser) {
      setError('Admin user is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/tenants/${tenant.id}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantInfo,
          adminUser,
          firstCompany: isCompanySkipped ? null : firstCompany,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to complete setup');
      }

      setSetupResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy password to clipboard
  const copyPassword = () => {
    if (setupResult?.adminUser.temporaryPassword) {
      navigator.clipboard.writeText(setupResult.adminUser.temporaryPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  // Close and reset
  const handleClose = () => {
    if (!isSubmitting) {
      setCurrentStep(0);
      setError(null);
      setStepErrors({});
      setSetupResult(null);
      setAdminUser(null);
      setFirstCompany(null);
      setIsCompanySkipped(false);
      onClose();
    }
  };

  // Handle complete (after viewing result)
  const handleDone = () => {
    handleClose();
    onComplete();
  };

  // Render success result
  if (setupResult) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleDone}
        title="Setup Complete"
        size="md"
      >
        <ModalBody>
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-text-primary">
                Tenant Activated Successfully
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                {setupResult.tenant.name} is now active and ready to use.
              </p>
            </div>

            {/* Admin User Details */}
            <div className="p-4 rounded-lg bg-background-secondary border border-border-secondary">
              <h4 className="font-medium text-text-primary mb-3">Admin User Created</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex">
                  <dt className="w-24 text-text-muted">Email:</dt>
                  <dd className="text-text-primary font-mono">{setupResult.adminUser.email}</dd>
                </div>
                <div className="flex">
                  <dt className="w-24 text-text-muted">Name:</dt>
                  <dd className="text-text-primary">
                    {setupResult.adminUser.firstName} {setupResult.adminUser.lastName}
                  </dd>
                </div>
              </dl>

              {/* Temporary Password (dev only) */}
              {setupResult.adminUser.temporaryPassword && (
                <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Temporary Password
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded bg-white dark:bg-gray-900 font-mono text-sm">
                      {setupResult.adminUser.temporaryPassword}
                    </code>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={copyPassword}
                      leftIcon={copiedPassword ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    >
                      {copiedPassword ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    The user must change this password on first login.
                  </p>
                </div>
              )}
            </div>

            {/* Company Created */}
            {setupResult.company && (
              <div className="p-4 rounded-lg bg-background-secondary border border-border-secondary">
                <h4 className="font-medium text-text-primary mb-3">Company Created</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex">
                    <dt className="w-24 text-text-muted">UEN:</dt>
                    <dd className="text-text-primary font-mono">{setupResult.company.uen}</dd>
                  </div>
                  <div className="flex">
                    <dt className="w-24 text-text-muted">Name:</dt>
                    <dd className="text-text-primary">{setupResult.company.name}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" size="sm" onClick={handleDone}>
            Done
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  // Render wizard
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Setup: ${tenant.name}`}
      size="2xl"
    >
      <ModalBody>
        {/* Stepper */}
        <div className="mb-8">
          <Stepper
            steps={WIZARD_STEPS}
            currentStep={currentStep}
            onStepClick={handleStepClick}
          />
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="error" className="mb-6" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Step Content */}
        <div>
          {currentStep === 0 && (
            <StepTenantInfo
              data={tenantInfo}
              onChange={setTenantInfo}
              errors={stepErrors}
            />
          )}
          {currentStep === 1 && (
            <StepCreateAdmin
              data={adminUser}
              onChange={setAdminUser}
              errors={stepErrors}
            />
          )}
          {currentStep === 2 && (
            <StepCreateCompany
              data={firstCompany}
              onChange={setFirstCompany}
              errors={stepErrors}
              isSkipped={isCompanySkipped}
              onSkipChange={setIsCompanySkipped}
            />
          )}
          {currentStep === 3 && (
            <StepReviewActivate
              tenantName={tenant.name}
              tenantInfo={tenantInfo}
              adminUser={adminUser}
              firstCompany={firstCompany}
              isCompanySkipped={isCompanySkipped}
            />
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex justify-between w-full">
          <div>
            {canGoBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goBack}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                disabled={isSubmitting}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            {canGoNext ? (
              <Button
                variant="primary"
                size="sm"
                onClick={goNext}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                {currentStep === 2 && isCompanySkipped ? 'Skip & Continue' : 'Next'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                isLoading={isSubmitting}
                leftIcon={<Rocket className="w-4 h-4" />}
              >
                Activate Tenant
              </Button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  );
}
