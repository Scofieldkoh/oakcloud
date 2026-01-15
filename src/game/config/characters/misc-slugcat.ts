import { CharacterConfig } from '@/game/types';

export const MiscSlugcat: CharacterConfig = {
  id: 'misc-slugcat',
  name: 'Slugcat',
  series: 'Rain World',
  spritePath: '/pets/sprites/misc-slugcat/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 13, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 5, frameRate: 12 },
    sit: { spriteLine: 3, frameMax: 17, frameRate: 6 },
    greet: { spriteLine: 4, frameMax: 27, frameRate: 10 },
    jump: { spriteLine: 5, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 6, frameMax: 9, frameRate: 10 },
    drag: { spriteLine: 7, frameMax: 1, frameRate: 8 },
    crawl: { spriteLine: 8, frameMax: 8, frameRate: 10 },
    climb: { spriteLine: 9, frameMax: 8, frameRate: 10 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
  credit: {
    resource: 'DeviantArt',
    link: 'https://www.deviantart.com/annoyingflower/art/Slugcat-shimeji-781935044',
  },
};
