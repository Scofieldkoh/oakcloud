import { ValidationError } from '@/lib/errors';
import { OAKDOC_ERROR_REASONS } from '@/types/oakdoc';

/**
 * I2: the A4 editor is retired. Every service that would create or change
 * A4 content calls this, so old clients, scripts and direct API calls get
 * the same answer. Reading and exporting historical A4 records is still
 * allowed; A4 drafts move to OakDoc through the reviewed draft conversion.
 */
export type A4RetiredOperation =
  | 'template-create'
  | 'template-edit'
  | 'template-duplicate'
  | 'partial-create'
  | 'partial-edit'
  | 'partial-duplicate'
  | 'document-generate'
  | 'document-create-blank'
  | 'document-edit'
  | 'document-clone'
  | 'batch-edit';

const MESSAGES: Record<A4RetiredOperation, string> = {
  'template-create': 'New templates are created in OakDoc. Upload or start a Word template instead.',
  'template-edit': 'A4 templates can no longer be edited. Migrate the template to OakDoc to change it.',
  'template-duplicate': 'A4 templates can no longer be duplicated. Migrate the template to OakDoc first.',
  'partial-create': 'New partials are Word partials. Upload a Word partial instead.',
  'partial-edit': 'A4 partials can no longer be edited. Create a Word partial to change this wording.',
  'partial-duplicate': 'A4 partials can no longer be duplicated. Create a Word partial instead.',
  'document-generate': 'This template uses the retired A4 editor. Generate from an OakDoc template instead.',
  'document-create-blank': 'Blank documents are created in OakDoc.',
  'document-edit': 'A4 documents can no longer be edited. Convert the draft to OakDoc to keep working on it.',
  'document-clone': 'A4 documents can no longer be copied. Convert the draft to OakDoc instead.',
  'batch-edit': 'A4 batch items can no longer be edited. Use OakDoc templates for batches.',
};

export class A4RetiredError extends ValidationError {
  constructor(operation: A4RetiredOperation) {
    super(MESSAGES[operation], { reason: OAKDOC_ERROR_REASONS.A4_RETIRED, operation });
    this.name = 'A4RetiredError';
  }
}

export function rejectRetiredA4Operation(operation: A4RetiredOperation): never {
  throw new A4RetiredError(operation);
}
