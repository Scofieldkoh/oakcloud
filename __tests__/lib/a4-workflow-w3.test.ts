import { describe, expect, it } from 'vitest';

import {
  assembleA4OutputPages,
  createA4OutputPreparationSession,
} from '@/lib/document-editor/a4-output-preparation';
import {
  assessA4RevisionRolloutReadiness,
  deriveA4WorkflowStatus,
} from '@/lib/document-editor/a4-workflow-status';
import { SERVER_A4_EDITOR_CAPABILITIES } from '@/lib/document-editor/a4-editor-capabilities';
import { placeholderDefinitionSchema } from '@/lib/validations/document-template';
import { batchItemConfigurationSchema } from '@/lib/validations/document-generation-batch';
import { sanitizeCanonicalA4Html } from '@/services/a4-content-sanitizer.service';

describe('W3 shared output preparation', () => {
  it('preserves supported semantic output through one page assembler', () => {
    const result = assembleA4OutputPages([
      {
        content: '<blockquote>Quote</blockquote><table><caption>Caption</caption><tbody><tr><td>A</td></tr></tbody><tfoot><tr><td>Footer</td></tr></tfoot></table><ol start="4"><li>Four</li></ol>',
        hardBreakBefore: false,
      },
      {
        content: '<p data-a4-break="page-before">Second page</p>',
        hardBreakBefore: true,
        oversized: true,
      },
    ], {
      sanitizeFragment: (html) => sanitizeCanonicalA4Html(html, { projection: true }),
    });

    expect(result.pageCount).toBe(2);
    expect(result.html).toContain('<blockquote>Quote</blockquote>');
    expect(result.html).toContain('<caption>Caption</caption>');
    expect(result.html).toContain('<tfoot>');
    expect(result.html).toContain('<ol start="4">');
    expect(result.html).toContain('data-hard-break-before="true"');
    expect(result.html).toContain('data-oversized="true"');
    expect(result.html).toContain('print-page-number">1</div>');
    expect(result.html).toContain('print-page-number">2</div>');
  });

  it('removes explicit remove-page markers without renumbering gaps', () => {
    const result = assembleA4OutputPages([
      { content: '<p>First</p>', hardBreakBefore: false },
      { content: '<p>[Remove Page]</p>', hardBreakBefore: false },
      { content: '<p>Third</p>', hardBreakBefore: false },
    ], { sanitizeFragment: (html) => html });

    expect(result.pageCount).toBe(2);
    expect(result.html).toContain('print-page-number">1</div>');
    expect(result.html).toContain('print-page-number">2</div>');
    expect(result.html).not.toContain('[Remove Page]');
  });

  it('requires font, pagination and installation readiness and cleans up LIFO', async () => {
    const events: string[] = [];
    const session = createA4OutputPreparationSession('pdf');
    session.addCleanup(() => { events.push('first'); });
    session.addCleanup(() => { events.push('second'); });
    expect(() => session.assertReady()).toThrow('not ready');
    session.markFontsReady();
    session.markPaginationReady();
    session.markInstalled();
    expect(() => session.assertReady()).not.toThrow();
    expect(session.snapshot()).toMatchObject({
      target: 'pdf',
      canonical: 'ready',
      fonts: 'ready',
      pagination: 'ready',
      installed: 'ready',
      cancelled: false,
    });
    await session.dispose();
    expect(events).toEqual(['second', 'first']);
    expect(session.snapshot().disposed).toBe(true);
  });

  it('propagates cancellation through AbortSignal and does not report ready', async () => {
    const controller = new AbortController();
    const session = createA4OutputPreparationSession('html', controller.signal);
    controller.abort('test-cancel');
    expect(session.signal.aborted).toBe(true);
    expect(() => session.assertReady()).toThrow('cancelled');
    await session.dispose();
  });
});

describe('W3 C07 rollout readiness', () => {
  it('reports current production writer capability as not yet strict-ready without mutating it', () => {
    const readiness = assessA4RevisionRolloutReadiness(SERVER_A4_EDITOR_CAPABILITIES);
    expect(readiness.compatible).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      'writer-format-level-2',
      'required-revision-precondition',
    ]));
    expect(SERVER_A4_EDITOR_CAPABILITIES.allowedWriterFormatLevel).toBe(1);
    expect(SERVER_A4_EDITOR_CAPABILITIES.revisionPrecondition).toBe('optional');
  });

  it('accepts a synthetic fully compatible reader/writer capability', () => {
    expect(assessA4RevisionRolloutReadiness({
      ...SERVER_A4_EDITOR_CAPABILITIES,
      readerFormatLevel: 2,
      allowedWriterFormatLevel: 2,
      revisionPrecondition: 'required',
    })).toMatchObject({ compatible: true, blockers: [] });
  });

  it('exposes recoverable dirty, conflict and error status', () => {
    expect(deriveA4WorkflowStatus({
      serverRevision: 7,
      acknowledgedRevision: 3,
      localRevision: 4,
      saving: false,
    })).toMatchObject({ phase: 'dirty', dirty: true, canSave: true });
    expect(deriveA4WorkflowStatus({
      serverRevision: 8,
      acknowledgedRevision: 4,
      localRevision: 5,
      saving: false,
      conflict: true,
    })).toMatchObject({ phase: 'conflict', canSave: false, shouldRetry: false });
    expect(deriveA4WorkflowStatus({
      serverRevision: 8,
      acknowledgedRevision: 4,
      localRevision: 5,
      saving: false,
      error: 'forced failure',
    })).toMatchObject({ phase: 'error', shouldRetry: true, message: 'forced failure' });
  });
});

describe('W3 schema preservation', () => {
  it('preserves stable IDs, legacy types, options, source/path and unknown JSON metadata', () => {
    const input = {
      id: 'stable-field-id',
      key: 'custom.future',
      label: 'Future field',
      type: 'legacy-future-widget',
      source: 'custom',
      path: 'custom.future',
      options: [{ label: 'A', value: 'a' }],
      required: false,
      xFutureMetadata: { nested: [1, true, 'x'] },
    };
    const parsed = placeholderDefinitionSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it('keeps false and zero-like exact strings distinct at the batch API boundary', () => {
    const parsed = batchItemConfigurationSchema.parse({
      version: 1,
      title: 'Typed values',
      contactIds: [],
      selectedDirectorId: null,
      selectedShareholderId: null,
      selectedContactId: null,
      itemValues: {
        approved: false,
        amount: '0',
        date: '2026-09-13',
        notes: 'line one\nline two',
      },
      masterOverrides: {},
      useLetterhead: true,
      serviceAgreement: null,
    });
    expect(parsed.itemValues).toEqual({
      approved: false,
      amount: '0',
      date: '2026-09-13',
      notes: 'line one\nline two',
    });
  });
});
