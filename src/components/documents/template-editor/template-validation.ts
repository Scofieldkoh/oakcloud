import {
  findServiceAgreementSlotViolations,
  SERVICE_AGREEMENT_SLOTS,
  type ServiceAgreementSlotName,
} from '@/lib/service-agreement-template';

const LOOP_FIELD_KEYS = new Set([
  'name',
  'identificationNumber',
  'nationality',
  'role',
  'address',
  'shareClass',
  'numberOfShares',
  'percentageHeld',
]);

type BlockName = 'each' | 'if';

interface BlockEntry {
  name: BlockName;
  start: number;
  bodyStart: number;
}

interface PendingIssue {
  position: number;
  severity: TemplateValidationIssue['severity'];
  code: TemplateValidationIssue['code'];
  message: string;
}

export interface TemplateValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  code:
    | 'unmatched-block'
    | 'unknown-placeholder'
    | 'empty-loop'
    | 'unresolved-partial'
    | 'missing-agreement-slot'
    | 'duplicate-agreement-slot';
  message: string;
  flowId?: string;
}

export { SERVICE_AGREEMENT_SLOTS };
export type { ServiceAgreementSlotName };

export function validateServiceAgreementSlots(content: string): TemplateValidationIssue[] {
  return findServiceAgreementSlotViolations(content).map((violation) => {
    const code =
      violation.kind === 'missing'
        ? 'missing-agreement-slot'
        : 'duplicate-agreement-slot';
    return {
      id: `agreement-${violation.slot}-${code}`,
      severity: 'error',
      code,
      message: violation.message,
    };
  });
}

export interface ValidateTemplateInput {
  compositionType: 'STANDARD' | 'SERVICE_AGREEMENT';
  content: string;
  placeholders: Array<{ key: string }>;
}

export function validateTemplate(input: ValidateTemplateInput): TemplateValidationIssue[] {
  const knownKeys = new Set(input.placeholders.map((placeholder) => placeholder.key));
  const syntaxIssues = validateTemplateSyntax(input.content, knownKeys);
  if (input.compositionType !== 'SERVICE_AGREEMENT') return syntaxIssues;
  return [...syntaxIssues, ...validateServiceAgreementSlots(input.content)];
}

/**
 * Validates only the deterministic template constructs inserted by the guided
 * editor. Issues are ordered by their position in the source HTML so the panel
 * presents a stable, actionable list.
 */
