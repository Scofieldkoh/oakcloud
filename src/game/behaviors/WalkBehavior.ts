import * as Phaser from 'phaser';
import { BehaviorState } from '@/game/types';

export class WalkBehavior {
  private walkTimer: number = 0;
  private walkDuration: number = 0;
  private direction: 1 | -1 = 1; // 1 = right, -1 = left
  private baseSpeed: number = 80; // pixels per second

  constructor() {
    this.resetWalkTimer();
  }

  update(
    sprite: Phaser.GameObjects.Sprite,
    delta: number,
    bounds: { left: number; right: number },
    speedMultiplier: number = 1.0
  ): BehaviorState {
    this.walkTimer += delta;

    // Play walk animation if not already playing
    if (sprite.anims.exists('walk') && sprite.anims.currentAnim?.key !== 'walk') {
      sprite.play('walk', true);
    }

    // Calculate movement
    const speed = this.baseSpeed * speedMultiplier;
    const moveAmount = (speed * delta) / 1000; // Convert to pixels per frame

    // Move sprite
    sprite.x += moveAmount * this.direction;

    // Flip sprite based on direction
    sprite.setFlipX(this.direction < 0);

    // Check boundaries and turn around if needed
    if (sprite.x <= bounds.left) {
      sprite.x = bounds.left;
      this.direction = 1;
      sprite.setFlipX(false);
    } else if (sprite.x >= bounds.right) {
      sprite.x = bounds.right;
      this.direction = -1;
      sprite.setFlipX(true);
    }

    // Check if walk duration is over
    if (this.walkTimer >= this.walkDuration) {
      this.resetWalkTimer();
      return BehaviorState.IDLE;
    }

    return BehaviorState.WALKING;
  }

  private resetWalkTimer() {
    // Walk for 2-4 seconds
    this.walkTimer = 0;
    this.walkDuration = 2000 + Math.random() * 2000;

    // Randomly change direction
    if (Math.random() > 0.5) {
      this.direction *= -1;
    }
  }

  reset() {
    this.resetWalkTimer();
  }

  setDirection(direction: 1 | -1) {
    this.direction = direction;
  }
}
