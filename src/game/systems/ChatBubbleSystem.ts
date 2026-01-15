import * as Phaser from 'phaser';
import { BubbleType, ChatBubbleConfig } from '@/game/types';

/**
 * Chat bubble system for displaying speech/thought bubbles above the pet.
 * Features:
 * - Support for speech, thought, and exclamation bubbles
 * - Auto-dismiss with fade animation
 * - Queue system to prevent bubble spam
 * - Follows pet position
 */
export class ChatBubbleSystem {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;
  private background: Phaser.GameObjects.Graphics | null = null;
  private text: Phaser.GameObjects.Text | null = null;
  private currentTween: Phaser.Tweens.Tween | null = null;
  private dismissTimer: Phaser.Time.TimerEvent | null = null;
  private isShowing: boolean = false;
  private enabled: boolean = true;

  // Bubble styling
  private readonly PADDING_X = 12;
  private readonly PADDING_Y = 8;
  private readonly BORDER_RADIUS = 8;
  private readonly TAIL_SIZE = 8;
  private readonly FONT_SIZE = 14;
  private readonly MAX_WIDTH = 150;
  private readonly DEFAULT_DURATION = 2500;
  private readonly FADE_DURATION = 300;
  private readonly OFFSET_Y = -20; // Offset above pet

  // Colors for different bubble types
  private readonly COLORS = {
    speech: {
      bg: 0xffffff,
      border: 0xe0e0e0,
      text: '#333333',
    },
    thought: {
      bg: 0xf8f8f8,
      border: 0xd0d0d0,
      text: '#666666',
    },
    exclamation: {
      bg: 0xfff3cd,
      border: 0xffc107,
      text: '#856404',
    },
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Set whether bubbles are enabled
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hide();
    }
  }

  /**
   * Show a chat bubble above the pet
   */
  show(config: ChatBubbleConfig, petX: number, petY: number, petScale: number): void {
    if (!this.enabled) return;

    // If already showing, hide first then show new
    if (this.isShowing) {
      this.hide(true);
    }

    const { text, type = 'speech', duration = this.DEFAULT_DURATION } = config;
    const colors = this.COLORS[type];

    // Create container
    this.container = this.scene.add.container(petX, petY + this.OFFSET_Y * petScale);
    this.container.setDepth(1000); // Above everything

    // Create text to measure size
    this.text = this.scene.add.text(0, 0, text, {
      fontSize: `${this.FONT_SIZE}px`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: colors.text,
      wordWrap: { width: this.MAX_WIDTH },
      align: 'center',
    });
    this.text.setOrigin(0.5, 1);

    // Calculate bubble dimensions
    const textWidth = this.text.width;
    const textHeight = this.text.height;
    const bubbleWidth = textWidth + this.PADDING_X * 2;
    const bubbleHeight = textHeight + this.PADDING_Y * 2;

    // Create bubble background
    this.background = this.scene.add.graphics();
    this.drawBubble(
      this.background,
      -bubbleWidth / 2,
      -bubbleHeight - this.TAIL_SIZE,
      bubbleWidth,
      bubbleHeight,
      type,
      colors
    );

    // Position text inside bubble
    this.text.setPosition(0, -this.TAIL_SIZE - this.PADDING_Y);

    // Add to container
    this.container.add([this.background, this.text]);

    // Start showing animation
    this.container.setAlpha(0);
    this.container.setScale(0.8);

    this.currentTween = this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      scale: 1,
      duration: 150,
      ease: 'Back.easeOut',
    });

    this.isShowing = true;

    // Set dismiss timer
    this.dismissTimer = this.scene.time.delayedCall(duration, () => {
      this.hide();
    });
  }

  /**
   * Hide the current bubble
   */
  hide(immediate: boolean = false): void {
    if (!this.container) return;

    // Clear dismiss timer
    if (this.dismissTimer) {
      this.dismissTimer.destroy();
      this.dismissTimer = null;
    }

    // Stop current tween
    if (this.currentTween) {
      this.currentTween.stop();
      this.currentTween = null;
    }

    if (immediate) {
      this.destroyBubble();
    } else {
      // Fade out animation
      this.currentTween = this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        scale: 0.8,
        duration: this.FADE_DURATION,
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.destroyBubble();
        },
      });
    }
  }

  /**
   * Update bubble position to follow pet
   */
  updatePosition(petX: number, petY: number, petScale: number): void {
    if (this.container && this.isShowing) {
      this.container.setPosition(petX, petY + this.OFFSET_Y * petScale);
    }
  }

  /**
   * Check if a bubble is currently showing
   */
  isActive(): boolean {
    return this.isShowing;
  }

  /**
   * Destroy bubble resources
   */
  private destroyBubble(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
    this.background = null;
    this.text = null;
    this.isShowing = false;
  }

  /**
   * Draw the bubble shape with tail
   */
  private drawBubble(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    type: BubbleType,
    colors: { bg: number; border: number }
  ): void {
    const radius = this.BORDER_RADIUS;

    // Fill
    graphics.fillStyle(colors.bg, 1);

    // Draw rounded rectangle for main bubble
    graphics.fillRoundedRect(x, y, width, height, radius);

    // Draw tail based on bubble type
    if (type === 'thought') {
      // Thought bubbles have circular dots
      const dotY = y + height + 2;
      graphics.fillCircle(x + width / 2, dotY, 4);
      graphics.fillCircle(x + width / 2 - 3, dotY + 8, 3);
      graphics.fillCircle(x + width / 2 - 5, dotY + 14, 2);
    } else {
      // Speech and exclamation have triangular tail
      const tailX = x + width / 2;
      const tailY = y + height;
      graphics.fillTriangle(
        tailX - 6, tailY,
        tailX + 6, tailY,
        tailX, tailY + this.TAIL_SIZE
      );
    }

    // Border
    graphics.lineStyle(1, colors.border, 1);
    graphics.strokeRoundedRect(x, y, width, height, radius);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.hide(true);
    if (this.dismissTimer) {
      this.dismissTimer.destroy();
    }
    if (this.currentTween) {
      this.currentTween.stop();
    }
  }
}