export function validateTemplateSyntax(html: string, knownKeys: ReadonlySet<string>): TemplateValidationIssue[] {
  const issues: PendingIssue[] = [];
  const stack: BlockEntry[] = [];
  const tokenPattern = /\{\{([\s\S]*?)\}\}/g;
  let token: RegExpExecArray | null;

  while ((token = tokenPattern.exec(html)) !== null) {
    const content = token[1].trim();
    const position = token.index;
    const tokenEnd = tokenPattern.lastIndex;
    const openMatch = content.match(/^#(each|if)\s+(.+)$/);
    const closeMatch = content.match(/^\/(each|if)$/);

    if (openMatch) {
      const name = openMatch[1] as BlockName;
      if (name === 'if') {
        validateConditionField(openMatch[2], knownKeys, issues, position);
      }
      stack.push({ name, start: position, bodyStart: tokenEnd });
      continue;
    }

    if (closeMatch) {
      const closingName = closeMatch[1] as BlockName;
      const opening = stack.at(-1);

      if (!opening) {
        issues.push({
          position,
          severity: 'error',
          code: 'unmatched-block',
          message: `Found {{/${closingName}}} without a matching {{#${closingName}}}.`,
        });
        continue;
      }

      if (opening.name !== closingName) {
        issues.push({
          position,
          severity: 'error',
          code: 'unmatched-block',
          message: `{{/${closingName}}} closes an {{#${opening.name}}} block. Close {{/${opening.name}}} first.`,
        });
        recoverFromMismatchedClose(stack, closingName);
        continue;
      }

      stack.pop();
      if (opening.name === 'each' && isEmptyLoop(html.slice(opening.bodyStart, position))) {
        issues.push({
          position: opening.start,
          severity: 'warning',
          code: 'empty-loop',
          message: 'This loop has no content. Select one or more fields before inserting it.',
        });
      }
      continue;
    }

    if (content.startsWith('>')) {
      validatePartial(content, knownKeys, issues, position);
      continue;
    }

    validatePlaceholder(content, knownKeys, stack, issues, position);
  }

  for (const opening of stack) {
    issues.push({
      position: opening.start,
      severity: 'error',
      code: 'unmatched-block',
      message: `{{#${opening.name}}} is not closed. Add {{/${opening.name}}} to complete this block.`,
    });
  }

  return issues
    .sort((left, right) => left.position - right.position)
    .map((issue, index) => ({
      id: `issue-${index + 1}-${issue.code}`,
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    }));
}

/**
 * Treat one wrong closer as a single structural error. If it matches a lower
 * opener, consume that opener and every nested opener it invalidates; otherwise
 * discard the top opener. This prevents one mismatch from causing duplicate
 * end-of-file errors while allowing later independent tokens to be validated.
 */
function recoverFromMismatchedClose(stack: BlockEntry[], closingName: BlockName): void {
  let matchingIndex = -1;
  for (let index = stack.length - 2; index >= 0; index -= 1) {
    if (stack[index].name === closingName) {
      matchingIndex = index;
      break;
    }
  }

  if (matchingIndex >= 0) {
    stack.splice(matchingIndex);
    return;
  }

  stack.pop();
}

function validateConditionField(
  expression: string,
  knownKeys: ReadonlySet<string>,
  issues: PendingIssue[],
  position: number,
): void {
  const field = expression.split(/\s+(?:==|!=)\s+/, 1)[0]?.trim();
  if (field) validateKnownKey(field, knownKeys, false, issues, position);
}

function validatePartial(
  content: string,
  knownKeys: ReadonlySet<string>,
  issues: PendingIssue[],
  position: number,
): void {
  const partialName = content.slice(1).trim();
  if (!partialName || (!knownKeys.has(partialName) && !knownKeys.has(`partial.${partialName}`))) {
    issues.push({
      position,
      severity: 'warning',
      code: 'unresolved-partial',
      message: partialName
        ? `Partial "${partialName}" cannot be resolved. Link it or remove the reference.`
        : 'This partial reference is missing a partial name.',
    });
  }
}

function validatePlaceholder(
  content: string,
  knownKeys: ReadonlySet<string>,
  stack: BlockEntry[],
  issues: PendingIssue[],
  position: number,
): void {
  if (content === 'else' || content.startsWith('!') || content.startsWith('@')) return;

  const modifierMatch = content.match(/^[A-Z_]+\(([a-zA-Z_][a-zA-Z0-9_.\[\]]*)\)$/);
  const key = modifierMatch?.[1] ?? content;
  if (!/^[a-zA-Z_][a-zA-Z0-9_.\[\]]*$/.test(key)) return;

  const isInsideLoop = stack.some((block) => block.name === 'each');
  validateKnownKey(key, knownKeys, isInsideLoop, issues, position);
}

function validateKnownKey(
  key: string,
  knownKeys: ReadonlySet<string>,
  isInsideLoop: boolean,
  issues: PendingIssue[],
  position: number,
): void {
  const loopField = key.startsWith('this.') ? key.slice(5) : key;
  const isKnownLoopField = LOOP_FIELD_KEYS.has(loopField) && (key.startsWith('this.') || isInsideLoop);
  if (knownKeys.has(key) || isKnownLoopField) return;

  issues.push({
    position,
    severity: 'error',
    code: 'unknown-placeholder',
    message: `Placeholder "${key}" is not available. Choose a listed field or create a custom placeholder.`,
  });
}

function isEmptyLoop(bodyHtml: string): boolean {
  return bodyHtml.replace(/<!--([\s\S]*?)-->|<[^>]*>/g, '').trim() === '';
}
