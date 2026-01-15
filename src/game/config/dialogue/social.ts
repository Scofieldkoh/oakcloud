import type { SocialDialogueConfig } from '@/game/types';

/**
 * Dialogue lines for pet-to-pet social interactions
 * These are shared across all characters when they interact with each other
 */
export const socialDialogue: SocialDialogueConfig = {
  wave: [
    'Hey!',
    'Hi there!',
    'Hello friend!',
    '*waves*',
    'Oh, hi!',
    'Over here~',
    '*waves excitedly*',
  ],
  play: [
    "Let's play!",
    'Wanna play?',
    'Play with me!',
    '*bounces*',
    'Fun time!',
    'Yay, friend!',
    '*jumps happily*',
  ],
  chase: [
    'Catch me!',
    "Can't catch me!",
    'Here I come!',
    '*runs*',
    'Chase!',
    'Too slow~',
    '*dashes*',
  ],
  bump: [
    'Oops!',
    'Sorry!',
    '*bumps*',
    'Watch out!',
    'Whoops!',
    'My bad~',
    '*bonk*',
  ],
};

/**
 * Get a random social dialogue line for the given interaction type
 */
export function getRandomSocialDialogue(
  category: keyof SocialDialogueConfig
): string {
  const lines = socialDialogue[category];
  return lines[Math.floor(Math.random() * lines.length)];
}
