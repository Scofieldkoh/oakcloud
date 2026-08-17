import type { HtmlMeasurer } from './engine';

export interface A4MeasurerLayout {
  contentWidthPx: number;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  paragraphSpacing: string;
}

/**
 * Measures content height exactly like the editor's pagination measurer.
 * The `.a4-page-content` stylesheet must be present in the document for
 * paragraph/list/table metrics to match (see `buildA4PageContentStyles`).
 */
export function createA4PageMeasurer(
  layout: A4MeasurerLayout,
): HtmlMeasurer & { dispose: () => void } {
  const element = document.createElement('div');
  element.className = 'a4-page-content';
  Object.assign(element.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    contain: 'layout style',
    top: '-100000px',
    left: '0',
    width: `${layout.contentWidthPx}px`,
    height: 'auto',
    minHeight: '0',
    overflow: 'visible',
    fontFamily: layout.fontFamily,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  });
  element.style.setProperty('--a4-paragraph-spacing', layout.paragraphSpacing);
  document.body.appendChild(element);

  return {
    measure(html: string) {
      element.innerHTML = html;
      return element.scrollHeight;
    },
    dispose() {
      element.remove();
    },
  };
}
