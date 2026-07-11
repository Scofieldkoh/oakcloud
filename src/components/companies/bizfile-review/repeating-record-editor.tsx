'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Trash2, Undo2 } from 'lucide-react';

export interface RepeatingRecordEditorProps<T> {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  duplicateItem: (item: T) => T;
  getItemKey: (item: T, index: number) => React.Key;
  getItemLabel: (item: T, index: number) => string;
  renderItem: (item: T, index: number, update: (next: T) => void) => React.ReactNode;
}

interface RemovedItem<T> { item: T; index: number; label: string }

const actionClassName = 'inline-flex h-8 items-center gap-1 rounded-md border border-border-primary px-2 text-xs text-text-secondary hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-oak-primary/30';

export function RepeatingRecordEditor<T>({ title, items, onChange, createItem, duplicateItem, getItemKey, getItemLabel, renderItem }: RepeatingRecordEditorProps<T>) {
  const [removed, setRemoved] = useState<RemovedItem<T> | null>(null);
  const [focusKey, setFocusKey] = useState<React.Key | null>(null);
  const rowRefs = useRef(new Map<React.Key, HTMLDivElement>());

  useEffect(() => {
    if (focusKey === null) return;
    const row = rowRefs.current.get(focusKey);
    if (!row) return;
    const controls = row.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, a[href], [contenteditable="true"], [tabindex]',
    );
    for (const control of controls) {
      if (control.matches(':disabled, [aria-disabled="true"], [inert], [tabindex="-1"]')) continue;
      control.focus();
      if (document.activeElement === control) break;
    }
    setFocusKey(null);
  }, [focusKey, items]);

  const add = () => {
    const item = createItem();
    onChange([...items, item]);
    setFocusKey(getItemKey(item, items.length));
  };

  const duplicate = (item: T, index: number) => {
    const copy = duplicateItem(item);
    const next = [...items];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setFocusKey(getItemKey(copy, index + 1));
  };

  const remove = (item: T, index: number, label: string) => {
    setRemoved({ item, index, label });
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  const undo = () => {
    if (!removed) return;
    const next = [...items];
    next.splice(Math.min(removed.index, next.length), 0, removed.item);
    onChange(next);
    setRemoved(null);
  };

  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <div className="flex items-center gap-2">
          {removed && <button type="button" onClick={undo} aria-label={`Undo remove ${removed.label}`} className={actionClassName}><Undo2 aria-hidden="true" className="h-3.5 w-3.5" />Undo</button>}
          <button type="button" onClick={add} aria-label={`Add ${title}`} className={actionClassName}><Plus aria-hidden="true" className="h-3.5 w-3.5" />Add</button>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => {
          const key = getItemKey(item, index);
          const label = getItemLabel(item, index);
          return (
            <div key={key} className="rounded-md border border-border-primary bg-background-secondary p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">{label}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => duplicate(item, index)} aria-label={`Duplicate ${label}`} className={actionClassName}><Copy aria-hidden="true" className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => remove(item, index, label)} aria-label={`Remove ${label}`} className={actionClassName}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div ref={(node) => {
                if (node) rowRefs.current.set(key, node);
                else rowRefs.current.delete(key);
              }}>
                {renderItem(item, index, (next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current)))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
