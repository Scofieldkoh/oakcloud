// Direction enum for pet movement (matching WindowPet)
export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  UPSIDELEFT = 'UPSIDELEFT',
  UPSIDERIGHT = 'UPSIDERIGHT',
  UNKNOWN = 'UNKNOWN',
}

// Easing functions for tweens
export enum Ease {
  QuartEaseOut = 'Quart.easeOut',
  QuadEaseOut = 'Quad.easeOut',
  Linear = 'Linear',
  BounceOut = 'Bounce.easeOut',
}

// Character configuration types
export interface CharacterAnimation {
  spriteLine: number; // Row number in sprite sheet (1-indexed)
  frameMax: number; // Number of frames in the animation
  frameRate: number; // FPS for this animation
}

export interface CharacterConfig {
  id: string; // Unique ID (e.g., 'genshin-nahida')
  name: string; // Display name
  series: string; // Character series (e.g., 'Genshin Impact')
  spritePath: string; // Path to sprite file
  frameSize: number; // Size of each frame (e.g., 128x128)
  animations: {
    stand: CharacterAnimation;
    walk: CharacterAnimation;
    sit?: CharacterAnimation; // Optional - some characters don't have sit animation
    [key: string]: CharacterAnimation | undefined; // Allow additional animations
  };
  physics: {
    width: number; // Collision box width
    height: number; // Collision box height
    mass: number; // Physics mass (0.5 - 2.0)
  };
  credit?: {
    resource?: string;
    link?: string;
  };
  dialogue?: Partial<DialogueConfig>; // Character-specific dialogue, optional
}

// Behavior state types
export enum BehaviorState {
  IDLE = 'idle',
  WALKING = 'walking',
  SITTING = 'sitting',
  CLIMBING = 'climbing',
  CRAWLING = 'crawling',
  JUMPING = 'jumping',
  FALLING = 'falling',
  DRAGGING = 'dragging',
}

// States that cannot be randomly selected
export const FORBIDDEN_RANDOM_STATES = ['fall', 'climb', 'drag', 'crawl', 'bounce', 'jump'];

// Extended sprite interface with pet-specific properties
export interface PetSprite extends Phaser.Physics.Arcade.Sprite {
  direction?: Direction;
  availableStates: string[];
  canPlayRandomState: boolean;
  canRandomFlip: boolean;
}

export interface PetBehaviorContext {
  state: BehaviorState;
  stateTimer: number; // Time in current state (ms)
  direction: 1 | -1; // 1 = right, -1 = left
  targetX?: number; // For walking behavior
}

// Dialogue configuration for chat bubbles
export interface DialogueConfig {
  greetings: string[]; // When clicked or greeting animation
  idle: string[]; // Random idle thoughts
  dragStart: string[]; // When user starts dragging
  throw: string[]; // When thrown with velocity
  landing: string[]; // When landing on platform
  bored: string[]; // After long idle period
  click: string[]; // Single click reaction
  doubleClick: string[]; // Double click reaction
  rapidClick: string[]; // Rapid clicking reaction
  climbing: string[]; // When climbing walls
  uiSuccess: string[]; // When app shows success
  uiError: string[]; // When app shows error
}

// Chat bubble types
export type BubbleType = 'speech' | 'thought' | 'exclamation';

export interface ChatBubbleConfig {
  text: string;
  type: BubbleType;
  duration?: number; // Duration in ms, default 2500
}

// Pet event types for UI reactions
export type PetEventType =
  | 'ui:success'
  | 'ui:error'
  | 'ui:modal-open'
  | 'ui:modal-close'
  | 'ui:sidebar-toggle'
  | 'ui:form-submit'
  | 'ui:loading-start'
  | 'ui:loading-end';

// ==========================================
// Multi-Pet Support Types
// ==========================================

import type { ChatBubbleSystem } from '@/game/systems/ChatBubbleSystem';
import type { DOMPlatform } from '@/game/utils/dom-platforms';

/**
 * Pet instance representing a single pet on screen
 * Each pet has its own sprite, bubble system, and social state
 */
export interface PetInstance {
  id: string; // Unique instance ID (e.g., 'pet-0', 'pet-1')
  characterId: string; // Character config ID (e.g., 'genshin-nahida')
  sprite: PetSprite;
  chatBubble?: ChatBubbleSystem;
  currentPlatform: DOMPlatform | null;
  socialState: PetSocialState;
  // Behavior flags per pet
  canPlayRandomState: boolean;
  canRandomFlip: boolean;
  // Timers per pet
  idleBubbleTimer: number;
  boredTimer: number;
  socialCooldown: number;
}

/**
 * Social interaction state for pet-to-pet interactions
 */
export interface PetSocialState {
  targetPetId: string | null; // Pet we're interacting with
  interactionType: PetInteraction | null;
  interactionTimer: number; // Duration of current interaction
}

/**
 * Types of social interactions between pets
 */
export type PetInteraction =
  | 'waving' // Wave at nearby pet
  | 'following' // Follow another pet
  | 'playing' // Play together (jumping around)
  | 'chasing' // Chase each other
  | 'bumping' // Bump into each other
  | 'chatting'; // Show social bubbles

/**
 * Social dialogue categories for pet-to-pet interactions
 */
export interface SocialDialogueConfig {
  wave: string[]; // "Hey!", "Hi friend!"
  play: string[]; // "Let's play!", "Catch me!"
  chase: string[]; // "Can't catch me!", "Here I come!"
  bump: string[]; // "Oops!", "Watch out!"
}
