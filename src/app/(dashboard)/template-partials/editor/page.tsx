'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { TemplateEditorWorkflowPage } from './template-editor-workflow-page';

export default function TemplateEditorPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
        </div>
      )}
    >
      <TemplateEditorWorkflowPage />
    </Suspense>
  );
}
