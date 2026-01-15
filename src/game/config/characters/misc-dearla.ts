import { CharacterConfig } from '@/game/types';

export const MiscDearla: CharacterConfig = {
  id: 'misc-dearla',
  name: 'Dearla',
  series: 'Original',
  spritePath: '/pets/sprites/misc-dearla/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 13, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 4, frameRate: 12 },
    sit: { spriteLine: 3, frameMax: 13, frameRate: 6 },
    crawl: { spriteLine: 4, frameMax: 4, frameRate: 10 },
    climb: { spriteLine: 5, frameMax: 6, frameRate: 10 },
    jump: { spriteLine: 6, frameMax: 2, frameRate: 10 },
    fall: { spriteLine: 7, frameMax: 6, frameRate: 10 },
    drag: { spriteLine: 8, frameMax: 1, frameRate: 8 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
};
