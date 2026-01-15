import { CharacterConfig } from '@/game/types';

// Nahida from Genshin Impact
// Based on WindowPet sprite configuration
export const GenshinNahida: CharacterConfig = {
  id: 'genshin-nahida',
  name: 'Nahida',
  series: 'Genshin Impact',
  spritePath: '/pets/sprites/genshin-nahida/sprite.png',
  frameSize: 128, // 128x128px per frame
  animations: {
    stand: { spriteLine: 1, frameMax: 32, frameRate: 8 },
    walk: { spriteLine: 2, frameMax: 34, frameRate: 12 },
    sit: { spriteLine: 3, frameMax: 41, frameRate: 6 },
    greet: { spriteLine: 4, frameMax: 57, frameRate: 10 },
    crawl: { spriteLine: 5, frameMax: 31, frameRate: 10 },
    climb: { spriteLine: 6, frameMax: 17, frameRate: 10 },
    jump: { spriteLine: 7, frameMax: 31, frameRate: 12 },
    fall: { spriteLine: 8, frameMax: 18, frameRate: 10 },
    drag: { spriteLine: 9, frameMax: 1, frameRate: 8 },
  },
  physics: {
    width: 100,
    height: 120,
    mass: 1.0,
  },
  credit: {
    resource: 'WindowPet by @Yuexi_Nuo on Bilibili',
    link: 'https://github.com/SeakMengs/WindowPet',
  },
  // Nahida-specific dialogue reflecting her curious, wise, and gentle personality
  dialogue: {
    greetings: [
      'Hello, friend!',
      'Oh, it\'s you!',
      'Nice to see you~',
      'Let\'s learn together!',
      '*happy wave*',
    ],
    idle: [
      'Hmm, interesting...',
      'I wonder...',
      'Knowledge grows~',
      '*reads quietly*',
      'So much to learn!',
      'The Akasha knows...',
    ],
    dragStart: [
      'Where to?',
      'An adventure!',
      'Let\'s explore!',
      '*curious look*',
      'Ooh, where are we going?',
    ],
    throw: [
      'Wheeeee!',
      'Flying~!',
      'So fast!',
      '*giggles*',
      'What a journey!',
    ],
    landing: [
      'Good view!',
      'I like it here~',
      'So high up!',
      'Perfect spot!',
    ],
    bored: [
      'Need a book...',
      '*yawns softly*',
      'A bit lonely...',
      'Let\'s do something!',
      '*stretches*',
    ],
    click: [
      'Yes?',
      'Hello~',
      'Need help?',
      '*perks up*',
      'I\'m here!',
    ],
    doubleClick: [
      'So exciting!',
      '*twirls*',
      'Yay~!',
      'How fun!',
    ],
    rapidClick: [
      'Too fast!',
      'One at a time~',
      '*dizzy*',
      'Calm down!',
    ],
    climbing: [
      'Up I go!',
      'Higher~',
      'Almost there!',
      'Great exercise!',
    ],
    uiSuccess: [
      'Well done!',
      'Success~!',
      'Excellent!',
      '*celebrates*',
      'Good job!',
    ],
    uiError: [
      'Oh no...',
      'Hmm, try again?',
      '*worried*',
      'It\'s okay!',
      'We can fix this~',
    ],
  },
};
