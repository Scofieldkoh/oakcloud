import { DialogueConfig } from '@/game/types';

/**
 * Generic dialogue pool for all characters.
 * Characters can override specific categories with their own dialogue.
 */
export const genericDialogue: DialogueConfig = {
  greetings: [
    'Hi!',
    'Hello!',
    'Hey there!',
    'Hiya!',
    '*waves*',
    'Oh, hi!',
  ],

  idle: [
    '...',
    'Hmm...',
    'Nice day!',
    'La la la~',
    '*yawns*',
    'What to do...',
    '*hums*',
    'Hmm hmm~',
  ],

  dragStart: [
    'Whoa!',
    'Where are we going?',
    'Wheee!',
    'Up we go!',
    'Adventure time!',
    '*giggles*',
  ],

  throw: [
    'Woohoo!',
    'Weeeee!',
    'Too fast!',
    'Wheeeee!',
    '*screams*',
    'Again! Again!',
  ],

  landing: [
    'Nice view!',
    'Cozy spot!',
    'Made it!',
    'I like it here!',
    'High ground!',
    'Perfect!',
  ],

  bored: [
    'So bored...',
    '*yawns*',
    'Zzz...',
    'Anyone there?',
    '*sighs*',
    'Lonely...',
    '*stretches*',
  ],

  click: [
    'Yes?',
    'Hmm?',
    'You called?',
    '*perks up*',
    'What is it?',
    'Hello!',
  ],

  doubleClick: [
    'Okay okay!',
    '*spins*',
    'Whee!',
    'So excited!',
    '*jumps*',
    'Wooo!',
  ],

  rapidClick: [
    'Stop that!',
    'Too much!',
    '*dizzy*',
    'Okay okay!',
    'I get it!',
    'Calm down!',
  ],

  climbing: [
    'Up I go!',
    'Almost there...',
    'Climbing!',
    'So high!',
    '*climbs*',
    'View is great!',
  ],

  uiSuccess: [
    'Yay!',
    'Nice!',
    'Good job!',
    'Woohoo!',
    '*celebrates*',
    'Success!',
  ],

  uiError: [
    'Uh oh...',
    'Hmm...',
    'Oops!',
    '*worried*',
    'That\'s not good...',
    'Try again?',
  ],
};

/**
 * Get dialogue for a specific category.
 * Uses character-specific dialogue if available, falls back to generic.
 */
export function getDialogue(
  category: keyof DialogueConfig,
  characterDialogue?: Partial<DialogueConfig>
): string[] {
  if (characterDialogue?.[category]?.length) {
    return characterDialogue[category]!;
  }
  return genericDialogue[category];
}

/**
 * Get a random dialogue line from a category.
 */
export function getRandomDialogue(
  category: keyof DialogueConfig,
  characterDialogue?: Partial<DialogueConfig>
): string {
  const lines = getDialogue(category, characterDialogue);
  const index = Math.floor(Math.random() * lines.length);
  return lines[index];
}
