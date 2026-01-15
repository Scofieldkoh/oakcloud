/**
 * DOM Platform Detection Utility
 *
 * Scans the page for UI elements (cards, tables, sidebar)
 * and converts their positions into platforms the pet can walk on.
 *
 * Focuses on STATIC elements that are reliable platforms:
 * - Cards (.card class from Oakcloud design system)
 * - Table containers
 * - Modal dialogs
 */

export interface DOMPlatform {
  id: string;
  element: HTMLElement;
  rect: DOMRect;
  type: 'card' | 'table' | 'modal' | 'generic';
  // Platform bounds
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  // Platform surface (where pet can walk)
  surfaceY: number;
}

// Selectors for platform elements - ordered by priority
// Cards are the primary platform type in Oakcloud
const PLATFORM_SELECTORS = [
  // Cards - Oakcloud design system (.card class)
  '.card',

  // Table containers
  '.table-container',

  // Modal dialog content (visible only)
  '[role="dialog"]:not([aria-hidden="true"]) .card',
  '[role="dialog"]:not([aria-hidden="true"]) > div > div',
];

// Elements to exclude (buttons, links, very small elements)
const EXCLUDE_SELECTORS = [
  'button',
  'a',
  '[role="button"]',
  'input',
  'select',
  'textarea',
];

// Minimum dimensions for a valid platform
const MIN_PLATFORM_WIDTH = 120;
const MIN_PLATFORM_HEIGHT = 50;

// Maximum number of platforms to track
const MAX_PLATFORMS = 50;

/**
 * Detect all card/container DOM elements that can serve as platforms
 */
export function detectDOMPlatforms(): DOMPlatform[] {
  const platforms: DOMPlatform[] = [];
  const processedElements = new Set<HTMLElement>();

  // Query for card elements specifically
  for (const selector of PLATFORM_SELECTORS) {
    try {
      const elements = document.querySelectorAll<HTMLElement>(selector);

      for (const element of elements) {
        // Skip if already processed
        if (processedElements.has(element)) continue;

        // Skip excluded element types
        if (shouldExcludeElement(element)) continue;

        // Skip if not visible
        if (!isElementVisible(element)) continue;

        const rect = element.getBoundingClientRect();

        // Skip elements that are too small
        if (rect.width < MIN_PLATFORM_WIDTH || rect.height < MIN_PLATFORM_HEIGHT) {
          continue;
        }

        // Skip elements that are off-screen
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          continue;
        }
        if (rect.right < 0 || rect.left > window.innerWidth) {
          continue;
        }

        // Determine platform type
        const type = getPlatformType(element);

        const platform: DOMPlatform = {
          id: `platform-${platforms.length}-${element.className.slice(0, 20)}`,
          element,
          rect,
          type,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          surfaceY: rect.top, // Pet walks on top of the card
        };

        platforms.push(platform);
        processedElements.add(element);

        // Limit number of platforms for performance
        if (platforms.length >= MAX_PLATFORMS) break;
      }

      if (platforms.length >= MAX_PLATFORMS) break;
    } catch {
      // Skip invalid selectors
    }
  }

  // Sort by Y position (top to bottom) then by X (left to right)
  platforms.sort((a, b) => {
    if (Math.abs(a.top - b.top) < 20) {
      return a.left - b.left;
    }
    return a.top - b.top;
  });

  return platforms;
}

/**
 * Check if element should be excluded from platform detection
 */
function shouldExcludeElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();

  // Exclude by tag name
  if (['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) {
    return true;
  }

  // Exclude by role
  const role = element.getAttribute('role');
  if (role === 'button' || role === 'link') {
    return true;
  }

  // Check if matches any exclude selector
  for (const selector of EXCLUDE_SELECTORS) {
    try {
      if (element.matches(selector)) {
        return true;
      }
    } catch {
      // Invalid selector, skip
    }
  }

  return false;
}

/**
 * Check if an element is visible
 */
function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  // Check if element has dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

/**
 * Determine the type of platform based on element attributes
 */
