/*
 * OakCloud Bizfile input probe: DOM logic shared by the content script and the tests.
 *
 * A classic script (content scripts cannot be modules). It defines globalThis.OakProbe.
 * Nothing here talks to the network or operates buttons or links.
 */
(function (root) {
  'use strict';

  const FIELD_SELECTOR = [
    'input:not([type=hidden])',
    'select',
    'textarea',
    '[role=combobox]',
    '[role=textbox]',
    '[role=searchbox]',
    '[role=radio]',
    '[role=checkbox]',
    '[role=switch]',
    '[role=spinbutton]',
    '[contenteditable=""]',
    '[contenteditable=true]',
  ].join(',');

  const ACTION_SELECTOR = [
    'button',
    'a[href]',
    'input[type=submit]',
    'input[type=button]',
    'input[type=reset]',
    'input[type=image]',
    '[role=button]',
    '[role=link]',
    '[role=menuitem]',
    '[role=tab]',
  ].join(',');

  /** Names that suggest a declaration, filing, payment or step change. The probe never touches these. */
  const FORBIDDEN_NAME = /\b(submit\w*|declar\w*|pay(ment)?\w*|confirm\w*|lodg\w*|proceed\w*|next|save\w*|delete\w*|remove\w*|withdraw\w*|cancel\w*|sign\s*out|log\s*out|logout|agree\w*|acknowledg\w*|undertak\w*|certif\w*|consent\w*|attest\w*)\b/i;

  const STRATEGIES = {
    text: ['set-value-events', 'insert-text-command', 'key-by-key'],
    date: ['set-value-events', 'insert-text-command', 'key-by-key'],
    'native-select': ['set-value-events'],
    combobox: ['pointer', 'click', 'keyboard'],
    typeahead: [
      'insert-text-command+pointer',
      'set-value-events+pointer',
      'key-by-key+pointer',
      'insert-text-command+keyboard',
    ],
    radio: ['click', 'pointer', 'label-click', 'keyboard'],
    checkbox: ['click', 'pointer', 'label-click', 'keyboard'],
  };

  const KINDS = Object.keys(STRATEGIES);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function clean(value, max = 120) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function textOf(node) {
    return node ? clean(node.textContent, 200) : '';
  }

  function viewOf(el) {
    return el.ownerDocument.defaultView;
  }

  function lookupById(el, id) {
    const rootNode = el.getRootNode();
    return (rootNode.getElementById && rootNode.getElementById(id)) || el.ownerDocument.getElementById(id);
  }

  /** The closest short text before the field, used only when the field has no programmatic label. */
  function nearbyText(el) {
    let node = el;
    for (let depth = 0; depth < 4 && node && node.parentElement; depth++) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        const text = textOf(sibling);
        if (text && text.length <= 100 && !sibling.matches(FIELD_SELECTOR)) return text;
        sibling = sibling.previousElementSibling;
      }
      node = node.parentElement;
    }
    return '';
  }

  /**
   * A simplified accessible name, with where it came from. The source matters for mapping Bizfile:
   * fields named only by nearby text cannot be found reliably by role and name.
   */
  function labelInfo(el) {
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => textOf(lookupById(el, id)))
        .filter(Boolean)
        .join(' ');
      if (text) return { name: clean(text), source: 'aria-labelledby' };
    }
    const aria = clean(el.getAttribute('aria-label'));
    if (aria) return { name: aria, source: 'aria-label' };
    if (el.labels && el.labels.length) {
      const text = Array.from(el.labels).map(textOf).filter(Boolean).join(' ');
      if (text) return { name: clean(text), source: 'label' };
    }
    const wrapping = el.closest('label');
    if (wrapping && textOf(wrapping)) return { name: clean(textOf(wrapping)), source: 'label' };
    const title = clean(el.getAttribute('title'));
    if (title) return { name: title, source: 'title' };
    const placeholder = clean(el.getAttribute('placeholder'));
    if (placeholder) return { name: placeholder, source: 'placeholder' };
    const nearby = nearbyText(el);
    if (nearby) return { name: clean(nearby), source: 'nearby-text' };
    return { name: '', source: 'none' };
  }

  /** The question a radio or checkbox belongs to. */
  function groupName(el) {
    const group = el.closest('[role=radiogroup],[role=group],fieldset');
    if (!group) return '';
    const legend = group.matches('fieldset') ? group.querySelector(':scope > legend') : null;
    if (legend) return textOf(legend);
    return labelInfo(group).name;
  }

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    const style = viewOf(el).getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function isEditable(el) {
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    return (tag === 'input' || tag === 'textarea') && !el.readOnly && !el.disabled;
  }

  function looksLikeDate(el) {
    const hints = [el.getAttribute('placeholder'), el.getAttribute('name'), el.id, el.className && String(el.className)]
      .filter(Boolean)
      .join(' ');
    return /\b(dd|mm)[/.-](mm|dd)[/.-]yy(yy)?\b|date|datepicker|calendar/i.test(hints);
  }

  function detectKind(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'select') return 'native-select';
    if (type === 'radio' || role === 'radio') return 'radio';
    if (type === 'checkbox' || role === 'checkbox' || role === 'switch') return 'checkbox';
    if (role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
      return isEditable(el) ? 'typeahead' : 'combobox';
    }
    if (tag === 'input' && el.getAttribute('aria-autocomplete') && el.getAttribute('aria-autocomplete') !== 'none') {
      return 'typeahead';
    }
    if (type === 'date' || looksLikeDate(el)) return 'date';
    if (tag === 'textarea' || tag === 'input' || role === 'textbox' || role === 'searchbox' || el.isContentEditable) {
      return 'text';
    }
    return 'combobox';
  }

  /** The form field behind a clicked element, or null when nothing sensible was clicked. */
  function resolveField(start) {
    if (!start || start.nodeType !== 1) return null;
    const label = start.closest('label');
    if (label && label.control) return label.control;
    const field = start.closest(FIELD_SELECTOR);
    if (field) return field;
    if (start.closest(ACTION_SELECTOR)) return start.closest(ACTION_SELECTOR);
    // A custom dropdown's visible box often wraps the real combobox element.
    const inner = start.querySelectorAll(FIELD_SELECTOR);
    if (inner.length === 1) return inner[0];
    return null;
  }

  /** Why the probe refuses to operate an element, or null when it may. */
  function blockReason(el) {
    if (!el || el.nodeType !== 1) return 'Not a form field.';
    if (el.matches(ACTION_SELECTOR)) return 'Buttons, links and tabs are never operated by the probe.';
    if (el.closest('button,a[href],[role=button],[role=link]')) return 'The field is inside a button or link.';
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password') return 'Password fields are never touched.';
    if (type === 'file') return 'File uploads are out of scope for this POC.';
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return 'The field is disabled.';
    const names = [labelInfo(el).name, groupName(el)].filter(Boolean);
    const forbidden = names.find((name) => FORBIDDEN_NAME.test(name));
    if (forbidden) return 'The field "' + clean(forbidden, 80) + '" looks like a declaration, filing or step control.';
    return null;
  }

  /**
   * Text shown in the box of a dropdown, where the chosen option usually appears. Open option lists
   * are left out, and so is any wrapper large enough to hold other fields, so an option name
   * elsewhere on the page cannot pass for the chosen value.
   */
  function displayText(el) {
    const kind = detectKind(el);
    if (kind !== 'combobox' && kind !== 'typeahead' && kind !== 'native-select') return '';
    const candidates = [
      el,
      el.closest('[class*=select i],[class*=dropdown i],[class*=combobox i],[class*=autocomplete i]'),
      el.parentElement,
    ];
    for (const candidate of candidates) {
      if (!candidate || candidate.matches('form,fieldset,body')) continue;
      if (candidate !== el && candidate.querySelectorAll(FIELD_SELECTOR).length > 1) continue;
      const copy = candidate.cloneNode(true);
      copy.querySelectorAll('[role=listbox],[role=option],option').forEach((node) => node.remove());
      const text = clean(copy.textContent, 200);
      if (text && text.length <= 150) return text;
    }
    return '';
  }

  function errorText(el) {
    const ids = [el.getAttribute('aria-describedby'), el.getAttribute('aria-errormessage')]
      .filter(Boolean)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
    const texts = ids.map((id) => textOf(lookupById(el, id)));
    let container = el.parentElement;
    for (let depth = 0; depth < 3 && container && container.parentElement; depth++) container = container.parentElement;
    if (container) {
      container
        .querySelectorAll('[role=alert],[class*=error i],[class*=invalid-feedback i],[class*=helper-text i][class*=invalid i]')
        .forEach((node) => {
          if (isVisible(node)) texts.push(textOf(node));
        });
    }
    return clean(Array.from(new Set(texts.filter(Boolean))).join(' | '), 200);
  }

  function readState(el) {
    const tag = el.tagName.toLowerCase();
    const state = { connected: el.isConnected };
    if (!el.isConnected) return state;
    if (tag === 'select') {
      state.value = el.selectedIndex >= 0 ? clean(el.options[el.selectedIndex].textContent) : '';
    } else if (tag === 'input' || tag === 'textarea') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'radio' || type === 'checkbox') state.checked = el.checked;
      else state.value = el.value;
    } else if (el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'switch') {
      state.checked = el.getAttribute('aria-checked') === 'true';
    } else {
      state.value = clean(el.textContent, 200);
    }
    state.display = displayText(el);
    state.ariaInvalid = el.getAttribute('aria-invalid');
    state.ariaExpanded = el.getAttribute('aria-expanded');
    state.errorText = errorText(el);
    state.angularClasses = Array.from(el.classList).filter((name) => /^ng-(dirty|pristine|touched|untouched|valid|invalid)$/.test(name));
    return state;
  }

  /** A record that lets the field be found again after Bizfile re-renders it or the user changes step. */
  function describe(el) {
    const info = labelInfo(el);
    return {
      tag: el.tagName.toLowerCase(),
      type: clean(el.getAttribute('type')),
      role: clean(el.getAttribute('role')),
      id: clean(el.id, 200),
      name: clean(el.getAttribute('name'), 200),
      label: info.name,
      labelSource: info.source,
      group: groupName(el),
      inShadowRoot: el.getRootNode() !== el.ownerDocument,
      required: el.required === true || el.getAttribute('aria-required') === 'true',
      readOnly: el.readOnly === true || el.getAttribute('aria-readonly') === 'true',
    };
  }

  /** Every element matching the selector in the document and its open shadow roots. */
  function deepQueryAll(doc, selector) {
    const found = [];
    const visit = (scope) => {
      scope.querySelectorAll(selector).forEach((el) => found.push(el));
      scope.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) visit(el.shadowRoot);
      });
    };
    visit(doc);
    return found;
  }

  function relocate(doc, descriptor) {
    if (descriptor.id) {
      const byId = doc.getElementById(descriptor.id);
      if (byId) return byId;
    }
    const candidates = deepQueryAll(doc, FIELD_SELECTOR).filter((el) => el.tagName.toLowerCase() === descriptor.tag);
    const byName = descriptor.name ? candidates.filter((el) => el.getAttribute('name') === descriptor.name) : [];
    if (byName.length === 1) return byName[0];
    const byLabel = candidates.filter(
      (el) => labelInfo(el).name === descriptor.label && groupName(el) === descriptor.group && clean(el.getAttribute('type')) === descriptor.type,
    );
    return byLabel.length === 1 ? byLabel[0] : null;
  }

  // ---- Event helpers -------------------------------------------------------------------------

  function valueSetter(el) {
    const view = viewOf(el);
    const proto =
      el instanceof view.HTMLTextAreaElement
        ? view.HTMLTextAreaElement.prototype
        : el instanceof view.HTMLSelectElement
          ? view.HTMLSelectElement.prototype
          : view.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    return (value) => setter.call(el, value);
  }

  function fire(el, event) {
    return el.dispatchEvent(event);
  }

  function inputEvent(el, inputType, data) {
    const view = viewOf(el);
    const Ctor = view.InputEvent || view.Event;
    return new Ctor('input', { bubbles: true, composed: true, inputType, data });
  }

  function keyboardEvent(el, type, key) {
    const view = viewOf(el);
    const code = /^[0-9]$/.test(key) ? 'Digit' + key : /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key === ' ' ? 'Space' : key;
    return new view.KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, composed: true });
  }

  function pressKey(el, key) {
    fire(el, keyboardEvent(el, 'keydown', key));
    fire(el, keyboardEvent(el, 'keyup', key));
  }

  /** A mouse click as a browser sends it, aimed at whatever is drawn at the element's centre. */
  function pointerClick(el) {
    const view = viewOf(el);
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = el.ownerDocument.elementFromPoint ? el.ownerDocument.elementFromPoint(x, y) : null;
    const target = hit && (hit === el || el.contains(hit)) ? hit : el;
    const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view, button: 0 };
    const Pointer = view.PointerEvent || view.MouseEvent;
    const pointer = (type, buttons) => new Pointer(type, { ...base, buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    fire(target, pointer('pointerover', 0));
    fire(target, new view.MouseEvent('mouseover', { ...base, buttons: 0 }));
    const downAllowed = fire(target, pointer('pointerdown', 1)) && fire(target, new view.MouseEvent('mousedown', { ...base, buttons: 1 }));
    if (downAllowed && typeof el.focus === 'function') el.focus();
    fire(target, pointer('pointerup', 0));
    fire(target, new view.MouseEvent('mouseup', { ...base, buttons: 0 }));
    fire(target, new view.MouseEvent('click', { ...base, buttons: 0, detail: 1 }));
  }

  // ---- Fill methods --------------------------------------------------------------------------

  function selectAllText(el) {
    if (el.isContentEditable) {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      const selection = viewOf(el).getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (typeof el.select === 'function') {
      el.select();
    }
  }

  const textMethods = {
    'set-value-events': async (el, value) => {
      el.focus();
      const set = valueSetter(el);
      set('');
      set(value);
      fire(el, inputEvent(el, 'insertText', value));
      fire(el, new (viewOf(el).Event)('change', { bubbles: true }));
      return 'Set the value directly, then sent input and change events.';
    },
    'insert-text-command': async (el, value) => {
      el.focus();
      selectAllText(el);
      const doc = el.ownerDocument;
      const ok = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, value);
      if (!ok) throw new Error('The browser refused the insert-text command for this field.');
      return 'Inserted the text with the browser editing command (input events marked as genuine).';
    },
    'key-by-key': async (el, value) => {
      el.focus();
      const set = valueSetter(el);
      set('');
      fire(el, inputEvent(el, 'deleteContentBackward', null));
      let typed = 0;
      for (const char of value) {
        const down = fire(el, keyboardEvent(el, 'keydown', char));
        fire(el, keyboardEvent(el, 'keypress', char));
        const view = viewOf(el);
        const before = view.InputEvent
          ? fire(el, new view.InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: char }))
          : true;
        if (down && before) {
          set(el.value + char);
          fire(el, inputEvent(el, 'insertText', char));
          typed++;
        }
        fire(el, keyboardEvent(el, 'keyup', char));
        await sleep(15);
      }
      fire(el, new (viewOf(el).Event)('change', { bubbles: true }));
      return 'Typed ' + typed + ' of ' + value.length + ' characters as separate key events.';
    },
  };

  function normalise(text) {
    return clean(text, 200).toLowerCase();
  }

  /** Visible options that may belong to the open dropdown, newest library patterns included. */
  function visibleOptions(el) {
    const doc = el.ownerDocument;
    const scopes = [];
    ['aria-controls', 'aria-owns'].forEach((attribute) => {
      (el.getAttribute(attribute) || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach((id) => {
          const listbox = lookupById(el, id);
          if (listbox) scopes.push(listbox);
        });
    });
    const selector =
      '[role=option],.ng-option,.mat-mdc-option,.mat-option,.ant-select-item-option,.p-dropdown-item,.p-autocomplete-item,.select__option,[class*=react-select][class*=option],[cmdk-item],[data-radix-collection-item]';
    const pools = scopes.length ? scopes : [doc];
    const found = [];
    pools.forEach((scope) => scope.querySelectorAll(selector).forEach((option) => found.push(option)));
    return found.filter((option) => isVisible(option) && option !== el && !el.contains(option));
  }

  async function waitForOption(el, optionText, addedNodes, timeoutMs) {
    const wanted = normalise(optionText);
    const deadline = Date.now() + timeoutMs;
    let seen = [];
    while (Date.now() < deadline) {
      seen = visibleOptions(el);
      if (!seen.length) {
        // Fallback for dropdowns without option roles: elements added since opening with the exact text.
        seen = addedNodes()
          .filter((node) => node.nodeType === 1 && isVisible(node))
          .flatMap((node) => [node, ...node.querySelectorAll('*')])
          .filter((node) => isVisible(node) && node.children.length === 0 && textOf(node));
      }
      const matches = seen.filter((option) => normalise(option.textContent) === wanted);
      if (matches.length === 1) return { option: matches[0], seen };
      if (matches.length > 1) throw new Error('More than one option is exactly "' + optionText + '".');
      await sleep(100);
    }
    const listed = Array.from(new Set(seen.map((option) => textOf(option)).filter(Boolean))).slice(0, 15);
    throw new Error(
      listed.length
        ? 'No option is exactly "' + optionText + '". Options seen: ' + listed.join('; ')
        : 'No dropdown options appeared after opening the field.',
    );
  }

  function watchAdditions(doc) {
    const added = [];
    const observer = new (doc.defaultView.MutationObserver)((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => added.push(node)));
    });
    observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    return { added: () => added, stop: () => observer.disconnect() };
  }

  function assertOptionAllowed(option) {
    if (option.closest(ACTION_SELECTOR) && !option.matches('[role=option]')) {
      throw new Error('The matching option is a button or link, so the probe will not click it.');
    }
    if (FORBIDDEN_NAME.test(textOf(option))) throw new Error('The option text looks like a filing or step control.');
  }

  async function chooseByKeyboard(el, optionText) {
    const wanted = normalise(optionText);
    for (let step = 0; step < 60; step++) {
      pressKey(el, 'ArrowDown');
      await sleep(40);
      const activeId = el.getAttribute('aria-activedescendant');
      const active = activeId ? lookupById(el, activeId) : null;
      const highlighted = active || visibleOptions(el).find((option) => /active|focused|highlight/i.test(String(option.className)) || option.getAttribute('aria-selected') === 'true');
      if (highlighted && normalise(highlighted.textContent) === wanted) {
        pressKey(el, 'Enter');
        return 'Moved with the arrow keys to the option and pressed Enter.';
      }
    }
    throw new Error('Arrow keys did not reach an option exactly "' + optionText + '".');
  }

  async function openAndChoose(el, openMethod, optionText) {
    const watcher = watchAdditions(el.ownerDocument);
    try {
      if (openMethod === 'keyboard') {
        el.focus();
        return await chooseByKeyboard(el, optionText);
      }
      if (openMethod === 'pointer') pointerClick(el);
      else el.click();
      const { option } = await waitForOption(el, optionText, watcher.added, 2000);
      assertOptionAllowed(option);
      if (openMethod === 'pointer') pointerClick(option);
      else option.click();
      return 'Opened the dropdown and chose the option by ' + (openMethod === 'pointer' ? 'full mouse events.' : 'element click().');
    } finally {
      watcher.stop();
    }
  }

  async function typeAndChoose(el, strategy, value, optionText) {
    const [typeMethod, chooseMethod] = strategy.split('+');
    const watcher = watchAdditions(el.ownerDocument);
    try {
      const typed = await textMethods[typeMethod](el, value);
      if (chooseMethod === 'keyboard') return typed + ' ' + (await chooseByKeyboard(el, optionText));
      const { option } = await waitForOption(el, optionText, watcher.added, 3000);
      assertOptionAllowed(option);
      pointerClick(option);
      return typed + ' Chose the suggestion by full mouse events.';
    } finally {
      watcher.stop();
    }
  }

  async function toggle(el, strategy) {
    if (strategy === 'click') {
      el.click();
      return 'Called element click().';
    }
    if (strategy === 'pointer') {
      pointerClick(isVisible(el) ? el : el.closest('label') || el);
      return 'Sent full mouse events to the control.';
    }
    if (strategy === 'label-click') {
      const label = (el.labels && el.labels[0]) || el.closest('label') || (el.id && el.ownerDocument.querySelector('[for="' + el.id + '"]'));
      if (!label) throw new Error('The control has no label to click.');
      pointerClick(label);
      return 'Sent full mouse events to the label.';
    }
    el.focus();
    pressKey(el, ' ');
    return 'Focused the control and pressed Space.';
  }

  function chooseNativeOption(el, optionText) {
    const wanted = normalise(optionText);
    const options = Array.from(el.options).filter((option) => normalise(option.textContent) === wanted);
    if (options.length !== 1) throw new Error(options.length ? 'More than one option matches.' : 'No option is exactly "' + optionText + '".');
    el.focus();
    valueSetter(el)(options[0].value);
    fire(el, new (viewOf(el).Event)('input', { bubbles: true }));
    fire(el, new (viewOf(el).Event)('change', { bubbles: true }));
    return 'Set the selected option directly, then sent input and change events.';
  }

  /** Runs one fill method. Value is the text to type; optionText is the option to choose, when relevant. */
  async function applyStrategy(el, kind, strategy, value, optionText) {
    if (!STRATEGIES[kind] || !STRATEGIES[kind].includes(strategy)) throw new Error('Unknown method ' + strategy + ' for ' + kind + '.');
    if (kind === 'text' || kind === 'date') return textMethods[strategy](el, value);
    if (kind === 'native-select') return chooseNativeOption(el, optionText || value);
    if (kind === 'combobox') return openAndChoose(el, strategy, optionText || value);
    if (kind === 'typeahead') return typeAndChoose(el, strategy, value, optionText || value);
    return toggle(el, strategy);
  }

  // ---- Verdicts ------------------------------------------------------------------------------

  function digits(text) {
    return String(text || '').replace(/\D/g, '');
  }

  function shownValueMatches(kind, state, expected) {
    if (!state.connected) return false;
    if (kind === 'radio' || kind === 'checkbox') return state.checked === true;
    const wanted = normalise(expected);
    const value = normalise(state.value);
    if (value === wanted) return true;
    if (kind === 'date' && digits(state.value) && digits(state.value) === digits(expected)) return true;
    if (kind === 'combobox' || kind === 'typeahead' || kind === 'native-select') {
      return normalise(state.display).includes(wanted) || value.includes(wanted);
    }
    return false;
  }

  /** What the page's own framework holds for the field, when the in-page script could read it. */
  function frameworkMatches(kind, signals, expected) {
    if (!signals) return null;
    const held = signals.react || signals.vue;
    if (!held) return null;
    if (kind === 'radio' || kind === 'checkbox') {
      return typeof held.checked === 'boolean' ? held.checked : null;
    }
    const candidates = [held.value, held.componentValue].filter((candidate) => candidate !== undefined && candidate !== null);
    if (!candidates.length) return null;
    const wanted = normalise(expected);
    return candidates.some((candidate) => {
      const text = normalise(candidate);
      return text === wanted || text.includes(wanted) || (kind === 'date' && digits(candidate) === digits(expected) && digits(expected) !== '');
    });
  }

  /**
   * kept:          shown after leaving the field and the framework (if readable) agrees
   * kept-dom-only: shown, but the framework still holds something else, so Bizfile will likely drop it
   * lost:          the field no longer shows the value
   * error-shown:   kept, but a validation message appeared that was not there before
   * inconclusive:  the field already showed the value before the test, so nothing was proved
   */
  function verdict(kind, expected, before, settled, signals) {
    if (!shownValueMatches(kind, settled, expected)) return 'lost';
    if (shownValueMatches(kind, before, expected)) return 'inconclusive';
    const framework = frameworkMatches(kind, signals, expected);
    if (framework === false) return 'kept-dom-only';
    if (settled.errorText && settled.errorText !== before.errorText) return 'error-shown';
    return 'kept';
  }

  root.OakProbe = {
    FIELD_SELECTOR,
    FORBIDDEN_NAME,
    STRATEGIES,
    KINDS,
    sleep,
    clean,
    labelInfo,
    groupName,
    detectKind,
    resolveField,
    blockReason,
    readState,
    describe,
    deepQueryAll,
    relocate,
    isVisible,
    applyStrategy,
    verdict,
  };
})(globalThis);
