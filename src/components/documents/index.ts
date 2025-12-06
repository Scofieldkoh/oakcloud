// Document Generation Components

// Document Editor
export { DocumentEditor, type DocumentEditorProps, type DocumentEditorRef } from './document-editor';

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

// Template Selection Wizard
export {
  TemplateSelectionWizard,
  TemplateSelectDropdown,
  type TemplateOption,
  type PlaceholderDefinition,
  type TemplateCategory,
  type TemplateSelectionWizardProps,
  type TemplateSelectDropdownProps,
} from './template-selection-wizard';

// Document Generation Wizard
export {
  DocumentGenerationWizard,
  type CompanyOption,
  type WizardData,
  type DocumentGenerationWizardProps,
} from './document-generation-wizard';

// Section Navigation
export {
  SectionNavigation,
  SectionNavigationSidebar,
  type DocumentSection,
  type SectionNavigationProps,
  type SectionNavigationSidebarProps,
} from './section-navigation';

// Page Break Indicator
export {
  PageBreakIndicator,
  PageBreakNode,
  PageBreakButton,
  PageNumberDisplay,
  type PageBreakIndicatorProps,
  type PageBreakNodeProps,
  type PageBreakButtonProps,
  type PageNumberDisplayProps,
} from './page-break-indicator';

// Signing Block
export {
  SigningBlock,
  SigningBlockPreview,
  SigningBlockMenu,
  type SigningBlockVariant,
  type Signatory,
  type SigningBlockProps,
  type SigningBlockPreviewProps,
  type SigningBlockMenuProps,
} from './signing-block';

// PDF Preview Panel
export {
  PdfPreviewPanel,
  PdfPreviewThumbnail,
  type PdfPreviewOptions,
  type PdfPreviewPanelProps,
  type PdfPreviewThumbnailProps,
} from './pdf-preview-panel';
