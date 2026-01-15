import { CharacterConfig } from '@/game/types';

export const PokemonGrowlithe: CharacterConfig = {
  id: 'pokemon-growlithe',
  name: 'Growlithe',
  series: 'Pokemon',
  spritePath: '/pets/sprites/pokemon-growlithe/sprite.png',
  frameSize: 128,
  animations: {
    stand: { spriteLine: 1, frameMax: 16, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 27, frameRate: 12 },
    greet: { spriteLine: 3, frameMax: 7, frameRate: 10 },
    crawl: { spriteLine: 4, frameMax: 16, frameRate: 10 },
    climb: { spriteLine: 5, frameMax: 16, frameRate: 10 },
    jump: { spriteLine: 6, frameMax: 1, frameRate: 10 },
    fall: { spriteLine: 7, frameMax: 4, frameRate: 10 },
    drag: { spriteLine: 8, frameMax: 1, frameRate: 8 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
  credit: {
    resource: 'Cachomon',
    link: 'http://cachomon.com/shimeji.php?&id=249',
  },
};
