'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, Save, ShieldAlert } from 'lucide-react';
import { AsyncSearchSelect } from '@/components/ui/async-search-select';
import { SingleDateInput } from '@/components/ui/single-date-input';
import { useCompanySearch, type CompanySearchOption } from '@/hooks/use-company-search';
import { useCreateWorkflowProject } from '@/hooks/use-workflow-projects';
import { usePermissions } from '@/hooks/use-permissions';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useUnsavedChangesWarning } from '@/hooks/use-unsaved-changes';
import { cn } from '@/lib/utils';

type RecurrenceMode = 'one-time' | 'recurring';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function NewWorkflowProjectPage() {
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const createWorkflowProject = useCreateWorkflowProject();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const initialDates = useMemo(() => {
    const today = new Date();
    const startDate = toDateInputValue(today);
    const dueDateCandidate = new Date(today);
    dueDateCandidate.setDate(dueDateCandidate.getDate() + 30);
    const dueDate = toDateInputValue(dueDateCandidate);
    return { startDate, dueDate };
  }, []);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(initialDates.startDate);
  const [dueDate, setDueDate] = useState(initialDates.dueDate);
  const [recurrenceMode, setRecurrenceMode] = useState<RecurrenceMode>('one-time');
  const [recurrenceMonthsInput, setRecurrenceMonthsInput] = useState('1');

  const {
    searchQuery,
    setSearchQuery,
    options: companyOptions,
    isLoading: isCompanySearchLoading,
    selectedCompany,
    setSelectedCompany,
  } = useCompanySearch({ minChars: 0, limit: 25 });

  const isDirty = Boolean(
    selectedCompany
    || name.trim()
    || startDate !== initialDates.startDate
    || dueDate !== initialDates.dueDate
    || recurrenceMode !== 'one-time'
  );
  useUnsavedChangesWarning(isDirty, !createWorkflowProject.isPending);

  const handleCancel = () => {
    router.push('/workflow/projects');
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSubmitError(null);

    if (!selectedCompany?.id) {
      setSubmitError('Please select a company');
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      setSubmitError('Project name is required');
      return;
    }

    if (dueDate < startDate) {
      setSubmitError('End date must be on or after start date');
      return;
    }

    let recurrenceMonths: number | null = null;
    if (recurrenceMode === 'recurring') {
      const parsed = Number(recurrenceMonthsInput);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 120) {
        setSubmitError('Recurring interval must be a whole number between 1 and 120 months');
        return;
      }
      recurrenceMonths = parsed;
    }

    try {
      const created = await createWorkflowProject.mutateAsync({
        companyId: selectedCompany.id,
        name: normalizedName,
        startDate,
        dueDate,
        recurrenceMonths,
      });
      router.push(`/workflow/projects/${created.id}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create workflow project');
    }
  };

  useKeyboardShortcuts([
    {
      key: 'Backspace',
      ctrl: true,
      handler: handleCancel,
      description: 'Cancel and go back',
    },
    {
      key: 's',
      ctrl: true,
      handler: () => {
        void handleSubmit();
      },
      description: 'Create workflow project',
    },
  ], !createWorkflowProject.isPending);

  if (permissionsLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-oak-primary animate-spin" />
      </div>
    );
  }

  if (!can.updateCompany) {
    return (
      <div className="p-4 sm:p-6">
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-status-warning mx-auto mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">Access Denied</h2>
          <p className="text-sm text-text-secondary mb-4">
            You do not have permission to create workflow projects.
          </p>
          <Link href="/workflow/projects" className="btn-primary btn-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="mb-6">
        <Link
          href="/workflow/projects"
          title="Back to Projects (Ctrl+Backspace)"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Create Workflow Project</h1>
        <p className="text-sm text-text-secondary mt-1">
          Create a workflow instance for a company. You can create multiple workflows per company.
        </p>
      </div>

      {submitError && (
        <div className="card border-status-error bg-status-error/5 mb-4">
          <div className="flex items-center gap-3 text-status-error">
            <AlertCircle className="w-5 h-5" />
            <p>{submitError}</p>
          </div>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
        <div className="card">
          <div className="p-4 border-b border-border-primary">
            <h2 className="text-lg font-semibold text-text-primary">Project Setup</h2>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="label">Company *</label>
              <AsyncSearchSelect<CompanySearchOption>
                value={selectedCompany?.id ?? ''}
                onChange={(_id, option) => setSelectedCompany(option)}
                options={companyOptions}
                isLoading={isCompanySearchLoading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search company..."
                emptySearchText="Type to find a company"
                noResultsText="No company found"
              />
            </div>

            <div>
              <label className="label">Project Name *</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g., Jan 2026 Accounts Closing"
                className="input input-sm"
                maxLength={255}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SingleDateInput
                label="Start Date"
                required
                value={startDate}
                onChange={setStartDate}
              />

              <SingleDateInput
                label="End Date (Optional)"
                value={dueDate}
                onChange={setDueDate}
                minDate={startDate || undefined}
              />
            </div>

            <div>
              <label className="label">Recurring</label>
              <div className="inline-flex items-center gap-1 rounded-full border border-border-primary bg-background-secondary/30 p-1">
                <button
                  type="button"
                  onClick={() => setRecurrenceMode('one-time')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm transition-colors',
                    recurrenceMode === 'one-time'
                      ? 'bg-oak-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  One-time
                </button>
                <button
                  type="button"
                  onClick={() => setRecurrenceMode('recurring')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm transition-colors',
                    recurrenceMode === 'recurring'
                      ? 'bg-oak-primary text-white'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  Every _ months
                </button>
              </div>

              {recurrenceMode === 'recurring' && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={recurrenceMonthsInput}
                    onChange={(event) => setRecurrenceMonthsInput(event.target.value)}
                    className="input input-sm w-24"
                  />
                  <span className="text-sm text-text-secondary">month(s)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link href="/workflow/projects" className="btn-secondary btn-sm" title="Cancel (Ctrl+Backspace)">
            <span className="hidden sm:inline">Cancel (Ctrl+Backspace)</span>
            <span className="sm:hidden">Cancel</span>
          </Link>
          <button
            type="submit"
            className="btn-primary btn-sm inline-flex items-center gap-2"
            title="Create Project (Ctrl+S)"
            disabled={createWorkflowProject.isPending}
          >
            <Save className="w-4 h-4" />
            {createWorkflowProject.isPending ? 'Creating...' : (
              <>
                <span className="hidden sm:inline">Create Project (Ctrl+S)</span>
                <span className="sm:hidden">Create</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
