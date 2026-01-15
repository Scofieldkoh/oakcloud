// Sidebar width constants (from design system)
const SIDEBAR_WIDTH_EXPANDED = 224; // 14rem = 224px
const SIDEBAR_WIDTH_COLLAPSED = 56; // 3.5rem = 56px
const MOBILE_HEADER_HEIGHT = 48; // 3rem = 48px

export interface PlayAreaBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Calculate the play area bounds for the pet
 * Takes into account sidebar state and mobile layout
 */
export function getPlayAreaBounds(
  windowWidth: number,
  windowHeight: number,
  sidebarCollapsed: boolean,
  isMobile: boolean = false
): PlayAreaBounds {
  let left = 0;
  let top = 0;
  const padding = 10; // Small padding from edges

  // Determine left boundary based on sidebar
  if (!isMobile) {
    // Add extra margin to ensure pet doesn't get cut off by sidebar
    const sidebarWidth = sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
    left = sidebarWidth + 20; // 20px extra margin from sidebar edge
  }

  // Mobile has header at top
  if (isMobile) {
    top = MOBILE_HEADER_HEIGHT;
  }

  return {
    left: left + padding,
    right: windowWidth - padding,
    top: top + padding,
    bottom: windowHeight - padding,
  };
}

/**
 * Check if a point is within bounds
 */
export function isWithinBounds(
  x: number,
  y: number,
  bounds: PlayAreaBounds
): boolean {
  return (
    x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
  );
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
