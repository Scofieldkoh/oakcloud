import { ListTodo } from 'lucide-react';

export default function WorkflowTasksPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary">Workflow Tasks</h1>
        <p className="text-text-secondary text-sm mt-1">
          Task board is planned next. This page is a placeholder for the upcoming module.
        </p>
      </div>

      <div className="card p-6 sm:p-10 text-center">
        <ListTodo className="w-10 h-10 text-text-muted mx-auto mb-3" />
        <h2 className="text-base sm:text-lg font-medium text-text-primary mb-2">Tasks View Coming Next</h2>
        <p className="text-text-secondary max-w-xl mx-auto">
          The workflow task board will include list and kanban views, status pipelines, and assignee-focused filters.
        </p>
      </div>
    </div>
  );
}
