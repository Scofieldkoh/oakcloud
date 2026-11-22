/*
 * Runs in the page's own JavaScript world, because content scripts cannot see the properties
 * React, Vue or Angular attach to DOM nodes. It only reads; it never changes the page's state.
 *
 * Protocol (synchronous, strings only so nothing crosses worlds as objects):
 * - the content script dispatches "oak-probe:signals" on a field; the result is written to the
 *   field's data-oak-probe-signals attribute, which the content script reads and removes.
 * - "oak-probe:page-info" on the document writes data-oak-probe-page-info on <html>.
 */
(function () {
  'use strict';
  if (window.__oakProbeSignalsInstalled) return;
  window.__oakProbeSignalsInstalled = true;

  const keyWithPrefix = (node, prefix) => Object.keys(node).find((key) => key.startsWith(prefix));

  const safe = (value) => {
    if (value === undefined || value === null) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).slice(0, 200);
    if (typeof value === 'object' && 'label' in value) return String(value.label).slice(0, 200);
    if (typeof value === 'object' && 'name' in value) return String(value.name).slice(0, 200);
    try {
      return JSON.stringify(value).slice(0, 200);
    } catch {
      return '[unreadable]';
    }
  };

  function reactSignals(el) {
    const propsKey = keyWithPrefix(el, '__reactProps$');
    const fiberKey = keyWithPrefix(el, '__reactFiber$');
    if (!propsKey && !fiberKey) return null;
    const result = {};
    const props = propsKey ? el[propsKey] : null;
    if (props) {
      if ('value' in props) result.value = safe(props.value);
      if ('checked' in props) result.checked = props.checked === true;
      if ('aria-checked' in props) result.checked = String(props['aria-checked']) === 'true';
      result.hasOnChange = typeof props.onChange === 'function';
    }
    // Custom dropdowns keep the chosen value in a parent component; walk up a few levels to find it.
    // The node's fiber pointer can be the stale copy; the current one carries the node's latest props.
    let fiber = fiberKey ? el[fiberKey] : null;
    if (fiber && fiber.alternate && props && fiber.alternate.memoizedProps === props) fiber = fiber.alternate;
    for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
      const memo = fiber.memoizedProps;
      if (depth > 0 && memo && typeof memo === 'object' && 'value' in memo && typeof memo.value !== 'function') {
        result.componentValue = safe(memo.value);
        result.componentDepth = depth;
        break;
      }
    }
    return result;
  }

  function vueSignals(el) {
    const instance = el.__vueParentComponent || (el.__vue__ ? { props: el.__vue__.$props } : null);
    if (!instance || !instance.props) return null;
    const props = instance.props;
    const result = {};
    if ('modelValue' in props) result.value = safe(props.modelValue);
    else if ('value' in props) result.value = safe(props.value);
    if ('checked' in props) result.checked = props.checked === true;
    return result;
  }

  document.addEventListener(
    'oak-probe:signals',
    (event) => {
      const el = event.composedPath()[0];
      if (!(el instanceof Element)) return;
      let signals;
      try {
        signals = { react: reactSignals(el), vue: vueSignals(el) };
      } catch (error) {
        signals = { error: String(error && error.message).slice(0, 120) };
      }
      el.setAttribute('data-oak-probe-signals', JSON.stringify(signals));
    },
    true,
  );

  /** For the dropdown inspector: which React event handlers the element and its ancestors have. */
  document.addEventListener(
    'oak-probe:handlers',
    (event) => {
      const el = event.composedPath()[0];
      if (!(el instanceof Element)) return;
      const levels = [];
      let node = el;
      for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
        const propsKey = keyWithPrefix(node, '__reactProps$');
        const props = propsKey ? node[propsKey] : null;
        const handlers = props ? Object.keys(props).filter((name) => /^on[A-Z]/.test(name) && typeof props[name] === 'function') : [];
        if (handlers.length) {
          const classes = Array.from(node.classList).slice(0, 4).join('.');
          levels.push({ depth, element: node.tagName.toLowerCase() + (classes ? '.' + classes : ''), handlers });
        }
      }
      el.setAttribute('data-oak-probe-handlers', JSON.stringify(levels));
    },
    true,
  );

  function detectReact() {
    const candidates = [document.getElementById('root'), document.getElementById('app'), document.body, ...Array.from(document.body ? document.body.children : [])];
    return candidates.some((node) => node && (keyWithPrefix(node, '__reactContainer$') || node._reactRootContainer || keyWithPrefix(node, '__reactFiber$')));
  }

  document.addEventListener('oak-probe:page-info', () => {
    let info;
    try {
      const ngRoot = document.querySelector('[ng-version]');
      info = {
        react: detectReact(),
        angularVersion: ngRoot ? ngRoot.getAttribute('ng-version') : null,
        angularDevMode: typeof window.ng === 'object' && window.ng !== null,
        vue: Boolean(window.__VUE__ || document.querySelector('[data-v-app]') || (document.querySelector('#app') && document.querySelector('#app').__vue_app__)),
        jquery: typeof window.jQuery === 'function' ? String(window.jQuery.fn && window.jQuery.fn.jquery) : null,
      };
    } catch (error) {
      info = { error: String(error && error.message).slice(0, 120) };
    }
    document.documentElement.setAttribute('data-oak-probe-page-info', JSON.stringify(info));
  });
})();
