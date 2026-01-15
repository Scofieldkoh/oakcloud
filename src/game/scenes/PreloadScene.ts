import * as Phaser from 'phaser';
import { getCharacter } from '@/game/config/characters';

export class PreloadScene extends Phaser.Scene {
  private loadingBar?: Phaser.GameObjects.Graphics;
  private loadingText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    // Get character IDs from game registry (set by PhaserGameCanvas)
    const characterIds = this.registry.get('characterIds') as string[];

    if (!characterIds || characterIds.length === 0) {
      console.error('No characters to load');
      return;
    }

    // Create minimal loading indicator at bottom of screen
    this.createLoadingUI();

    // Load each character's sprite with unique texture key
    characterIds.forEach((charId) => {
      const character = getCharacter(charId);
      if (character) {
        this.load.spritesheet(`sprite-${charId}`, character.spritePath, {
          frameWidth: character.frameSize,
          frameHeight: character.frameSize,
        });
      } else {
        console.error(`Character not found: ${charId}`);
      }
    });

    // Update loading progress
    this.load.on('progress', (value: number) => {
      this.updateLoadingUI(value);
    });

    // Error handling
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`Failed to load file: ${file.key}`, file.src);
      if (this.loadingText) {
        this.loadingText.setText('Failed to load');
        this.loadingText.setColor('#ef4444');
      }
    });
  }

  private createLoadingUI() {
    const { width, height } = this.scale;
    const barWidth = 100;
    const barHeight = 4;
    const x = width / 2 - barWidth / 2;
    const y = height - 60;

    // Background bar
    this.loadingBar = this.add.graphics();
    this.loadingBar.fillStyle(0x374151, 0.8);
    this.loadingBar.fillRoundedRect(x, y, barWidth, barHeight, 2);

    // Loading text
    this.loadingText = this.add.text(width / 2, y - 12, 'Loading...', {
      fontSize: '11px',
      color: '#9ca3af',
      fontFamily: 'system-ui, sans-serif',
    });
    this.loadingText.setOrigin(0.5, 0.5);
  }

  private updateLoadingUI(progress: number) {
    if (!this.loadingBar) return;

    const { width, height } = this.scale;
    const barWidth = 100;
    const barHeight = 4;
    const x = width / 2 - barWidth / 2;
    const y = height - 60;

    // Clear and redraw
    this.loadingBar.clear();

    // Background bar
    this.loadingBar.fillStyle(0x374151, 0.8);
    this.loadingBar.fillRoundedRect(x, y, barWidth, barHeight, 2);

    // Progress bar
    this.loadingBar.fillStyle(0x10b981, 1);
    this.loadingBar.fillRoundedRect(x, y, barWidth * progress, barHeight, 2);

    // Update text
    if (this.loadingText) {
      const percent = Math.round(progress * 100);
      this.loadingText.setText(percent < 100 ? `Loading ${percent}%` : 'Ready!');
    }
  }

  create() {
    // Clean up loading UI
    if (this.loadingBar) this.loadingBar.destroy();
    if (this.loadingText) this.loadingText.destroy();

    // Transition to main pet scene
    this.scene.start('PetScene');
  }
}
