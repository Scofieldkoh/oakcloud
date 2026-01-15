import { CharacterConfig } from '@/game/types';

export const PokemonGengar: CharacterConfig = {
  id: 'pokemon-gengar',
  name: 'Gengar',
  series: 'Pokemon',
  spritePath: '/pets/sprites/pokemon-gengar/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 2, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 16, frameRate: 12 },
    sit: { spriteLine: 3, frameMax: 9, frameRate: 6 },
    greet: { spriteLine: 4, frameMax: 16, frameRate: 10 },
    crawl: { spriteLine: 5, frameMax: 16, frameRate: 10 },
    climb: { spriteLine: 6, frameMax: 16, frameRate: 10 },
    jump: { spriteLine: 7, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 8, frameMax: 3, frameRate: 10 },
    drag: { spriteLine: 9, frameMax: 1, frameRate: 8 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
};
