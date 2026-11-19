// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unexpectedErrorKind } from '@/services/sentroweb/client';

describe('unexpectedErrorKind (what the pre-confirm failure log says about a non-Sentroweb error)', () => {
  it.each([
    ['No element found for selector: form input[name="birthDate"]', 'no-element-for-selector'],
    ['Node is either not clickable or not an Element', 'not-clickable'],
    ['Waiting for selector `x` failed: Waiting failed: 30000ms exceeded', 'timeout'],
    ['Execution context was destroyed, most likely because of a navigation', 'page-changed'],
    ['Protocol error (Runtime.callFunctionOn): Target closed', 'browser-closed'],
    ['something else entirely', 'other'],
  ])('classifies %j as %s', (message, reason) => {
    expect(unexpectedErrorKind(new Error(message))).toEqual({ errorName: 'Error', reason });
  });

  it('never carries the message, a selector or a value', () => {
    const kind = unexpectedErrorKind(new Error('No element found for selector: form input[name="birthDate"] 1980-01-01 Jane Doe'));
    expect(kind).toEqual({ errorName: 'Error', reason: 'no-element-for-selector' });
    expect(JSON.stringify(kind)).not.toMatch(/birthDate|1980|Jane/);
  });

  it('keeps only a plain class name, and handles values that are not errors', () => {
    class Weird extends Error {
      constructor() {
        super('x');
        this.name = 'Bad name with 1980-01-01 spaces';
      }
    }
    expect(unexpectedErrorKind(new Weird()).errorName).toBe('NonError');
    expect(unexpectedErrorKind('a string')).toEqual({ errorName: 'NonError', reason: 'other' });
    expect(unexpectedErrorKind(null)).toEqual({ errorName: 'NonError', reason: 'other' });
  });
});
