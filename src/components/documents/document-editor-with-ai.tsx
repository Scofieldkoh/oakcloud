'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { DocumentEditor, type DocumentEditorProps, type DocumentEditorRef } from './document-editor';
import { AISidebar, useAISidebar, type AIContextMode, type DocumentCategory } from './ai-sidebar';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface DocumentEditorWithAIProps extends Omit<DocumentEditorProps, 'ref'> {
  /** AI context mode */
  mode?: AIContextMode;
  /** Template category for context */
  templateCategory?: DocumentCategory;
  /** Template name for context */
  templateName?: string;
  /** Company context for AI */
  companyContext?: {
    name: string;
    uen: string;
    entityType: string;
    directors: Array<{ name: string; role: string }>;
    shareholders: Array<{ name: string; percentage: number }>;
  };
  /** Whether to show the AI toggle button */
  showAIButton?: boolean;
  /** Callback when AI inserts content */
  onAIInsert?: (content: string) => void;
  /** Container className */
  containerClassName?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function DocumentEditorWithAI({
  mode = 'document_editor',
  templateCategory,
  templateName,
  companyContext,
  showAIButton = true,
  onAIInsert,
  containerClassName,
  className,
  ...editorProps
}: DocumentEditorWithAIProps) {
  const editorRef = useRef<DocumentEditorRef>(null);
  const [selectionCheckInterval, setSelectionCheckInterval] = useState<NodeJS.Timeout | null>(null);

  // AI sidebar state
  const aiSidebar = useAISidebar({
    mode,
    templateCategory,
    templateName,
    companyContext,
  });

  // Monitor selection changes in editor
  useEffect(() => {
    if (aiSidebar.isOpen) {
      // Start polling for selection changes
      const interval = setInterval(() => {
        if (editorRef.current) {
          const selectedText = editorRef.current.getSelectedText();
          const surroundingContent = editorRef.current.getSurroundingContent();
          aiSidebar.updateSelection(selectedText, surroundingContent);
        }
      }, 500);
      setSelectionCheckInterval(interval);

      return () => {
        clearInterval(interval);
        setSelectionCheckInterval(null);
      };
    } else {
      if (selectionCheckInterval) {
        clearInterval(selectionCheckInterval);
        setSelectionCheckInterval(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSidebar.isOpen]);

  // Handle AI content insertion
  const handleAIInsert = useCallback(
    (content: string) => {
      if (editorRef.current) {
        editorRef.current.insertContent(content);
        onAIInsert?.(content);
      }
    },
    [onAIInsert]
  );

  // Handle AI content replacement
  const handleAIReplace = useCallback(
    (content: string) => {
      if (editorRef.current) {
        editorRef.current.replaceSelection(content);
        onAIInsert?.(content);
      }
    },
    [onAIInsert]
  );

  return (
    <div className={cn('flex h-full', containerClassName)}>
      {/* Editor container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* AI toggle button (floating) */}
        {showAIButton && (
          <div className="absolute top-2 right-2 z-10">
            <button
              type="button"
              onClick={aiSidebar.toggle}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
                'border shadow-sm',
                aiSidebar.isOpen
                  ? 'bg-accent-primary text-white border-accent-primary'
                  : 'bg-background-elevated text-text-secondary border-border-primary hover:bg-background-tertiary hover:text-accent-primary'
              )}
              title={aiSidebar.isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">AI</span>
            </button>
          </div>
        )}

        {/* Document Editor */}
        <DocumentEditor
          ref={editorRef}
          className={cn('flex-1', className)}
          {...editorProps}
        />
      </div>

      {/* AI Sidebar */}
      <AISidebar
        isOpen={aiSidebar.isOpen}
        onClose={aiSidebar.close}
        context={aiSidebar.context}
        onInsert={handleAIInsert}
        onReplace={handleAIReplace}
      />
    </div>
  );
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export type { DocumentEditorRef } from './document-editor';
