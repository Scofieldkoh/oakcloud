import * as Phaser from 'phaser';

export const createPhaserConfig = (
  parent: HTMLElement
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  backgroundColor: 'transparent',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 200, x: 0 }, // Match WindowPet gravity
      debug: false, // Set to true for development debugging
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%',
    height: '100%',
  },
  transparent: true,
  render: {
    pixelArt: true,
    antialias: false,
  },
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
});
