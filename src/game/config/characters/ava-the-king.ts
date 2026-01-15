import { CharacterConfig } from '@/game/types';

export const AvaTheKing: CharacterConfig = {
  id: 'ava-the-king',
  name: 'The King',
  series: 'Animator vs Animation',
  spritePath: '/pets/sprites/ava-the-king/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 1, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 8, frameRate: 12 },
    greet: { spriteLine: 4, frameMax: 5, frameRate: 8 },
    crawl: { spriteLine: 8, frameMax: 6, frameRate: 10 },
    climb: { spriteLine: 9, frameMax: 6, frameRate: 10 },
    jump: { spriteLine: 5, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 6, frameMax: 6, frameRate: 10 },
    drag: { spriteLine: 7, frameMax: 1, frameRate: 8 },
  },
  physics: { width: 100, height: 120, mass: 1.0 },
};
