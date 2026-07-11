import { describe, expect, it } from 'vitest';

import { validateTemplateSyntax } from '@/components/documents/template-editor/template-validation';

describe('template syntax validation', () => {
  it('reports unmatched and unknown constructs with actionable messages', () => {
    const issues = validateTemplateSyntax(
      '<p>{{#each directors}}</p><p>{{company.missing}}</p>',
      new Set(['company.name']),
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      'unmatched-block',
      'unknown-placeholder',
    ]);
    expect(issues[0].message).toContain('{{/each}}');
    expect(issues[1].message).toContain('company.missing');
  });

  it('returns deterministic issues for mismatched blocks, empty loops, and unresolved partials', () => {
    const issues = validateTemplateSyntax(
      '{{#if company.name}}{{/each}}{{#each directors}}{{/each}}{{> letterhead}}{{unknown.value}}',
      new Set(['company.name']),
    );

    expect(issues.map((issue) => [issue.code, issue.severity])).toEqual([
      ['unmatched-block', 'error'],
      ['empty-loop', 'warning'],
      ['unresolved-partial', 'warning'],
      ['unknown-placeholder', 'error'],
    ]);
    expect(issues.map((issue) => issue.id)).toEqual([
      'issue-1-unmatched-block',
      'issue-2-empty-loop',
      'issue-3-unresolved-partial',
      'issue-4-unknown-placeholder',
    ]);
  });

  it('does not report known keys or supported loop fields as unknown', () => {
    const issues = validateTemplateSyntax(
      '{{#if company.name}}{{#each directors}}<p>{{this.name}}</p>{{/each}}{{/if}}',
      new Set(['company.name']),
    );

    expect(issues).toEqual([]);
  });

  it('recovers from a nested mismatch without adding an EOF error before later unknown keys', () => {
    const issues = validateTemplateSyntax(
      '{{#each directors}}{{#if company.name}}{{/each}}{{company.missing}}',
      new Set(['company.name']),
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      'unmatched-block',
      'unknown-placeholder',
    ]);
    expect(issues[0].message).toContain('{{/if}}');
  });
});
