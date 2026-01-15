import { CharacterConfig } from '@/game/types';

export const TouhouMarisa: CharacterConfig = {
  id: 'touhou-marisa',
  name: 'Marisa',
  series: 'Touhou Project',
  spritePath: '/pets/sprites/touhou-marisa/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 1, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 4, frameRate: 12 },
    greet: { spriteLine: 3, frameMax: 9, frameRate: 10 },
    jump: { spriteLine: 4, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 5, frameMax: 3, frameRate: 10 },
    drag: { spriteLine: 6, frameMax: 1, frameRate: 8 },
    crawl: { spriteLine: 7, frameMax: 5, frameRate: 10 },
    climb: { spriteLine: 8, frameMax: 8, frameRate: 10 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
  credit: {
    resource: 'DeviantArt',
    link: 'https://www.deviantart.com/sai-nekosuki/art/SHIMEJI-Marisa-253952799',
  },
};
