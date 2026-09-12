import { describe, expect, it } from 'vitest';

import {
  loadLosslessStoredFieldDefinition,
  type FieldOwnerScope,
} from '@/lib/template-field-contract';
import { applyFieldLifecycleTransaction } from '@/lib/template-field-lifecycle';

const TEMPLATE_SCOPE: FieldOwnerScope = { kind: 'template', id: 'linking-template' };
const PARTIAL_SCOPE: FieldOwnerScope = { kind: 'partial', id: 'linking-partial' };

describe('FIELDS F2 scoped linking migration', () => {
  it('migrates same-scope key links and explicit identity links without rewriting a same-named foreign-scope link', () => {
    const target = loadLosslessStoredFieldDefinition({
      scope: TEMPLATE_SCOPE,
      definition: {
        id: 'target-field', key: 'custom.note', path: 'custom.note', label: 'Note', type: 'text',
      },
    });
    const sameScopeKeyLink = loadLosslessStoredFieldDefinition({
      scope: TEMPLATE_SCOPE,
      definition: {
        id: 'same-scope-link', key: 'custom.same', label: 'Same', type: 'text', linkedTo: 'custom.note',
      },
    });
    const explicitIdentityLink = loadLosslessStoredFieldDefinition({
      scope: PARTIAL_SCOPE,
      definition: {
        id: 'explicit-link', key: 'custom.explicit', label: 'Explicit', type: 'text', linkedTo: target.identity,
      },
    });
    const foreignSameNamedLink = loadLosslessStoredFieldDefinition({
      scope: PARTIAL_SCOPE,
      definition: {
        id: 'foreign-key-link', key: 'custom.foreign', label: 'Foreign', type: 'text', linkedTo: 'custom.note',
      },
    });

    const result = applyFieldLifecycleTransaction({
      scope: TEMPLATE_SCOPE,
      snapshot: {
        content: '<p>{{custom.note}}</p>',
        definitions: [target, sameScopeKeyLink, explicitIdentityLink, foreignSameNamedLink],
        dependentMetadata: {},
      },
      intent: { kind: 'migrate-key', identity: target.identity, nextKey: 'custom.memo' },
    });

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    const byId = new Map(result.transaction.after.definitions.map((item) => [item.persistedId, item]));
    expect(byId.get('same-scope-link')?.linkedTo).toBe('custom.memo');
    expect(byId.get('explicit-link')?.linkedTo).toBe(target.identity);
    expect(byId.get('foreign-key-link')?.linkedTo).toBe('custom.note');
    expect(result.transaction.after.content).toBe('<p>{{custom.memo}}</p>');
  });
});
