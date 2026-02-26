import { LayoutTemplate } from 'lucide-react';

export default function WorkflowTemplatesPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Workflow Templates</h1>
        <p className="text-text-secondary text-sm mt-1">
          Template management is planned after the project and task screens are finalized.
        </p>
      </div>

      <div className="card p-6 sm:p-10 text-center">
        <LayoutTemplate className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <h2 className="text-base sm:text-lg font-medium text-text-primary mb-2">Template Builder Coming Next</h2>
        <p className="text-text-secondary max-w-xl mx-auto">
          This section will manage reusable workflow blueprints including default tasks, due offsets, and assignments.
        </p>
      </div>
    </div>
  );
}
