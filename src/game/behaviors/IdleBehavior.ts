import * as Phaser from 'phaser';
import { BehaviorState } from '@/game/types';

export class IdleBehavior {
  private idleTimer: number = 0;
  private idleDuration: number = 0;
  private currentIdleAnim: 'stand' | 'sit' = 'stand';

  constructor() {
    this.resetIdleTimer();
  }

  update(sprite: Phaser.GameObjects.Sprite, delta: number): BehaviorState {
    this.idleTimer += delta;

    // Switch between stand and sit randomly
    if (this.idleTimer >= this.idleDuration) {
      // Randomly choose next idle animation (only use sit if it exists)
      const hasSitAnim = sprite.anims.exists('sit');
      if (hasSitAnim && Math.random() > 0.7) {
        this.currentIdleAnim = 'sit';
      } else {
        this.currentIdleAnim = 'stand';
      }

      if (sprite.anims.exists(this.currentIdleAnim)) {
        sprite.play(this.currentIdleAnim, true);
      }

      this.resetIdleTimer();

      // Randomly transition to walking
      if (Math.random() > 0.6) {
        return BehaviorState.WALKING;
      }
    }

    return BehaviorState.IDLE;
  }

  private resetIdleTimer() {
    // Idle for 2-5 seconds
    this.idleTimer = 0;
    this.idleDuration = 2000 + Math.random() * 3000;
  }

  reset() {
    this.resetIdleTimer();
    this.currentIdleAnim = 'stand';
  }
}