function getPlatformType(element: HTMLElement): DOMPlatform['type'] {
  const className = element.className?.toLowerCase() || '';
  const role = element.getAttribute('role');

  // Check for modal first (highest priority)
  if (role === 'dialog' || element.closest('[role="dialog"]')) {
    return 'modal';
  }

  // Check for table
  if (className.includes('table')) {
    return 'table';
  }

  // Check for card (most common)
  if (className.includes('card')) {
    return 'card';
  }

  return 'generic';
}

/**
 * Find platforms that the pet can jump onto from current position
 * Returns platforms that are:
 * - Above or at similar height to the pet
 * - Within horizontal reach
 */
export function findReachablePlatforms(
  x: number,
  y: number,
  platforms: DOMPlatform[],
  maxHorizontalDistance: number = 200,
  maxVerticalDistance: number = 300
): DOMPlatform[] {
  return platforms.filter(platform => {
    // Check horizontal distance to platform
    const horizontalDist = Math.min(
      Math.abs(x - platform.left),
      Math.abs(x - platform.right),
      Math.abs(x - (platform.left + platform.width / 2))
    );

    if (horizontalDist > maxHorizontalDistance) {
      return false;
    }

    // Check vertical distance (platform should be above or near pet)
    const verticalDist = y - platform.surfaceY;

    // Platform should be above pet (positive distance) or slightly below
    if (verticalDist < -50 || verticalDist > maxVerticalDistance) {
      return false;
    }

    return true;
  });
}

/**
 * Find the nearest platform the pet can climb onto
 */
export function findClimbablePlatform(
  x: number,
  y: number,
  platforms: DOMPlatform[],
  maxDistance: number = 60
): { platform: DOMPlatform; edge: 'left' | 'right' } | null {
  // Find platforms at similar or higher Y position
  const reachable = findReachablePlatforms(x, y, platforms, maxDistance * 2, 400);

  for (const platform of reachable) {
    // Check if pet is near left edge of platform
    const distToLeft = Math.abs(x - platform.left);
    if (distToLeft < maxDistance && y >= platform.top - 50) {
      return { platform, edge: 'left' };
    }

    // Check if pet is near right edge of platform
    const distToRight = Math.abs(x - platform.right);
    if (distToRight < maxDistance && y >= platform.top - 50) {
      return { platform, edge: 'right' };
    }
  }

  return null;
}

/**
 * Find platform that pet is currently standing on
 */
export function findPlatformAt(
  x: number,
  y: number,
  platforms: DOMPlatform[],
  tolerance: number = 15
): DOMPlatform | null {
  for (const platform of platforms) {
    // Check if position is on the top surface of the platform
    const onSurface = Math.abs(y - platform.surfaceY) < tolerance;
    const withinX = x >= platform.left - 10 && x <= platform.right + 10;

    if (onSurface && withinX) {
      return platform;
    }
  }

  return null;
}

/**
 * Create a MutationObserver to track DOM changes and update platforms
 */
export function createPlatformObserver(
  callback: (platforms: DOMPlatform[]) => void,
  debounceMs: number = 500
): MutationObserver {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let scrollHandler: (() => void) | null = null;
  let resizeHandler: (() => void) | null = null;

  const debouncedCallback = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      const platforms = detectDOMPlatforms();
      callback(platforms);
    }, debounceMs);
  };

  const observer = new MutationObserver(() => {
    debouncedCallback();
  });

  // Observe the entire document for DOM changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
  });

  // Also listen for scroll and resize events
  scrollHandler = debouncedCallback;
  resizeHandler = debouncedCallback;

  window.addEventListener('scroll', scrollHandler, { passive: true });
  window.addEventListener('resize', resizeHandler, { passive: true });

  return observer;
}

/**
 * Cleanup observer and event listeners
 */
export function destroyPlatformObserver(observer: MutationObserver): void {
  observer.disconnect();
  // Note: Event listeners are not cleaned up here because we don't have references
  // In production, we'd want to track and remove them properly
}
