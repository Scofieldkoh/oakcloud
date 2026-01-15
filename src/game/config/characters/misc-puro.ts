import { CharacterConfig } from '@/game/types';

export const MiscPuro: CharacterConfig = {
  id: 'misc-puro',
  name: 'Puro',
  series: 'Changed',
  spritePath: '/pets/sprites/misc-puro/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 1, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 4, frameRate: 10 },
    crawl: { spriteLine: 6, frameMax: 4, frameRate: 10 },
    climb: { spriteLine: 7, frameMax: 4, frameRate: 10 },
    jump: { spriteLine: 3, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 4, frameMax: 3, frameRate: 10 },
    drag: { spriteLine: 5, frameMax: 1, frameRate: 8 },
  },
  physics: { width: 100, height: 120, mass: 1.0 },
};
