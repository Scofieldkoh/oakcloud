import { CharacterConfig } from '@/game/types';

export const FateTamamo: CharacterConfig = {
  id: 'fate-tamamo',
  name: 'Tamamo',
  series: 'Fate',
  spritePath: '/pets/sprites/fate-tamamo/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 4, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 4, frameRate: 12 },
    sit: { spriteLine: 3, frameMax: 2, frameRate: 6 },
    jump: { spriteLine: 4, frameMax: 1, frameRate: 10 },
    greet: { spriteLine: 5, frameMax: 2, frameRate: 10 },
    fall: { spriteLine: 6, frameMax: 3, frameRate: 10 },
    drag: { spriteLine: 7, frameMax: 1, frameRate: 8 },
    crawl: { spriteLine: 8, frameMax: 7, frameRate: 10 },
    climb: { spriteLine: 9, frameMax: 5, frameRate: 10 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
};
