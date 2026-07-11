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
  code: 'unmatched-block' | 'unknown-placeholder' | 'empty-loop' | 'unresolved-partial';
  message: string;
  flowId?: string;
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
        stack.pop();
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
