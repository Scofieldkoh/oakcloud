/*
 * OakCloud Filing Assistant: locators. A locator is an ordered list of candidates, each able to find
 * the field on its own. Resolution fails closed: a candidate counts only when it finds exactly one
 * compatible element. Defines globalThis.OakLocator; needs OakDom.
 */
(function (root) {
  'use strict';
  const D = root.OakDom;

  /** Ids a framework generates afresh on each render. They are never stored. */
  const RANDOM_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[:«]r[0-9a-z]*[:»]|mui-\d+|react-select-\d+.*|headlessui-.*|radix-.*)$/i;

  /** Id segments that number repeated parts of a form, e.g. "card-1" for the first position holder. */
  const REPEAT_SEGMENT = /-(card|position-held|row|item|entry)-(\d+)(?=-|$)/g;

  const TEXTUAL = new Set(['text', 'date']);
  const DROPDOWN = new Set(['combobox', 'typeahead', 'native-select']);
  const CHOICE = new Set(['radio', 'checkbox']);

  const MAX_CANDIDATES = 6;

  function compatible(expected, actual) {
    return expected === actual || (TEXTUAL.has(expected) && TEXTUAL.has(actual)) || (DROPDOWN.has(expected) && DROPDOWN.has(actual));
  }

  function isStableId(id) {
    return Boolean(id) && !RANDOM_ID.test(id) && !/\d{6,}|[0-9a-f]{12,}/i.test(id);
  }

  function templateId(id) {
    return id.replace(REPEAT_SEGMENT, (_match, token) => '-' + token + '-{' + token + '}');
  }

  function templateRegex(template) {
    const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z-]+\\\}/g, '(\\d+)');
    return new RegExp('^' + escaped + '$');
  }

  function attributeSelector(name, value) {
    return '[' + name + '="' + String(value).replace(/["\\]/g, '\\$&') + '"]';
  }

  function same(a, b) {
    return D.normalise(a) === D.normalise(b);
  }

  /** The nearest heading before the element: the form section it belongs to. */
  function sectionOf(el) {
    const doc = el.ownerDocument;
    // Legends name a single question (a radio group), not a section, so they are left out.
    const headings = doc.querySelectorAll('h1,h2,h3,h4,[role=heading]');
    let section = '';
    for (const heading of headings) {
      if (heading.compareDocumentPosition(el) & 4 /* el follows the heading */ || heading.contains(el)) {
        const text = D.labelText(heading);
        if (text) section = D.clean(text, 100);
      }
    }
    return section;
  }

  /** Buttons are found by their name, narrowed by section when the name repeats. */
  function buildActionLocator(el) {
    return { kind: 'action', tag: el.tagName.toLowerCase(), label: D.actionLabel(el), section: sectionOf(el), candidates: [{ by: 'action', value: D.actionLabel(el), section: sectionOf(el) }] };
  }

  function buildLocator(el) {
    const doc = el.ownerDocument;
    const kind = D.detectKind(el);
    const info = D.labelInfo(el);
    const group = D.groupName(el);
    const section = sectionOf(el);
    const placeholder = D.clean(el.getAttribute('placeholder'));
    const candidates = [];
    if (isStableId(el.id) && D.deepQueryAll(doc, attributeSelector('id', el.id)).length === 1) {
      candidates.push({ by: 'id', value: templateId(el.id) });
    }
    const name = el.getAttribute('name');
    if (name && !CHOICE.has(kind) && D.deepQueryAll(doc, attributeSelector('name', name)).length === 1) {
      candidates.push({ by: 'name', value: name });
    }
    if (CHOICE.has(kind) && group) {
      candidates.push({ by: 'group', value: group, section });
    } else {
      if (info.name && info.source !== 'placeholder' && info.source !== 'none') candidates.push({ by: 'label', value: info.name, section });
      if (placeholder) candidates.push({ by: 'placeholder', value: placeholder, section });
    }
    return {
      kind,
      tag: el.tagName.toLowerCase(),
      type: D.clean(el.getAttribute('type')),
      label: info.name,
      labelSource: info.source,
      group,
      section,
      candidates,
    };
  }

  function bySection(elements, section) {
    if (!section || elements.length < 2) return elements;
    const narrowed = elements.filter((el) => sectionOf(el) === section);
    return narrowed.length ? narrowed : elements;
  }

  function choiceVisible(el) {
    return D.isVisible(el) || Boolean(el.labels && el.labels[0] && D.isVisible(el.labels[0])) || Boolean(el.closest('label') && D.isVisible(el.closest('label')));
  }

  function groupContainer(el) {
    return el.closest('[role=radiogroup],fieldset,[role=group]') || el.parentElement;
  }

  /** Elements one candidate finds, before the "exactly one" rule is applied. */
  function find(doc, candidate, locator) {
    const fields = () => D.deepQueryAll(doc, D.FIELD_SELECTOR);
    let found = [];
    if (candidate.by === 'id') {
      if (candidate.value.includes('{')) {
        // A repeated part: take the highest-numbered one, which is the card most recently added.
        const pattern = templateRegex(candidate.value);
        const matches = D.deepQueryAll(doc, '[id]')
          .map((el) => ({ el, numbers: (pattern.exec(el.id) || []).slice(1).map(Number) }))
          .filter((item) => item.numbers.length);
        matches.sort((a, b) => {
          for (let index = 0; index < a.numbers.length; index++) {
            if (a.numbers[index] !== b.numbers[index]) return b.numbers[index] - a.numbers[index];
          }
          return 0;
        });
        found = matches.length ? [matches[0].el] : [];
      } else {
        found = D.deepQueryAll(doc, attributeSelector('id', candidate.value));
      }
    } else if (candidate.by === 'name') {
      found = D.deepQueryAll(doc, attributeSelector('name', candidate.value));
    } else if (candidate.by === 'label') {
      found = bySection(fields().filter((el) => same(D.labelInfo(el).name, candidate.value)), candidate.section);
    } else if (candidate.by === 'placeholder') {
      found = bySection(fields().filter((el) => same(el.getAttribute('placeholder'), candidate.value)), candidate.section);
    } else if (candidate.by === 'action') {
      const buttons = D.deepQueryAll(doc, D.ACTION_SELECTOR).filter((el) => D.isVisible(el) && same(D.actionLabel(el), candidate.value));
      return bySection(buttons, candidate.section);
    } else if (candidate.by === 'group') {
      const choices = D.deepQueryAll(doc, 'input[type=radio],input[type=checkbox],[role=radio],[role=checkbox]').filter((el) => same(D.groupName(el), candidate.value));
      const narrowed = bySection(choices, candidate.section);
      const containers = new Set(narrowed.map(groupContainer));
      // A group counts as one match when all its options share one container.
      return containers.size === 1 ? [{ group: narrowed.filter(choiceVisible) }] : narrowed.map((el) => ({ group: [el] }));
    }
    return found.filter((el) => D.isVisible(el) && (!locator.tag || el.tagName.toLowerCase() === locator.tag) && compatible(locator.kind, D.detectKind(el)));
  }

  /**
   * Finds the element (or, for radios and checkboxes, the group of options) for a locator.
   * Returns { el, group, via, tried } where via is the index of the candidate that found it, or
   * { el: null, tried, ambiguous } when no candidate found exactly one element.
   */
  function resolve(doc, locator) {
    const tried = [];
    let ambiguous = false;
    for (let index = 0; index < locator.candidates.length; index++) {
      const candidate = locator.candidates[index];
      const matches = find(doc, candidate, locator);
      tried.push({ by: candidate.by, count: matches.length });
      if (matches.length === 1) {
        const match = matches[0];
        if (match.group) {
          if (!match.group.length) continue;
          return { el: match.group[0], group: match.group, via: index, tried };
        }
        return { el: match, group: null, via: index, tried };
      }
      if (matches.length > 1) ambiguous = true;
    }
    return { el: null, group: null, via: -1, tried, ambiguous };
  }

  function candidateKey(candidate) {
    return candidate.by + ':' + candidate.value + ':' + (candidate.section || '');
  }

  /** The primary locator's candidates first, then the fallback's that are not already there. */
  function merge(primary, fallback) {
    const seen = new Set();
    const candidates = [...primary.candidates, ...((fallback && fallback.candidates) || [])].filter((candidate) => {
      const key = candidateKey(candidate);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...primary, candidates: candidates.slice(0, MAX_CANDIDATES) };
  }

  /** A locator rebuilt from the element found now, keeping older candidates as fallbacks. */
  function refresh(oldLocator, el) {
    return { ...merge(buildLocator(el), oldLocator), kind: oldLocator.kind };
  }

  function sameCandidates(a, b) {
    return a.candidates.map(candidateKey).join('|') === b.candidates.map(candidateKey).join('|');
  }

  root.OakLocator = { isStableId, templateId, sectionOf, buildLocator, buildActionLocator, resolve, refresh, merge, sameCandidates, compatible };
})(globalThis);
