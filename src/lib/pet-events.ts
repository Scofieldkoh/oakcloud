import { PetEventType } from '@/game/types';

type PetEventCallback = (data?: unknown) => void;

/**
 * Simple event emitter for pet reactions to UI events.
 * This allows components throughout the app to notify the pet
 * when interesting things happen (success, errors, etc.)
 */
class PetEventEmitter {
  private listeners: Map<PetEventType, Set<PetEventCallback>> = new Map();

  /**
   * Subscribe to a pet event
   */
  on(event: PetEventType, callback: PetEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit a pet event
   */
  emit(event: PetEventType, data?: unknown): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in pet event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  off(event?: PetEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

// Singleton instance
export const petEvents = new PetEventEmitter();

/**
 * Emit a pet event - convenience function
 */
export function emitPetEvent(event: PetEventType, data?: unknown): void {
  petEvents.emit(event, data);
}

/**
 * Subscribe to pet events - convenience function
 */
export function onPetEvent(event: PetEventType, callback: PetEventCallback): () => void {
  return petEvents.on(event, callback);
}
