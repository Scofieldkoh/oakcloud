import { parseTemplateFields } from '@/lib/template-field-parser';
import type {
  FieldOwnerScope,
  ParsedTemplateFieldSyntax,
} from '@/lib/template-field-contract';
import {
  createA4CommandDocument,
  deleteA4Selection,
  getA4ListLevelContext,
  insertA4LineBreak,
  insertA4ManualPageBreak,
  insertA4ParagraphBreak,
  removeA4ManualPageBreak,
  type A4DeleteDirection,
  type A4ListLevelContext,
} from './a4-pagination/structural-commands';
import {
  a4PositionFromFlowPoint,
  flowBookmarkFromA4Selection,
  type A4PositionAffinity,
  type A4Selection,
} from './a4-pagination/structural-position';
import type { DocumentTransactionResult } from './a4-pagination/document-actions';
import type { FlowSelectionBookmark } from './a4-pagination/selection';

export type A4EditorSemanticCommand =
  | { type: 'insert-paragraph' }
  | { type: 'insert-line-break' }
  | { type: 'delete'; direction: A4DeleteDirection }
  | { type: 'insert-manual-break' }
  | { type: 'remove-manual-break' };

export type A4EditorSemanticCommandResult =
  | {
      status: 'applied';
      transaction: DocumentTransactionResult;
      changedNodeIds: readonly string[];
    }
  | { status: 'unchanged'; reason: string }
  | { status: 'rejected'; code: string; message: string };

function affinityForCommand(
  command: A4EditorSemanticCommand,
): A4PositionAffinity {
  if (command.type === 'delete' && command.direction === 'forward') {
    return 'before';
  }
  return 'after';
}

function structuralSelectionForFlowBookmark(
  internalHtml: string,
  bookmark: FlowSelectionBookmark,
  affinity: A4PositionAffinity,
): {
  canonical: ReturnType<typeof createA4CommandDocument>;
  selection: A4Selection;
} | null {
  const canonical = createA4CommandDocument(internalHtml);
  const collapsed = bookmark.collapsed;
  const anchor = a4PositionFromFlowPoint(
    canonical,
    bookmark.anchor,
    collapsed ? affinity : 'after',
  );
  const focus = a4PositionFromFlowPoint(
    canonical,
    bookmark.focus,
    collapsed ? affinity : 'after',
  );
  if (anchor.status === 'rejected' || focus.status === 'rejected') {
    return null;
  }
  return {
    canonical,
    selection: { anchor: anchor.position, focus: focus.position },
  };
}

/**
 * CORE C2 adapter only. SEMANTICS owns every command and structural position;
 * this bridge translates C1's compatibility FlowSelectionBookmark to the
 * frozen C02 command boundary and translates the resulting selection back.
 * It never allocates a revision or reconstructs canonical state from pages.
 */
export function runA4EditorSemanticCommand(
  internalHtml: string,
  bookmark: FlowSelectionBookmark,
  command: A4EditorSemanticCommand,
): A4EditorSemanticCommandResult {
  const structural = structuralSelectionForFlowBookmark(
    internalHtml,
    bookmark,
    affinityForCommand(command),
  );
  if (!structural) {
    return {
      status: 'rejected',
      code: 'invalid-position',
      message: 'The rendered selection no longer maps to the canonical document.',
    };
  }

  const result = (() => {
    switch (command.type) {
      case 'insert-paragraph':
        return insertA4ParagraphBreak(structural.canonical, structural.selection);
      case 'insert-line-break':
        return insertA4LineBreak(structural.canonical, structural.selection);
      case 'delete':
        return deleteA4Selection(
          structural.canonical,
          structural.selection,
          command.direction,
        );
      case 'insert-manual-break':
        return insertA4ManualPageBreak(structural.canonical, structural.selection);
      case 'remove-manual-break':
        return removeA4ManualPageBreak(structural.canonical, structural.selection);
    }
  })();

  if (result.status !== 'applied') return result;
  const selection = flowBookmarkFromA4Selection(
    result.document,
    result.selection,
  );
  if (!selection) {
    return {
      status: 'rejected',
      code: 'invalid-result-selection',
      message: 'The semantic command result could not be mapped to the C1 selection adapter.',
    };
  }

  return {
    status: 'applied',
    transaction: {
      html: result.document.internalHtml,
      selection,
      changed: true,
    },
    changedNodeIds: result.changedNodeIds,
  };
}

export function getA4EditorListContext(
  internalHtml: string,
  bookmark: FlowSelectionBookmark,
): A4ListLevelContext | null {
  const structural = structuralSelectionForFlowBookmark(
    internalHtml,
    bookmark,
    'after',
  );
  if (!structural) return null;
  return getA4ListLevelContext(
    structural.canonical,
    structural.selection.anchor,
  );
}

/**
 * F1 parser consumption hook for view-decoration/navigation. CORE exposes the
 * parser output without inventing field grammar, identity, resolution or
 * lifecycle semantics. F2 remains the owner of field mutation transactions.
 */
export function analyzeA4EditorFieldSource(
  content: string,
  scope: FieldOwnerScope,
): ParsedTemplateFieldSyntax {
  return parseTemplateFields({ content, scope });
}
