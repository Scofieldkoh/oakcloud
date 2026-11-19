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

  it('prints an error name only when it is on the fixed list; any custom name is logged as Other', () => {
    class Weird extends Error {
      constructor(name: string) {
        super('x');
        this.name = name;
      }
    }
    for (const name of ['TypeError', 'TimeoutError', 'ProtocolError', 'AbortError']) {
      expect(unexpectedErrorKind(new Weird(name)).errorName).toBe(name);
    }
    // Plain letters, so a shape check would let these through; a fixed list does not.
    for (const name of ['JaneDoe', 'Zzqx', 'AccountAcme', 'Bad name with 1980-01-01 spaces', '']) {
      const kind = unexpectedErrorKind(new Weird(name));
      expect(kind.errorName).toBe('Other');
      expect(JSON.stringify(kind)).not.toMatch(/Jane|Zzqx|Acme|1980/);
    }
  });

  it('handles values that are not errors', () => {
    expect(unexpectedErrorKind('a string')).toEqual({ errorName: 'NonError', reason: 'other' });
    expect(unexpectedErrorKind(null)).toEqual({ errorName: 'NonError', reason: 'other' });
  });
});
