'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Plus, Trash2, Undo2 } from 'lucide-react';

export interface RepeatingRecordEditorProps<T> {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  createItem: () => T;
  getItemLabel: (item: T, index: number) => string;
  renderItem: (item: T, index: number, update: (next: T) => void) => React.ReactNode;
}

interface RemovedItem<T> { item: T; index: number; label: string }

const actionClassName = 'inline-flex h-8 items-center gap-1 rounded-md border border-border-primary px-2 text-xs text-text-secondary hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-oak-primary/30';

export function RepeatingRecordEditor<T>({ title, items, onChange, createItem, getItemLabel, renderItem }: RepeatingRecordEditorProps<T>) {
  const [removed, setRemoved] = useState<RemovedItem<T> | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (focusIndex === null || focusIndex >= items.length) return;
    rowRefs.current[focusIndex]?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')?.focus();
    setFocusIndex(null);
  }, [focusIndex, items.length]);

  const add = () => {
    onChange([...items, createItem()]);
    setFocusIndex(items.length);
  };

  const duplicate = (item: T, index: number) => {
    const next = [...items];
    next.splice(index + 1, 0, item);
    onChange(next);
    setFocusIndex(index + 1);
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
          const label = getItemLabel(item, index);
          return (
            <div key={index} className="rounded-md border border-border-primary bg-background-secondary p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-secondary">{label}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => duplicate(item, index)} aria-label={`Duplicate ${label}`} className={actionClassName}><Copy aria-hidden="true" className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => remove(item, index, label)} aria-label={`Remove ${label}`} className={actionClassName}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div ref={(node) => { rowRefs.current[index] = node; }}>
                {renderItem(item, index, (next) => onChange(items.map((current, itemIndex) => itemIndex === index ? next : current)))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
