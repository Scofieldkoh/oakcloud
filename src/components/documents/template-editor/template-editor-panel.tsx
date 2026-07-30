'use client';

import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { TemplateDetailsPanel, type TemplateEditorPartialForm, type TemplateEditorTemplateForm } from '@/components/documents/template-editor/template-details-panel';
import type { TemplateValidationIssue } from '@/components/documents/template-editor/template-validation';

type PanelTab = 'template' | 'fields' | 'test-preview';

export interface ResizablePanelState {
  width: number;
  isCollapsed: boolean;
  isResizing: boolean;
  startResize: (event: MouseEvent, direction: 'left' | 'right') => void;
  toggle: () => void;
}

export interface TemplateEditorPanelProps {
  mode: 'template' | 'partial';
  templateForm: TemplateEditorTemplateForm;
  partialForm?: TemplateEditorPartialForm;
  onTemplateChange: (changes: Partial<TemplateEditorTemplateForm>) => void;
  onPartialChange?: (changes: Partial<TemplateEditorPartialForm>) => void;
  fieldsContent: ReactNode;
  testPreviewContent?: ReactNode;
  aiContent?: ReactNode;
  validationIssues: TemplateValidationIssue[];
  onFocusIssue: (flowId: string) => void;
  isDirty?: boolean;
  panel?: ResizablePanelState;
  isSuperAdmin?: boolean;
  activeTenantId?: string;
  tenantName?: string;
}

export function TemplateEditorPanel({ mode, templateForm, partialForm, onTemplateChange, onPartialChange, fieldsContent, testPreviewContent, aiContent, validationIssues, onFocusIssue, isDirty = false, panel, isSuperAdmin, activeTenantId, tenantName }: TemplateEditorPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('template');
  const [aiOpen, setAiOpen] = useState(false);
  const id = useId();
  const tabs: Array<{ id: PanelTab; label: string }> = [{ id: 'template', label: 'Template' }, { id: 'fields', label: 'Fields' }, { id: 'test-preview', label: 'Test & Preview' }];
  const collapsed = panel?.isCollapsed ?? false;
  const panelStyle = panel && !collapsed ? { width: panel.width } : undefined;

  useEffect(() => {
    if (validationIssues.some((issue) => (
      issue.code === 'missing-agreement-slot'
      || issue.code === 'duplicate-agreement-slot'
    ))) {
      setActiveTab('test-preview');
    }
  }, [validationIssues]);

  return <aside aria-label="Template editor tools" style={panelStyle} className={`relative flex h-full shrink-0 border-l border-border-primary bg-background-secondary transition-[width] duration-150 ${collapsed ? 'w-10' : 'min-w-80'}`}><button type="button" aria-label={collapsed ? 'Expand editor tools' : 'Collapse editor tools'} onClick={panel?.toggle} className="absolute -left-8 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-l-md border border-border-primary bg-background-secondary text-text-secondary transition-colors duration-150 hover:bg-background-tertiary">{collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>{!collapsed && <><div role="separator" aria-orientation="vertical" aria-label="Resize editor tools" onMouseDown={(event) => panel?.startResize(event, 'left')} className={`absolute inset-y-0 -left-1 w-2 cursor-col-resize ${panel?.isResizing ? 'bg-accent-primary/30' : ''}`} /><div className="flex min-h-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-border-primary px-3 py-2"><span className="text-xs font-semibold text-text-primary">Editor tools</span>{isDirty && <span className="rounded-full bg-status-warning/15 px-2 py-0.5 text-[11px] font-medium text-status-warning">Unsaved changes</span>}</div><div role="tablist" aria-label="Template editor tasks" className="flex border-b border-border-primary">{tabs.map((tab) => <button key={tab.id} id={`${id}-${tab.id}-tab`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${id}-${tab.id}-panel`} onClick={() => setActiveTab(tab.id)} className={`min-h-8 flex-1 px-2 text-xs font-medium transition-colors duration-150 ${activeTab === tab.id ? 'border-b-2 border-accent-primary text-accent-primary' : 'text-text-muted hover:text-text-primary'}`}>{tab.label}</button>)}</div><div className="min-h-0 flex-1 overflow-y-auto">{activeTab === 'template' && <section id={`${id}-template-panel`} role="tabpanel" aria-labelledby={`${id}-template-tab`}><TemplateDetailsPanel mode={mode} templateForm={templateForm} partialForm={partialForm} onTemplateChange={onTemplateChange} onPartialChange={onPartialChange} isSuperAdmin={isSuperAdmin} activeTenantId={activeTenantId} tenantName={tenantName} /></section>}{activeTab === 'fields' && <section id={`${id}-fields-panel`} role="tabpanel" aria-labelledby={`${id}-fields-tab`}>{fieldsContent}</section>}{activeTab === 'test-preview' && <section id={`${id}-test-preview-panel`} role="tabpanel" aria-labelledby={`${id}-test-preview-tab`} className="space-y-3 p-3"><div className="flex items-center justify-between"><div><h2 className="text-xs font-semibold text-text-primary">Validation</h2><p className="text-[11px] text-text-muted">Check syntax before generating a preview.</p></div>{aiContent && <button type="button" onClick={() => setAiOpen((open) => !open)} className="flex h-8 items-center gap-1 rounded-md border border-border-primary px-2 text-xs font-medium text-text-secondary transition-colors duration-150 hover:bg-background-tertiary"><Sparkles className="h-3.5 w-3.5" />{aiOpen ? 'Hide AI assistant' : 'Open AI assistant'}</button>}</div>{validationIssues.length === 0 ? <p className="rounded-md bg-status-success/10 p-2 text-xs text-status-success">No syntax issues found.</p> : <ul className="space-y-2">{validationIssues.map((issue) => <li key={issue.id}><button type="button" disabled={!issue.flowId} aria-label={issue.message} onClick={() => issue.flowId && onFocusIssue(issue.flowId)} className="w-full rounded-md border border-status-error/30 bg-status-error/10 p-2 text-left text-xs text-status-error disabled:cursor-default disabled:opacity-80">{issue.message}</button></li>)}</ul>}{aiOpen && aiContent}{testPreviewContent && <div className="border-t border-border-primary pt-3">{testPreviewContent}</div>}</section>}</div></div></>}</aside>;
}
