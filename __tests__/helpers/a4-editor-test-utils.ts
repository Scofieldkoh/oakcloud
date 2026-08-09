export function installDeterministicA4Measurement(
  { pixelsPerCharacter = 2, blockHeight = 24 } = {},
): () => void {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight',
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (!(this instanceof HTMLElement) || this.style.position !== 'fixed') {
        return 0;
      }
      const blocks = Math.max(
        1,
        this.querySelectorAll('p,li,tr,h1,h2,h3,blockquote').length,
      );
      return (
        blocks * blockHeight + (this.textContent?.length ?? 0) * pixelsPerCharacter
      );
    },
  });
  return () => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original);
    } else {
      delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
  };
}

export async function flushA4Reflow(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
