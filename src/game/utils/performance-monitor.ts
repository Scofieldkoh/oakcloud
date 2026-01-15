/**
 * Performance monitor for the pet mascot game
 * Tracks FPS and provides auto-quality adjustment
 */

export interface PerformanceMetrics {
  fps: number;
  avgFps: number;
  lowFpsCount: number;
  isLowPerformance: boolean;
}

export class PerformanceMonitor {
  private fpsHistory: number[] = [];
  private readonly historySize = 60; // Track last 60 frames (1 second at 60fps)
  private readonly lowFpsThreshold = 30;
  private lowFpsCount = 0;
  private readonly lowFpsLimit = 30; // After 30 low FPS frames, mark as low performance

  /**
   * Record a frame's FPS
   */
  recordFps(fps: number): void {
    this.fpsHistory.push(fps);

    // Keep history at fixed size
    if (this.fpsHistory.length > this.historySize) {
      this.fpsHistory.shift();
    }

    // Track low FPS frames
    if (fps < this.lowFpsThreshold) {
      this.lowFpsCount++;
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const currentFps = this.fpsHistory[this.fpsHistory.length - 1] || 60;
    const avgFps =
      this.fpsHistory.length > 0
        ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
        : 60;

    return {
      fps: Math.round(currentFps),
      avgFps: Math.round(avgFps),
      lowFpsCount: this.lowFpsCount,
      isLowPerformance: this.lowFpsCount > this.lowFpsLimit,
    };
  }

  /**
   * Reset the monitor
   */
  reset(): void {
    this.fpsHistory = [];
    this.lowFpsCount = 0;
  }

  /**
   * Get recommended quality settings based on performance
   */
  getRecommendedQuality(): { scale: number; frameRate: number } {
    const metrics = this.getMetrics();

    if (metrics.avgFps >= 55) {
      // Good performance - full quality
      return { scale: 1.0, frameRate: 60 };
    } else if (metrics.avgFps >= 40) {
      // Medium performance - slightly reduced
      return { scale: 0.9, frameRate: 45 };
    } else if (metrics.avgFps >= 25) {
      // Low performance - reduced quality
      return { scale: 0.75, frameRate: 30 };
    } else {
      // Very low performance - minimal quality
      return { scale: 0.5, frameRate: 20 };
    }
  }
}

// Singleton instance
let performanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor;
}

export function resetPerformanceMonitor(): void {
  if (performanceMonitor) {
    performanceMonitor.reset();
  }
}
