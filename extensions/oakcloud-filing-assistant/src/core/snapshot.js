/*
 * OakCloud Filing Assistant: value-free screen snapshots. A snapshot describes a screen's structure
 * (fields, their labels and types, sections, buttons) with references such as "f3" and "a1". It never
 * contains what is typed in a field, only whether something is. Snapshots are what AI sees, and their
 * fingerprints are how the assistant notices that Bizfile changed a screen.
 * Defines globalThis.OakSnapshot; needs OakDom and OakLocator.
 */
(function (root) {
  'use strict';
  const D = root.OakDom;
  const L = root.OakLocator;

  const MAX_FIELDS = 200;
  const MAX_ACTIONS = 60;

  function hasValue(el, kind) {
    if (kind === 'radio' || kind === 'checkbox') return el.checked === true || el.getAttribute('aria-checked') === 'true';
    if (el.tagName === 'SELECT') return el.selectedIndex > 0 || Boolean(el.value);
    if ('value' in el && typeof el.value === 'string') return el.value.trim() !== '';
    return D.clean(el.textContent) !== '';
  }

  function choiceUsable(el) {
    return D.isVisible(el) || Boolean(el.closest('label') && D.isVisible(el.closest('label'))) || Boolean(el.labels && el.labels[0] && D.isVisible(el.labels[0]));
  }

  /** Returns { snapshot, registry } where registry maps references to elements on this page. */
  function take(doc) {
    const registry = new Map();
    const fields = [];
    const groups = new Map();
    const elements = D.deepQueryAll(doc, D.FIELD_SELECTOR);
    for (const el of elements) {
      if (fields.length >= MAX_FIELDS) break;
      const kind = D.detectKind(el);
      const isChoice = kind === 'radio' || kind === 'checkbox';
      if (isChoice ? !choiceUsable(el) : !D.isVisible(el)) continue;
      const group = D.groupName(el);
      const optionLabel = D.labelInfo(el).name;
      if (isChoice && group) {
        const container = el.closest('[role=radiogroup],fieldset,[role=group]') || el.parentElement;
        const existing = groups.get(container);
        if (existing) {
          existing.options.push(optionLabel);
          existing.hasValue = existing.hasValue || hasValue(el, kind);
          continue;
        }
      }
      const ref = 'f' + (fields.length + 1);
      const info = D.labelInfo(el);
      const field = {
        ref,
        kind,
        tag: el.tagName.toLowerCase(),
        type: D.clean(el.getAttribute('type')),
        label: isChoice && group ? group : info.name,
        labelSource: isChoice && group ? 'group' : info.source,
        group,
        section: L.sectionOf(el),
        placeholder: D.clean(el.getAttribute('placeholder')),
        required: el.required === true || el.getAttribute('aria-required') === 'true',
        hasValue: hasValue(el, kind),
      };
      if (isChoice && group) {
        field.options = [optionLabel];
        groups.set(el.closest('[role=radiogroup],fieldset,[role=group]') || el.parentElement, field);
      }
      if (el.tagName === 'SELECT') {
        field.options = Array.from(el.options)
          .map((option) => D.clean(option.textContent))
          .filter(Boolean)
          .slice(0, 60);
      }
      registry.set(ref, el);
      fields.push(field);
    }

    const actions = [];
    for (const el of D.deepQueryAll(doc, D.ACTION_SELECTOR)) {
      if (actions.length >= MAX_ACTIONS) break;
      if (!D.isVisible(el)) continue;
      const label = D.actionLabel(el);
      if (!label) continue;
      const ref = 'a' + (actions.length + 1);
      registry.set(ref, el);
      actions.push({ ref, label, section: L.sectionOf(el), allowed: !D.actionBlockReason(el) });
    }

    const headings = Array.from(doc.querySelectorAll('h1,h2,h3'))
      .filter((el) => D.isVisible(el))
      .map((el) => D.clean(D.labelText(el), 100))
      .filter(Boolean)
      .slice(0, 30);

    const snapshot = {
      path: doc.location ? doc.location.pathname : '',
      title: D.clean(doc.title),
      headings,
      fields,
      actions,
    };
    snapshot.fingerprint = fingerprint(snapshot);
    return { snapshot, registry };
  }

  function fingerprint(snapshot) {
    const unique = (values) => Array.from(new Set(values.filter(Boolean))).sort();
    return {
      path: snapshot.path,
      headings: unique(snapshot.headings),
      labels: unique(snapshot.fields.map((field) => field.label || field.placeholder)),
    };
  }

  /** What changed between a stored fingerprint and the screen now. */
  function compare(before, after) {
    if (!before) return { changed: false, added: [], removed: [], pathChanged: false };
    const added = after.labels.filter((label) => !before.labels.includes(label));
    const removed = before.labels.filter((label) => !after.labels.includes(label));
    const pathChanged = before.path !== after.path;
    return { changed: pathChanged || added.length > 0 || removed.length > 0, added, removed, pathChanged };
  }

  root.OakSnapshot = { take, fingerprint, compare };
})(globalThis);
