import { CharacterConfig } from '@/game/types';

export const AnimeJotaro: CharacterConfig = {
  id: 'anime-jotaro',
  name: 'Jotaro',
  series: "JoJo's Bizarre Adventure",
  spritePath: '/pets/sprites/anime-jotaro/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 1, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 4, frameRate: 12 },
    sit: { spriteLine: 3, frameMax: 1, frameRate: 6 },
    greet: { spriteLine: 4, frameMax: 4, frameRate: 10 },
    jump: { spriteLine: 5, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 6, frameMax: 3, frameRate: 10 },
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
    link: 'https://www.deviantart.com/jojoshimeji/art/Stardust-Crusaders-Shimeji-825874618',
  },
};
