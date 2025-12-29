'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Trash2,
  Save,
  X,
  AlertTriangle,
  CheckCircle,
  Edit2,
  GripVertical,
} from 'lucide-react';
import {
  useRevisionWithLineItems,
  useUpdateRevision,
  type LineItemData,
} from '@/hooks/use-processing-documents';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface LineItemEditorProps {
  documentId: string;
  revisionId: string;
  lockVersion: number;
  currency: string;
  isEditable?: boolean;
  onLineItemClick?: (lineItem: LineItemData) => void;
  className?: string;
}

interface EditingLineItem {
  id?: string;
  lineNo: number;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  gstAmount: string;
  taxCode: string;
}

const emptyLineItem = (lineNo: number): EditingLineItem => ({
  lineNo,
  description: '',
  quantity: '',
  unitPrice: '',
  amount: '0',
  gstAmount: '',
  taxCode: '',
});

export function LineItemEditor({
  documentId,
  revisionId,
  lockVersion,
  currency,
  isEditable = true,
  onLineItemClick,
  className,
}: LineItemEditorProps) {
  const { data, isLoading, error, refetch } = useRevisionWithLineItems(documentId, revisionId);
  const updateRevision = useUpdateRevision();
  const { success, error: toastError } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [editingItems, setEditingItems] = useState<EditingLineItem[]>([]);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);

  // Currency symbols mapping - SGD displayed as "S$"
  const CURRENCY_SYMBOLS: Record<string, string> = {
    SGD: 'S$',
    USD: 'US$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    HKD: 'HK$',
    AUD: 'A$',
    MYR: 'RM',
  };

  // Format currency
  const formatCurrency = useCallback(
    (amount: string | null) => {
      if (!amount) return '-';
      const num = parseFloat(amount);
      if (isNaN(num)) return '-';

      const formatted = new Intl.NumberFormat('en-SG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);

      const currCode = currency || 'SGD';
      const symbol = CURRENCY_SYMBOLS[currCode] || `${currCode} `;
      return `${symbol}${formatted}`;
    },
    [currency]
  );

  // Calculate totals
  const totals = useMemo(() => {
    const items = editMode ? editingItems : (data?.lineItems ?? []);
    const subtotal = items.reduce((sum, item) => {
      const amount = parseFloat(item.amount ?? '0');
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    const gst = items.reduce((sum, item) => {
      const amount = parseFloat(item.gstAmount ?? '0');
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    return { subtotal, gst, total: subtotal + gst };
  }, [editMode, editingItems, data?.lineItems]);

  // Enter edit mode
  const handleStartEdit = useCallback(() => {
    if (!data?.lineItems) return;
    setEditingItems(
      data.lineItems.map((item) => ({
        id: item.id,
        lineNo: item.lineNo,
        description: item.description,
        quantity: item.quantity || '',
        unitPrice: item.unitPrice || '',
        amount: item.amount,
        gstAmount: item.gstAmount || '',
        taxCode: item.taxCode || '',
      }))
    );
    setItemsToDelete([]);
    setEditMode(true);
  }, [data?.lineItems]);

  // Cancel edit mode
  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setEditingItems([]);
    setItemsToDelete([]);
  }, []);

  // Add new line item
  const handleAddItem = useCallback(() => {
    const maxLineNo = Math.max(0, ...editingItems.map((i) => i.lineNo));
    setEditingItems((prev) => [...prev, emptyLineItem(maxLineNo + 1)]);
  }, [editingItems]);

  // Update line item field
  const handleItemChange = useCallback(
    (index: number, field: keyof EditingLineItem, value: string) => {
      setEditingItems((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };

        // Auto-calculate amount if quantity and unit price are set
        if (field === 'quantity' || field === 'unitPrice') {
          const qty = parseFloat(updated[index].quantity);
          const price = parseFloat(updated[index].unitPrice);
          if (!isNaN(qty) && !isNaN(price)) {
            updated[index].amount = (qty * price).toFixed(2);
          }
        }

        return updated;
      });
    },
    []
  );

  // Delete line item
  const handleDeleteItem = useCallback((index: number) => {
    setEditingItems((prev) => {
      const item = prev[index];
      if (item.id) {
        setItemsToDelete((del) => [...del, item.id!]);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Save changes
  const handleSave = async () => {
    try {
      await updateRevision.mutateAsync({
        documentId,
        revisionId,
        lockVersion,
        data: {
          itemsToUpsert: editingItems.map((item) => ({
            id: item.id,
            lineNo: item.lineNo,
            description: item.description,
            quantity: item.quantity || undefined,
            unitPrice: item.unitPrice || undefined,
            amount: item.amount,
            gstAmount: item.gstAmount || undefined,
            taxCode: item.taxCode || undefined,
          })),
          itemsToDelete: itemsToDelete.length > 0 ? itemsToDelete : undefined,
        },
      });
      success('Line items saved successfully');
      setEditMode(false);
      setEditingItems([]);
      setItemsToDelete([]);
      refetch();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save line items');
    }
  };

  if (isLoading) {
    return (
      <div className={cn('card p-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-background-tertiary rounded w-1/4" />
          <div className="h-10 bg-background-tertiary rounded" />
          <div className="h-10 bg-background-tertiary rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('card p-4 border-status-error bg-status-error/5', className)}>
        <div className="flex items-center gap-2 text-status-error">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">Failed to load line items</span>
        </div>
      </div>
    );
  }

  const lineItems = editMode ? editingItems : (data?.lineItems ?? []);

  return (
    <div className={cn('card overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background-tertiary border-b border-border-primary">
        <h3 className="text-sm font-semibold text-text-primary">
          Line Items ({lineItems.length})
        </h3>
        {isEditable && (
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="btn-ghost btn-xs flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateRevision.isPending}
                  className="btn-primary btn-xs flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  {updateRevision.isPending ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                onClick={handleStartEdit}
                className="btn-secondary btn-xs flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background-secondary border-b border-border-primary">
            <tr>
              <th className="text-left font-medium text-text-secondary px-4 py-2 w-8">#</th>
              <th className="text-left font-medium text-text-secondary px-4 py-2">Description</th>
              <th className="text-right font-medium text-text-secondary px-4 py-2 w-20">Qty</th>
              <th className="text-right font-medium text-text-secondary px-4 py-2 w-24">Unit Price</th>
              <th className="text-right font-medium text-text-secondary px-4 py-2 w-24">Amount</th>
              <th className="text-right font-medium text-text-secondary px-4 py-2 w-24">GST</th>
              {editMode && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 ? (
              <tr>
                <td colSpan={editMode ? 7 : 6} className="px-4 py-8 text-center text-text-muted">
                  No line items
                </td>
              </tr>
            ) : (
              lineItems.map((item, index) => (
                <tr
                  key={editMode ? index : item.id}
                  className={cn(
                    'border-b border-border-primary',
                    !editMode && onLineItemClick && 'cursor-pointer hover:bg-background-tertiary'
                  )}
                  onClick={() => !editMode && onLineItemClick?.(item as LineItemData)}
                >
                  <td className="px-4 py-2 text-text-muted">
                    {editMode ? (
                      <GripVertical className="w-4 h-4 text-text-muted" />
                    ) : (
                      item.lineNo
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editMode ? (
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        className="input input-sm w-full"
                        placeholder="Description"
                      />
                    ) : (
                      <span className="text-text-primary">{item.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        value={item.quantity ?? ''}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        className="input input-sm w-full text-right"
                        placeholder="0"
                        step="any"
                      />
                    ) : (
                      <span className="text-text-primary font-mono">
                        {item.quantity || '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        value={item.unitPrice ?? ''}
                        onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                        className="input input-sm w-full text-right"
                        placeholder="0.00"
                        step="0.01"
                      />
                    ) : (
                      <span className="text-text-primary font-mono">
                        {item.unitPrice ? formatCurrency(item.unitPrice) : '-'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        value={item.amount ?? ''}
                        onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                        className="input input-sm w-full text-right"
                        placeholder="0.00"
                        step="0.01"
                      />
                    ) : (
                      <span className="text-text-primary font-mono">
                        {formatCurrency(item.amount)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        value={item.gstAmount ?? ''}
                        onChange={(e) => handleItemChange(index, 'gstAmount', e.target.value)}
                        className="input input-sm w-full text-right"
                        placeholder="0.00"
                        step="0.01"
                      />
                    ) : (
                      <span className="text-text-muted font-mono">
                        {item.gstAmount ? formatCurrency(item.gstAmount) : '-'}
                      </span>
                    )}
                  </td>
                  {editMode && (
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handleDeleteItem(index)}
                        className="btn-ghost btn-xs p-1 text-status-error hover:bg-status-error/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add item button */}
      {editMode && (
        <div className="px-4 py-2 border-b border-border-primary">
          <button
            onClick={handleAddItem}
            className="btn-ghost btn-xs w-full flex items-center justify-center gap-1 text-oak-light hover:text-oak-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Line Item
          </button>
        </div>
      )}

      {/* Totals */}
      <div className="px-4 py-3 bg-background-tertiary">
        <div className="flex justify-end gap-8 text-sm">
          <div className="text-right">
            <p className="text-text-muted">Subtotal</p>
            <p className="font-mono font-medium text-text-primary">
              {formatCurrency(totals.subtotal.toFixed(2))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-text-muted">GST</p>
            <p className="font-mono font-medium text-text-primary">
              {formatCurrency(totals.gst.toFixed(2))}
            </p>
          </div>
          <div className="text-right">
            <p className="text-text-muted">Total</p>
            <p className="font-mono font-semibold text-text-primary text-base">
              {formatCurrency(totals.total.toFixed(2))}
            </p>
          </div>
        </div>
      </div>

      {/* Validation status */}
      {data?.validationStatus && (
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2 border-t border-border-primary text-sm',
            data.validationStatus === 'VALID'
              ? 'bg-status-success/5 text-status-success'
              : data.validationStatus === 'INVALID'
              ? 'bg-status-error/5 text-status-error'
              : 'bg-status-warning/5 text-status-warning'
          )}
        >
          {data.validationStatus === 'VALID' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span>
            {data.validationStatus === 'VALID'
              ? 'All validations passed'
              : data.validationStatus === 'WARNINGS'
              ? 'Has validation warnings'
              : 'Has validation errors'}
          </span>
        </div>
      )}
    </div>
  );
}
