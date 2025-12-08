// Document Generation Components

// Document Editor
export { DocumentEditor, type DocumentEditorProps, type DocumentEditorRef } from './document-editor';

// Document Editor with AI Integration
export { DocumentEditorWithAI, type DocumentEditorWithAIProps } from './document-editor-with-ai';

// AI Sidebar
export {
  AISidebar,
  useAISidebar,
  type AISidebarProps,
  type AIContext,
  type AIContextMode,
  type AIChatMessage,
  type DocumentCategory,
} from './ai-sidebar';

// Validation Panel
export { ValidationPanel, type ValidationPanelProps, type ValidationResult, type ValidationError, type ValidationWarning } from './validation-panel';

// Draft Recovery
export {
  DraftRecoveryPrompt,
  useDraftRecovery,
  AutoSaveIndicator,
  type DraftRecoveryPromptProps,
  type DraftData,
  type DraftRecoveryData,
  type AutoSaveIndicatorProps,
} from './draft-recovery-prompt';

// Template Selector
export { TemplateSelector, type TemplateSelectorProps, type DocumentTemplate } from './template-selector';

// Document Generation Wizard
export {
  DocumentGenerationWizard,
  type GenerationWizardProps,
  type GenerateDocumentData,
  type GeneratedDocumentResult,
} from './document-generation-wizard';

// Section Navigator
export { SectionNavigator, type SectionNavigatorProps, type DocumentSection } from './section-navigator';

// Page Break Indicator
export {
  PageBreakIndicator,
  PageBreakInsertButton,
  PageBreakToolbar,
  RenderContentWithPageBreaks,
  parseContentForPageBreaks,
  type PageBreakIndicatorProps,
  type PageBreakInsertProps,
} from './page-break-indicator';

// Signing Block Renderer
export {
  SigningBlock,
  SingleSignatureBlock,
  DirectorSigningBlock,
  ShareholderSigningBlock,
  signingBlockPrintStyles,
  type SigningBlockProps,
  type SingleSignatureBlockProps,
  type Signatory,
} from './signing-block-renderer';

// PDF Preview Panel
export { PDFPreviewPanel, type PDFPreviewPanelProps } from './pdf-preview-panel';

// Comment Components
export {
  CommentThread,
  type CommentThreadProps,
  type Comment,
  type CommentUser,
} from './comment-thread';

export {
  CommentPanel,
  type CommentPanelProps,
  type CommentFilter,
} from './comment-panel';

export {
  ExternalCommentPanel,
  type ExternalCommentPanelProps,
} from './external-comment-panel';

export {
  TextSelectionHighlight,
  useTextSelection,
  buildCommentHighlights,
  type TextSelectionHighlightProps,
  type TextRange,
  type CommentHighlight,
} from './text-selection-highlight';
