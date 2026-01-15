import * as Phaser from 'phaser';
import { getCharacter } from '@/game/config/characters';
import {
  CharacterConfig,
  Direction,
  Ease,
  FORBIDDEN_RANDOM_STATES,
  BubbleType,
  type DialogueConfig,
  type PetInstance,
  type PetSprite,
  type PetInteraction,
} from '@/game/types';
import { getPlayAreaBounds, PlayAreaBounds } from '@/game/utils/collision-detection';
import { getPerformanceMonitor, resetPerformanceMonitor } from '@/game/utils/performance-monitor';
import {
  DOMPlatform,
  detectDOMPlatforms,
  findClimbablePlatform,
  createPlatformObserver,
  destroyPlatformObserver,
} from '@/game/utils/dom-platforms';
import { ChatBubbleSystem } from '@/game/systems/ChatBubbleSystem';
import { getRandomDialogue } from '@/game/config/dialogue';
import { getRandomSocialDialogue } from '@/game/config/dialogue/social';
import { petEvents } from '@/lib/pet-events';

export class PetScene extends Phaser.Scene {
  // Multi-pet storage
  private pets: Map<string, PetInstance> = new Map();
  private characters: Map<string, CharacterConfig> = new Map();
  private readonly MAX_PETS = 5;

  // Shared state
  private bounds: PlayAreaBounds;
  private sidebarCollapsed: boolean = false;
  private speedMultiplier: number = 1.0;
  private scaleMultiplier: number = 1.0;
  private allowClimbing: boolean = true;
  private chatBubblesEnabled: boolean = true;
  private cursorAwarenessEnabled: boolean = true;
  private uiReactionsEnabled: boolean = true;

  // Performance tracking
  private performanceCheckTimer: number = 0;
  private readonly performanceCheckInterval: number = 5000;

  // Movement constants
  private readonly FRAME_RATE = 9;
  private readonly PET_MOVE_VELOCITY = this.FRAME_RATE * 6;
  private readonly PET_MOVE_ACCELERATION = this.PET_MOVE_VELOCITY * 2;
  private readonly TWEEN_ACCELERATION = 0.15;
  private readonly RAND_STATE_DELAY = 3000;
  private readonly FLIP_DELAY = 5000;
  private readonly CLIMB_PAUSE_CHANCE = 0.003;
  private readonly CLIMB_JUMP_CHANCE = 0.001;

  // DOM Platform interaction
  private platforms: DOMPlatform[] = [];
  private platformObserver?: MutationObserver;
  private platformCheckTimer: number = 0;
  private readonly PLATFORM_CHECK_INTERVAL = 300;
  private readonly PLATFORM_CLIMB_CHANCE = 0.015;

  // Chat bubble timers
  private readonly IDLE_BUBBLE_INTERVAL = 15000;
  private readonly BORED_THRESHOLD = 30000;

  // Click detection
  private mouseMoveHandler?: (e: MouseEvent) => void;
  private pointerDownTime: number = 0;
  private pointerDownX: number = 0;
  private pointerDownY: number = 0;
  private clickCount: number = 0;
  private clickResetTimer?: Phaser.Time.TimerEvent;
  private activeDragPet: PetInstance | null = null;
  private readonly CLICK_MAX_DURATION = 200;
  private readonly CLICK_MAX_DISTANCE = 10;
  private readonly RAPID_CLICK_THRESHOLD = 5;

  // Cursor awareness
  private lastCursorX: number = 0;
  private lastCursorY: number = 0;
  private cursorStillTimer: number = 0;
  private readonly CURSOR_APPROACH_DELAY = 5000;

  // UI reactions
  private petEventUnsubscribers: (() => void)[] = [];

  // Social interaction constants
  private readonly SOCIAL_PROXIMITY = 120;
  private readonly SOCIAL_INTERACTION_DURATION = 2000;
  private readonly SOCIAL_COOLDOWN = 8000;

  constructor() {
    super({ key: 'PetScene' });
    this.bounds = { left: 0, right: 0, top: 0, bottom: 0 };
    resetPerformanceMonitor();
  }

  create() {
    // Get character IDs from registry
    const characterIds = this.registry.get('characterIds') as string[];

    // Get settings from registry
    this.sidebarCollapsed = this.registry.get('sidebarCollapsed') || false;
    this.speedMultiplier = this.registry.get('speedMultiplier') || 1.0;
    this.scaleMultiplier = this.registry.get('scaleMultiplier') || 1.0;
    this.allowClimbing = this.registry.get('climbingEnabled') ?? true;
    this.chatBubblesEnabled = this.registry.get('chatBubblesEnabled') ?? true;
    this.cursorAwarenessEnabled = this.registry.get('cursorAwarenessEnabled') ?? true;
    this.uiReactionsEnabled = this.registry.get('uiReactionsEnabled') ?? true;

    // Calculate bounds
    this.bounds = this.calculateBounds();

    // Setup physics world bounds
    this.physics.world.setBoundsCollision(true, true, true, true);
    this.updateWorldBounds();

    // Create pets for each character
    if (characterIds && characterIds.length > 0) {
      characterIds.forEach((charId, index) => {
        this.createPet(charId, index);
      });
    }

    // Handle window resize
    this.scale.on('resize', this.handleResize, this);

    // Setup world bounds collision handler
    this.physics.world.on('worldbounds', this.handleWorldBounds, this);

    // Setup DOM-level mouse tracking for click-through
    this.setupClickThrough();

    // Start random behavior after a delay
    this.time.delayedCall(1000, () => {
      this.pets.forEach((pet) => this.playRandomState(pet));
    });

    // Initialize DOM platform detection
    this.initializePlatformDetection();

    // Setup UI event listeners
    this.setupUIEventListeners();

    // Show greeting bubbles after a short delay (staggered)
    this.pets.forEach((pet, _id) => {
      const delay = 2000 + Math.random() * 1500;
      this.time.delayedCall(delay, () => {
        this.showBubble(pet, 'greetings');
      });
    });
  }

  /**
   * Create a new pet instance
   */
  private createPet(characterId: string, index: number): PetInstance | null {
    const character = getCharacter(characterId);
    if (!character) {
      console.error(`Character not found: ${characterId}`);
      return null;
    }

    // Store character config
    this.characters.set(characterId, character);

    // Calculate spawn position - spread pets horizontally
    const spreadWidth = this.bounds.right - this.bounds.left;
    const spacing = spreadWidth / (this.MAX_PETS + 1);
    const startX = this.bounds.left + spacing * (index + 1);
    const startY = this.bounds.bottom;

    // Get texture key
    const textureKey = `sprite-${characterId}`;

    // Create physics sprite
    const sprite = this.physics.add.sprite(startX, startY, textureKey) as PetSprite;
    sprite.setOrigin(0.5, 1);
    sprite.setScale(this.scaleMultiplier);
    sprite.setCollideWorldBounds(true, 0, 0, true);

    // Initialize sprite properties
    sprite.availableStates = Object.keys(character.animations);
    sprite.canPlayRandomState = true;
    sprite.canRandomFlip = true;
    sprite.direction = Direction.UNKNOWN;

    // Create animations for this character
    this.createAnimationsForCharacter(characterId, character, textureKey);

    // Make interactive for dragging
    sprite.setInteractive({ draggable: true, pixelPerfect: true });

    // Create pet instance
    const petId = `pet-${index}`;
    const petInstance: PetInstance = {
      id: petId,
      characterId,
      sprite,
      chatBubble: new ChatBubbleSystem(this),
      currentPlatform: null,
      socialState: {
        targetPetId: null,
        interactionType: null,
        interactionTimer: 0,
      },
      canPlayRandomState: true,
      canRandomFlip: true,
      idleBubbleTimer: 0,
      boredTimer: 0,
      socialCooldown: 0,
    };

    // Set chat bubble enabled state
    petInstance.chatBubble?.setEnabled(this.chatBubblesEnabled);

    // Setup drag interaction for this pet
    this.setupDragInteraction(petInstance);

    // Setup click detection for this pet
    this.setupClickDetection(petInstance);

    // Play initial animation
    const animKey = `${characterId}-stand`;
    if (this.anims.exists(animKey)) {
      sprite.play(animKey);
    }
    this.updateDirection(petInstance, Direction.UNKNOWN);

    // Store pet instance
    this.pets.set(petId, petInstance);

    return petInstance;
  }

  /**
   * Remove a pet instance
   */
  private removePet(petId: string): void {
    const pet = this.pets.get(petId);
    if (!pet) return;

    // Cleanup chat bubble
    pet.chatBubble?.destroy();

    // Destroy sprite
    pet.sprite.destroy();

    // Remove from map
    this.pets.delete(petId);
  }

  /**
   * Sync pets with external character list (for dynamic add/remove)
   */
  public syncCharacters(characterIds: string[]): void {
    const currentCharacterIds = new Set<string>();

    // Track which characters we currently have
    this.pets.forEach((pet) => {
      currentCharacterIds.add(pet.characterId);
    });

    // Find pets to remove
    const petsToRemove: string[] = [];
    this.pets.forEach((pet, petId) => {
      if (!characterIds.includes(pet.characterId)) {
        petsToRemove.push(petId);
      }
    });

    // Remove pets
    petsToRemove.forEach((petId) => this.removePet(petId));

    // Find characters to add
    const existingCharIds = new Set(
      Array.from(this.pets.values()).map((p) => p.characterId)
    );
    const charsToAdd = characterIds.filter((id) => !existingCharIds.has(id));

    // Add new pets - check if texture is loaded first
    charsToAdd.forEach((charId, i) => {
      const textureKey = `sprite-${charId}`;

      // Check if texture already exists
      if (this.textures.exists(textureKey)) {
        const index = this.pets.size + i;
        this.createPet(charId, index);
      } else {
        // Need to load texture first
        this.loadCharacterTexture(charId, i);
      }
    });
  }

  /**
   * Dynamically load a character's texture and create the pet
   */
  private loadCharacterTexture(characterId: string, indexOffset: number): void {
    const character = getCharacter(characterId);
    if (!character) {
      console.error(`Character not found: ${characterId}`);
      return;
    }

    const textureKey = `sprite-${characterId}`;

    // Load the spritesheet
    this.load.spritesheet(textureKey, character.spritePath, {
      frameWidth: character.frameSize,
      frameHeight: character.frameSize,
    });

    // Start the loader and create pet when done
    this.load.once('complete', () => {
      const index = this.pets.size + indexOffset;
      const pet = this.createPet(characterId, index);

      // Show greeting bubble for new pet
      if (pet) {
        this.time.delayedCall(500, () => {
          this.showBubble(pet, 'greetings');
        });
      }
    });

    this.load.start();
  }

  /**
   * Create animations for a specific character
   */
  private createAnimationsForCharacter(
    characterId: string,
    character: CharacterConfig,
    textureKey: string
  ): void {
    const { animations, frameSize } = character;

    // Calculate frames per row from sprite sheet
    const spriteTexture = this.textures.get(textureKey);
    let framesPerRow = 57;
    if (spriteTexture.source[0]) {
      framesPerRow = Math.floor(spriteTexture.source[0].width / frameSize);
    }

    Object.entries(animations).forEach(([key, config]) => {
      const animKey = `${characterId}-${key}`;
      // Skip if animation already exists or config is undefined
      if (this.anims.exists(animKey) || !config) return;

      const startFrame = (config.spriteLine - 1) * framesPerRow;
      const endFrame = startFrame + config.frameMax - 1;

      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: startFrame,
          end: endFrame,
        }),
        frameRate: config.frameRate,
        repeat: -1,
      });
    });
  }

  /**
   * Initialize DOM platform detection and observation
   */
  private initializePlatformDetection(): void {
    this.platforms = detectDOMPlatforms();
    this.platformObserver = createPlatformObserver((platforms) => {
      this.platforms = platforms;
    });
  }

  /**
   * Public method for real-time settings updates from React
   */
  public updateSettings(settings: {
    scaleMultiplier?: number;
    speedMultiplier?: number;
    sidebarCollapsed?: boolean;
    climbingEnabled?: boolean;
    chatBubblesEnabled?: boolean;
    cursorAwarenessEnabled?: boolean;
    uiReactionsEnabled?: boolean;
  }) {
    if (settings.scaleMultiplier !== undefined) {
      this.scaleMultiplier = settings.scaleMultiplier;
      // Apply to all pets
      this.pets.forEach((pet) => {
        const currentScaleX = pet.sprite.scaleX;
        const newScale = settings.scaleMultiplier!;
        pet.sprite.setScale(currentScaleX < 0 ? -newScale : newScale, newScale);
      });
    }

    if (settings.speedMultiplier !== undefined) {
      this.speedMultiplier = settings.speedMultiplier;
      // Update current movement velocity for walking pets
      this.pets.forEach((pet) => {
        if (
          pet.sprite.direction === Direction.LEFT ||
          pet.sprite.direction === Direction.RIGHT
        ) {
          this.updateMovement(pet);
        }
      });
    }

    if (settings.sidebarCollapsed !== undefined) {
      this.sidebarCollapsed = settings.sidebarCollapsed;
      this.bounds = this.calculateBounds();
      this.updateWorldBounds();

      // Keep all pets within new bounds
      this.pets.forEach((pet) => {
        pet.sprite.x = Phaser.Math.Clamp(
          pet.sprite.x,
          this.bounds.left,
          this.bounds.right
        );
        pet.sprite.y = Phaser.Math.Clamp(
          pet.sprite.y,
          this.bounds.top,
          this.bounds.bottom
        );
      });
    }

    if (settings.climbingEnabled !== undefined) {
      this.allowClimbing = settings.climbingEnabled;
      if (!this.allowClimbing) {
        this.pets.forEach((pet) => {
          const currentAnim = pet.sprite.anims.currentAnim?.key;
          if (
            currentAnim?.endsWith('-climb') ||
            currentAnim?.endsWith('-crawl')
          ) {
            this.petJumpOrPlayRandomState(pet);
          }
        });
      }
    }

    if (settings.chatBubblesEnabled !== undefined) {
      this.chatBubblesEnabled = settings.chatBubblesEnabled;
      this.pets.forEach((pet) => {
        pet.chatBubble?.setEnabled(settings.chatBubblesEnabled!);
      });
    }

    if (settings.cursorAwarenessEnabled !== undefined) {
      this.cursorAwarenessEnabled = settings.cursorAwarenessEnabled;
    }

    if (settings.uiReactionsEnabled !== undefined) {
      this.uiReactionsEnabled = settings.uiReactionsEnabled;
    }
  }

  // ==========================================
  // Chat Bubble Methods
  // ==========================================

  private showBubble(
    pet: PetInstance,
    category: keyof DialogueConfig,
    type: BubbleType = 'speech',
    chance: number = 1
  ): void {
    if (!pet.chatBubble || !this.chatBubblesEnabled) return;

    if (chance < 1 && Math.random() > chance) {
      return;
    }

    const character = this.characters.get(pet.characterId);
    const text = getRandomDialogue(category, character?.dialogue);
    const petScale = Math.abs(pet.sprite.scaleY);

    pet.chatBubble.show({ text, type }, pet.sprite.x, pet.sprite.y, petScale);

    // Reset bored timer when showing any bubble
    pet.boredTimer = 0;
  }

  private showSocialBubble(
    pet: PetInstance,
    category: 'wave' | 'play' | 'chase' | 'bump'
  ): void {
    if (!pet.chatBubble || !this.chatBubblesEnabled) return;

    const text = getRandomSocialDialogue(category);
    const petScale = Math.abs(pet.sprite.scaleY);

    pet.chatBubble.show(
      { text, type: 'exclamation' },
      pet.sprite.x,
      pet.sprite.y,
      petScale
    );
  }

  // ==========================================
  // Click Detection
  // ==========================================

  private setupClickDetection(pet: PetInstance): void {
    pet.sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerDownTime = Date.now();
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
    });

    pet.sprite.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.activeDragPet === pet) return;

      const duration = Date.now() - this.pointerDownTime;
      const distance = Phaser.Math.Distance.Between(
        this.pointerDownX,
        this.pointerDownY,
        pointer.x,
        pointer.y
      );

      if (
        duration < this.CLICK_MAX_DURATION &&
        distance < this.CLICK_MAX_DISTANCE
      ) {
        this.handleClick(pet);
      }
    });
  }

  private handleClick(pet: PetInstance): void {
    this.clickCount++;

    if (this.clickResetTimer) {
      this.clickResetTimer.destroy();
    }
    this.clickResetTimer = this.time.delayedCall(500, () => {
      this.clickCount = 0;
    });

    if (this.clickCount >= this.RAPID_CLICK_THRESHOLD) {
      this.handleRapidClick(pet);
      this.clickCount = 0;
      return;
    }

    if (this.clickCount === 2) {
      this.handleDoubleClick(pet);
      return;
    }

    this.time.delayedCall(250, () => {
      if (this.clickCount === 1) {
        this.handleSingleClick(pet);
      }
    });
  }

  private handleSingleClick(pet: PetInstance): void {
    pet.boredTimer = 0;

    const animKey = `${pet.characterId}-greet`;
    if (this.anims.exists(animKey)) {
      this.switchState(pet, 'greet');
      this.time.delayedCall(1500, () => {
        if (!this.isPetValid(pet)) return;
        if (pet.sprite.anims.currentAnim?.key === animKey) {
          this.playRandomState(pet);
        }
      });
    }

    this.showBubble(pet, 'click', 'speech', 0.75);
  }

  private handleDoubleClick(pet: PetInstance): void {
    pet.boredTimer = 0;

    const animKey = `${pet.characterId}-jump`;
    if (this.anims.exists(animKey)) {
      const startY = pet.sprite.y;
      this.tweens.add({
        targets: pet.sprite,
        y: startY - 30,
        duration: 200,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }

    this.showBubble(pet, 'doubleClick', 'exclamation');
  }

  private handleRapidClick(pet: PetInstance): void {
    pet.boredTimer = 0;

    this.tweens.add({
      targets: pet.sprite,
      angle: 360,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => {
        pet.sprite.angle = 0;
      },
    });

    this.showBubble(pet, 'rapidClick', 'exclamation');
  }

  // ==========================================
  // UI Event Listeners
  // ==========================================

  private setupUIEventListeners(): void {
    const unsubSuccess = petEvents.on('ui:success', () => {
      if (this.uiReactionsEnabled) {
        // Random pet reacts
        const randomPet = this.getRandomPet();
        if (randomPet) this.reactToUISuccess(randomPet);
      }
    });
    this.petEventUnsubscribers.push(unsubSuccess);

    const unsubError = petEvents.on('ui:error', () => {
      if (this.uiReactionsEnabled) {
        const randomPet = this.getRandomPet();
        if (randomPet) this.reactToUIError(randomPet);
      }
    });
    this.petEventUnsubscribers.push(unsubError);

    const unsubSidebar = petEvents.on('ui:sidebar-toggle', () => {
      if (this.uiReactionsEnabled) {
        this.pets.forEach((pet) => this.reactToSidebarToggle(pet));
      }
    });
    this.petEventUnsubscribers.push(unsubSidebar);
  }

  private getRandomPet(): PetInstance | null {
    const petsArray = Array.from(this.pets.values());
    if (petsArray.length === 0) return null;
    return petsArray[Math.floor(Math.random() * petsArray.length)];
  }

  private reactToUISuccess(pet: PetInstance): void {
    const animKey = `${pet.characterId}-greet`;
    if (this.anims.exists(animKey)) {
      this.switchState(pet, 'greet');
      this.time.delayedCall(1000, () => {
        if (!this.isPetValid(pet)) return;
        if (pet.sprite.anims.currentAnim?.key === animKey) {
          this.playRandomState(pet);
        }
      });
    }
    this.showBubble(pet, 'uiSuccess', 'exclamation', 0.65);
  }

  private reactToUIError(pet: PetInstance): void {
    this.showBubble(pet, 'uiError', 'thought', 0.55);
  }

  private reactToSidebarToggle(pet: PetInstance): void {
    const animKey = `${pet.characterId}-jump`;
    if (this.anims.exists(animKey)) {
      const startY = pet.sprite.y;
      this.tweens.add({
        targets: pet.sprite,
        y: startY - 20,
        duration: 150,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
  }

  // ==========================================
  // Drag Interaction
  // ==========================================

  private setupDragInteraction(pet: PetInstance): void {
    pet.sprite.on('pointerover', () => {
      this.input.setDefaultCursor('grab');
    });

    pet.sprite.on('pointerout', () => {
      if (!this.activeDragPet) {
        this.input.setDefaultCursor('default');
      }
    });

    pet.sprite.on('dragstart', () => {
      this.activeDragPet = pet;
      this.input.setDefaultCursor('grabbing');

      if (pet.sprite.body) {
        (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
      }

      const dragAnimKey = `${pet.characterId}-drag`;
      const standAnimKey = `${pet.characterId}-stand`;
      if (this.anims.exists(dragAnimKey)) {
        this.switchState(pet, 'drag');
      } else if (this.anims.exists(standAnimKey)) {
        pet.sprite.play(standAnimKey, true);
      }

      this.showBubble(pet, 'dragStart', 'speech', 0.6);
    });

    pet.sprite.on(
      'drag',
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        pet.sprite.x = dragX;
        pet.sprite.y = dragY;

        if (pet.sprite.input?.dragStartX !== undefined) {
          const goingRight = pet.sprite.x > pet.sprite.input.dragStartX;
          this.setPetFacingLeft(pet, !goingRight);
        }
      }
    );

    pet.sprite.on('dragend', (pointer: Phaser.Input.Pointer) => {
      this.activeDragPet = null;
      this.input.setDefaultCursor('default');

      const velocityMagnitude = Math.sqrt(
        pointer.velocity.x * pointer.velocity.x +
          pointer.velocity.y * pointer.velocity.y
      );

      const MIN_THROW_VELOCITY = 300;
      const hasSignificantVelocity = velocityMagnitude > MIN_THROW_VELOCITY;
      const maxThrowDistance = 100;

      let throwX = pet.sprite.x;
      let throwY = pet.sprite.y;

      if (hasSignificantVelocity) {
        const normalizedVelX = pointer.velocity.x / velocityMagnitude;
        const normalizedVelY = pointer.velocity.y / velocityMagnitude;
        const throwDistance = Math.min(velocityMagnitude * 0.1, maxThrowDistance);

        throwX = pet.sprite.x + normalizedVelX * throwDistance;
        throwY = pet.sprite.y + normalizedVelY * throwDistance;

        this.showBubble(pet, 'throw', 'exclamation', 0.7);
      }

      const clampedX = Phaser.Math.Clamp(
        throwX,
        this.bounds.left,
        this.bounds.right
      );
      const clampedY = Phaser.Math.Clamp(
        throwY,
        this.bounds.top,
        this.bounds.bottom
      );

      if (pet.sprite.body) {
        (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
      }

      if (clampedX !== pet.sprite.x || clampedY !== pet.sprite.y) {
        this.tweens.add({
          targets: pet.sprite,
          x: clampedX,
          y: clampedY,
          duration: 400,
          ease: Ease.QuartEaseOut,
          onComplete: () => {
            this.checkBoundsAfterThrow(pet);
          },
        });
      } else {
        this.checkBoundsAfterThrow(pet);
      }
    });
  }

  private checkBoundsAfterThrow(pet: PetInstance): void {
    const platformUnderPet = this.findPlatformUnderPet(pet);
    if (platformUnderPet) {
      this.landOnPlatform(pet, platformUnderPet);
      return;
    }

    const margin = 20;
    const atLeft = pet.sprite.x <= this.bounds.left + margin;
    const atRight = pet.sprite.x >= this.bounds.right - margin;
    const atTop = pet.sprite.y <= this.bounds.top + margin;
    const atBottom = pet.sprite.y >= this.bounds.bottom - margin;

    if (
      (atLeft || atRight) &&
      this.allowClimbing &&
      this.hasAnimation(pet, 'climb')
    ) {
      this.switchState(pet, 'climb');
      this.setPetFacingLeft(pet, atLeft);
    } else if (atTop && this.allowClimbing && this.hasAnimation(pet, 'crawl')) {
      this.switchState(pet, 'crawl');
    } else if (atBottom) {
      this.playRandomState(pet);
    } else {
      if (this.hasAnimation(pet, 'jump')) {
        this.switchState(pet, 'jump');
      } else {
        this.playRandomState(pet);
      }
    }
  }

  // ==========================================
  // Click Through Setup
  // ==========================================

  private setupClickThrough(): void {
    const canvas = this.game.canvas;
    if (!canvas) return;

    this.mouseMoveHandler = (e: MouseEvent) => {
      if (this.activeDragPet) return;

      try {
        const mousePointer = this.input?.mousePointer;
        const activePointer = this.input?.activePointer;

        if (!mousePointer || !activePointer) return;

        mousePointer.x = e.clientX;
        mousePointer.y = e.clientY;

        const hits = this.input.hitTestPointer(activePointer);
        const isOverAnyPet = hits.some((obj) =>
          Array.from(this.pets.values()).some((pet) => obj === pet.sprite)
        );

        canvas.style.pointerEvents = isOverAnyPet ? 'auto' : 'none';
        canvas.style.cursor = isOverAnyPet ? 'grab' : 'default';
      } catch {
        // Input system not available, ignore
      }
    };

    document.addEventListener('mousemove', this.mouseMoveHandler);
  }

  // ==========================================
  // World Bounds Handling
  // ==========================================

  private handleWorldBounds = (
    body: Phaser.Physics.Arcade.Body,
    up: boolean,
    down: boolean,
    left: boolean,
    right: boolean
  ) => {
    // Find which pet this body belongs to
    let pet: PetInstance | null = null;
    for (const p of this.pets.values()) {
      if (body.gameObject === p.sprite) {
        pet = p;
        break;
      }
    }

    if (!pet) return;

    // Ignore world bounds while on a platform
    if (pet.currentPlatform) return;

    const currentAnim = pet.sprite.anims.currentAnim?.key;

    // Handle crawling at edges
    if (currentAnim?.endsWith('-crawl')) {
      if (left || right) {
        this.petJumpOrPlayRandomState(pet);
      }
      return;
    }

    // Handle ceiling collision
    if (up) {
      if (this.allowClimbing && this.hasAnimation(pet, 'crawl')) {
        this.switchState(pet, 'crawl');
      } else {
        this.petJumpOrPlayRandomState(pet);
      }
      return;
    }

    // Handle ground collision
    if (down) {
      this.switchStateAfterJump(pet);
      this.petOnGroundPlayRandomState(pet);
    }

    // Handle wall collision
    if ((left || right) && this.allowClimbing) {
      this.handleWallCollision(pet, left, right, down);
    } else if ((left || right) && down) {
      this.toggleFlipX(pet);
      if (this.hasAnimation(pet, 'walk')) {
        this.switchState(pet, 'walk');
      }
    }
  };

  private handleWallCollision(
    pet: PetInstance,
    left: boolean,
    right: boolean,
    onGround: boolean
  ): void {
    const currentAnim = pet.sprite.anims.currentAnim?.key;
    if (currentAnim?.endsWith('-climb') || currentAnim?.endsWith('-crawl'))
      return;

    if (this.hasAnimation(pet, 'climb')) {
      this.switchState(pet, 'climb');
      this.setPetFacingLeft(pet, left);
    } else if (onGround) {
      this.toggleFlipX(pet);
      if (this.hasAnimation(pet, 'walk')) {
        this.switchState(pet, 'walk');
      }
    } else {
      this.petJumpOrPlayRandomState(pet);
    }
  }

  // ==========================================
  // Resize Handling
  // ==========================================

  private handleResize(): void {
    this.bounds = this.calculateBounds();
    this.updateWorldBounds();

    this.pets.forEach((pet) => {
      pet.sprite.x = Phaser.Math.Clamp(
        pet.sprite.x,
        this.bounds.left,
        this.bounds.right
      );
      pet.sprite.y = Phaser.Math.Clamp(
        pet.sprite.y,
        this.bounds.top,
        this.bounds.bottom
      );
    });
  }

  private calculateBounds(): PlayAreaBounds {
    const isMobile = window.innerWidth < 1024;
    return getPlayAreaBounds(
      window.innerWidth,
      window.innerHeight,
      this.sidebarCollapsed,
      isMobile
    );
  }

  private updateWorldBounds(): void {
    this.physics.world.setBounds(
      this.bounds.left,
      this.bounds.top,
      this.bounds.right - this.bounds.left,
      this.bounds.bottom - this.bounds.top
    );
  }

  // ==========================================
  // Main Update Loop
  // ==========================================

  update(_time: number, delta: number): void {
    // Track FPS
    const fps = 1000 / delta;
    const perfMonitor = getPerformanceMonitor();
    perfMonitor.recordFps(fps);

    // Performance check
    this.performanceCheckTimer += delta;
    if (this.performanceCheckTimer >= this.performanceCheckInterval) {
      this.performanceCheckTimer = 0;
      this.checkAndAdjustPerformance();
    }

    // Update each pet
    this.pets.forEach((pet) => {
      this.updatePet(pet, delta);
    });

    // Update social interactions between pets
    this.updateSocialInteractions(delta);

    // Platform check timer
    this.platformCheckTimer += delta;
    if (this.platformCheckTimer >= this.PLATFORM_CHECK_INTERVAL) {
      this.platformCheckTimer = 0;
      this.pets.forEach((pet) => {
        if (!pet.currentPlatform && this.activeDragPet !== pet) {
          this.updatePlatformInteraction(pet);
        }
      });
    }
  }

  private updatePet(pet: PetInstance, delta: number): void {
    // Update chat bubble position
    pet.chatBubble?.updatePosition(
      pet.sprite.x,
      pet.sprite.y,
      Math.abs(pet.sprite.scaleY)
    );

    // Skip updates while being dragged
    if (this.activeDragPet === pet) {
      pet.boredTimer = 0;
      return;
    }

    // Update idle timers
    this.updateIdleTimers(pet, delta);

    // Update cursor awareness (only for first pet to avoid chaos)
    const firstPet = Array.from(this.pets.values())[0];
    if (pet === firstPet) {
      this.updateCursorAwareness(pet, delta);
    }

    // Handle platform behavior
    if (pet.currentPlatform) {
      this.checkPlatformBounds(pet);
      this.petOnGroundPlayRandomState(pet);
      return;
    }

    // Handle climbing/crawling
    const currentAnim = pet.sprite.anims.currentAnim?.key;
    if (currentAnim?.endsWith('-climb') || currentAnim?.endsWith('-crawl')) {
      this.updateClimbBehavior(pet);
      return;
    }

    // Ground behavior
    if (this.isOnGround(pet)) {
      this.petOnGroundPlayRandomState(pet);
    }
  }

  // ==========================================
  // Social Interactions
  // ==========================================

  private updateSocialInteractions(delta: number): void {
    if (this.pets.size < 2) return;

    const petsArray = Array.from(this.pets.values());

    for (const pet of petsArray) {
      // Update cooldown
      if (pet.socialCooldown > 0) {
        pet.socialCooldown -= delta;
      }

      // Update ongoing interaction
      if (pet.socialState.interactionType) {
        pet.socialState.interactionTimer += delta;

        // End interaction after duration
        if (pet.socialState.interactionTimer >= this.SOCIAL_INTERACTION_DURATION) {
          this.endSocialInteraction(pet);
        }
        continue;
      }

      // Check for new interaction if not on cooldown
      if (pet.socialCooldown <= 0 && !pet.currentPlatform) {
        const nearby = this.findNearbyPets(pet);
        if (nearby.length > 0) {
          // Random chance to start interaction
          if (Math.random() < 0.02) {
            const target = nearby[Math.floor(Math.random() * nearby.length)];
            this.startSocialInteraction(pet, target);
          }
        }
      }
    }
  }

  private findNearbyPets(pet: PetInstance): PetInstance[] {
    const nearby: PetInstance[] = [];

    this.pets.forEach((other) => {
      if (other.id === pet.id) return;
      if (other.currentPlatform || other.socialState.interactionType) return;

      const distance = Phaser.Math.Distance.Between(
        pet.sprite.x,
        pet.sprite.y,
        other.sprite.x,
        other.sprite.y
      );

      if (distance < this.SOCIAL_PROXIMITY) {
        nearby.push(other);
      }
    });

    return nearby;
  }

  private startSocialInteraction(pet: PetInstance, target: PetInstance): void {
    // Pick random interaction
    const interactions: PetInteraction[] = [
      'waving',
      'playing',
      'chasing',
      'bumping',
    ];
    const interactionType =
      interactions[Math.floor(Math.random() * interactions.length)];

    pet.socialState = {
      targetPetId: target.id,
      interactionType,
      interactionTimer: 0,
    };

    pet.socialCooldown = this.SOCIAL_COOLDOWN;

    // Face each other
    const shouldFaceLeft = target.sprite.x < pet.sprite.x;
    this.setPetFacingLeft(pet, shouldFaceLeft);
    this.setPetFacingLeft(target, !shouldFaceLeft);

    // Play animations and show bubbles based on interaction type
    switch (interactionType) {
      case 'waving':
        if (this.hasAnimation(pet, 'greet')) {
          this.switchState(pet, 'greet');
        }
        this.showSocialBubble(pet, 'wave');
        // Target waves back after a short delay
        this.time.delayedCall(500, () => {
          if (!this.isPetValid(target)) return;
          if (this.hasAnimation(target, 'greet')) {
            this.switchState(target, 'greet');
          }
          this.showSocialBubble(target, 'wave');
        });
        break;

      case 'playing':
        // Both pets jump
        if (this.hasAnimation(pet, 'jump')) {
          const startY = pet.sprite.y;
          this.tweens.add({
            targets: pet.sprite,
            y: startY - 40,
            duration: 300,
            yoyo: true,
            ease: 'Quad.easeOut',
          });
        }
        if (this.hasAnimation(target, 'jump')) {
          this.time.delayedCall(150, () => {
            if (!this.isPetValid(target)) return;
            const startY = target.sprite.y;
            this.tweens.add({
              targets: target.sprite,
              y: startY - 40,
              duration: 300,
              yoyo: true,
              ease: 'Quad.easeOut',
            });
          });
        }
        this.showSocialBubble(pet, 'play');
        break;

      case 'chasing':
        // Pet runs toward target
        if (this.hasAnimation(pet, 'walk')) {
          this.switchState(pet, 'walk');
        }
        // Target runs away
        if (this.hasAnimation(target, 'walk')) {
          this.switchState(target, 'walk');
          this.setPetFacingLeft(target, shouldFaceLeft); // Run away
        }
        this.showSocialBubble(pet, 'chase');
        break;

      case 'bumping':
        // Small push effect
        const pushForce = 30;
        const petPushX = shouldFaceLeft ? pushForce : -pushForce;
        const targetPushX = shouldFaceLeft ? -pushForce : pushForce;

        this.tweens.add({
          targets: pet.sprite,
          x: pet.sprite.x + petPushX,
          duration: 200,
          ease: 'Quad.easeOut',
        });
        this.tweens.add({
          targets: target.sprite,
          x: target.sprite.x + targetPushX,
          duration: 200,
          ease: 'Quad.easeOut',
        });
        this.showSocialBubble(pet, 'bump');
        this.showSocialBubble(target, 'bump');
        break;
    }
  }

  private endSocialInteraction(pet: PetInstance): void {
    pet.socialState = {
      targetPetId: null,
      interactionType: null,
      interactionTimer: 0,
    };

    // Return to normal behavior
    this.playRandomState(pet);
  }

  // ==========================================
  // Idle Timers
  // ==========================================

  private updateIdleTimers(pet: PetInstance, delta: number): void {
    if (!this.chatBubblesEnabled || pet.chatBubble?.isActive()) return;

    pet.idleBubbleTimer += delta;
    const nextBubbleTime =
      this.IDLE_BUBBLE_INTERVAL + Math.random() * 15000;
    if (pet.idleBubbleTimer >= nextBubbleTime) {
      pet.idleBubbleTimer = 0;
      this.showBubble(pet, 'idle', 'thought');
    }

    pet.boredTimer += delta;
    if (pet.boredTimer >= this.BORED_THRESHOLD) {
      pet.boredTimer = 0;
      pet.idleBubbleTimer = 0;
      this.showBubble(pet, 'bored', 'thought');
    }
  }

  // ==========================================
  // Cursor Awareness
  // ==========================================

  private updateCursorAwareness(pet: PetInstance, delta: number): void {
    if (!this.cursorAwarenessEnabled) return;

    const currentAnim = pet.sprite.anims.currentAnim?.key;
    if (
      !currentAnim?.endsWith('-stand') &&
      !currentAnim?.endsWith('-sit') &&
      !currentAnim?.endsWith('-idle')
    ) {
      return;
    }

    const pointer = this.input.activePointer;
    const cursorX = pointer.x;
    const cursorY = pointer.y;

    const cursorMoved =
      Math.abs(cursorX - this.lastCursorX) > 5 ||
      Math.abs(cursorY - this.lastCursorY) > 5;

    if (cursorMoved) {
      this.lastCursorX = cursorX;
      this.lastCursorY = cursorY;
      this.cursorStillTimer = 0;

      const shouldFaceLeft = cursorX < pet.sprite.x;
      const currentlyFacingLeft = pet.sprite.scaleX < 0;

      if (shouldFaceLeft !== currentlyFacingLeft) {
        this.setPetFacingLeft(pet, shouldFaceLeft);
      }
    } else {
      this.cursorStillTimer += delta;

      if (this.cursorStillTimer >= this.CURSOR_APPROACH_DELAY) {
        this.cursorStillTimer = 0;
        this.approachCursor(pet, cursorX);
      }
    }
  }

  private approachCursor(pet: PetInstance, cursorX: number): void {
    if (!this.isOnGround(pet) || pet.currentPlatform) return;

    const currentAnim = pet.sprite.anims.currentAnim?.key;
    if (
      !currentAnim?.endsWith('-stand') &&
      !currentAnim?.endsWith('-sit') &&
      !currentAnim?.endsWith('-idle')
    ) {
      return;
    }

    const distance = Math.abs(cursorX - pet.sprite.x);
    if (distance < 50 || distance > 300) return;

    const shouldFaceLeft = cursorX < pet.sprite.x;
    this.setPetFacingLeft(pet, shouldFaceLeft);

    if (this.hasAnimation(pet, 'walk')) {
      this.switchState(pet, 'walk');
      this.time.delayedCall(1500, () => {
        if (!this.isPetValid(pet)) return;
        const animKey = `${pet.characterId}-walk`;
        if (pet.sprite.anims.currentAnim?.key === animKey) {
          this.playRandomState(pet);
        }
      });
    }
  }

  // ==========================================
  // Platform Interaction
  // ==========================================

  private updatePlatformInteraction(pet: PetInstance): void {
    const currentAnim = pet.sprite.anims.currentAnim?.key;

    if (currentAnim?.endsWith('-climb') || currentAnim?.endsWith('-crawl'))
      return;

    if (this.isOnGround(pet) && !pet.currentPlatform) {
      if (Math.random() < this.PLATFORM_CLIMB_CHANCE) {
        const climbable = findClimbablePlatform(
          pet.sprite.x,
          pet.sprite.y,
          this.platforms,
          60
        );
        if (climbable) {
          this.climbOntoPlatform(pet, climbable.platform, climbable.edge);
        }
      }
    }

    if (currentAnim?.endsWith('-walk')) {
      const isFacingLeft = pet.sprite.scaleX < 0;
      const checkX = pet.sprite.x + (isFacingLeft ? -40 : 40);

      const climbable = findClimbablePlatform(
        checkX,
        pet.sprite.y,
        this.platforms,
        30
      );
      if (climbable && Math.random() < this.PLATFORM_CLIMB_CHANCE * 5) {
        this.climbOntoPlatform(pet, climbable.platform, climbable.edge);
      }
    }
  }

  private climbOntoPlatform(
    pet: PetInstance,
    platform: DOMPlatform,
    edge: 'left' | 'right'
  ): void {
    if (pet.sprite.body) {
      (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    const targetX = edge === 'left' ? platform.left + 40 : platform.right - 40;
    const targetY = platform.surfaceY;

    if (this.hasAnimation(pet, 'jump')) {
      this.switchState(pet, 'jump');
    }
    this.setPetFacingLeft(pet, edge === 'right');

    this.tweens.add({
      targets: pet.sprite,
      x: targetX,
      y: targetY,
      duration: 500,
      ease: Ease.QuadEaseOut,
      onComplete: () => {
        pet.currentPlatform = platform;

        if (pet.sprite.body) {
          const body = pet.sprite.body as Phaser.Physics.Arcade.Body;
          body.enable = true;
          body.setAllowGravity(false);
          body.setVelocity(0, 0);
        }

        if (this.hasAnimation(pet, 'stand')) {
          this.switchState(pet, 'stand');
        }
        this.time.delayedCall(500, () => {
          if (!this.isPetValid(pet)) return;
          if (pet.currentPlatform && this.hasAnimation(pet, 'walk')) {
            this.switchState(pet, 'walk');
          }
        });
      },
    });
  }

  private findPlatformUnderPet(pet: PetInstance): DOMPlatform | null {
    this.platforms = detectDOMPlatforms();

    for (const platform of this.platforms) {
      const withinX =
        pet.sprite.x >= platform.left && pet.sprite.x <= platform.right;
      const nearTopSurface =
        pet.sprite.y >= platform.top - 30 && pet.sprite.y <= platform.top + 30;

      if (withinX && nearTopSurface) {
        return platform;
      }
    }

    return null;
  }

  private landOnPlatform(pet: PetInstance, platform: DOMPlatform): void {
    pet.currentPlatform = platform;
    pet.sprite.y = platform.surfaceY;

    if (pet.sprite.body) {
      const body = pet.sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(0, 0);
    }

    if (this.hasAnimation(pet, 'stand')) {
      this.switchState(pet, 'stand');
    }

    this.showBubble(pet, 'landing', 'speech', 0.5);

    this.time.delayedCall(300, () => {
      if (!this.isPetValid(pet)) return;
      if (pet.currentPlatform && this.hasAnimation(pet, 'walk')) {
        this.switchState(pet, 'walk');
      }
    });
  }

  private checkPlatformBounds(pet: PetInstance): void {
    if (!pet.currentPlatform) return;

    const element = pet.currentPlatform.element;
    if (!element || !document.contains(element)) {
      this.fallFromPlatform(pet);
      return;
    }

    const rect = element.getBoundingClientRect();

    pet.currentPlatform.left = rect.left;
    pet.currentPlatform.right = rect.right;
    pet.currentPlatform.top = rect.top;
    pet.currentPlatform.bottom = rect.bottom;
    pet.currentPlatform.surfaceY = rect.top;

    pet.sprite.y = rect.top;

    const platformMargin = 30;
    const minX = rect.left + platformMargin;
    const maxX = rect.right - platformMargin;

    if (pet.sprite.x < minX) {
      pet.sprite.x = minX;
      if (pet.sprite.direction === Direction.LEFT) {
        this.setPetFacingLeft(pet, false);
        this.updateDirection(pet, Direction.RIGHT);
      }
    } else if (pet.sprite.x > maxX) {
      pet.sprite.x = maxX;
      if (pet.sprite.direction === Direction.RIGHT) {
        this.setPetFacingLeft(pet, true);
        this.updateDirection(pet, Direction.LEFT);
      }
    }

    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      this.fallFromPlatform(pet);
    }
  }

  private fallFromPlatform(pet: PetInstance): void {
    pet.currentPlatform = null;

    if (this.hasAnimation(pet, 'jump')) {
      this.switchState(pet, 'jump');
    }

    if (pet.sprite.body) {
      const body = pet.sprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(true);
      body.setVelocityY(50);
    }
  }

  private jumpFromPlatform(pet: PetInstance): void {
    if (!pet.currentPlatform) return;

    const platform = pet.currentPlatform;
    pet.currentPlatform = null;

    if (pet.sprite.body) {
      (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    if (this.hasAnimation(pet, 'jump')) {
      this.switchState(pet, 'jump');
    }

    const isFacingLeft = pet.sprite.scaleX < 0;
    const landingX = isFacingLeft
      ? Math.max(this.bounds.left + 50, platform.left - 100)
      : Math.min(this.bounds.right - 50, platform.right + 100);

    this.tweens.add({
      targets: pet.sprite,
      x: landingX,
      y: this.bounds.bottom,
      duration: 800,
      ease: Ease.QuadEaseOut,
      onComplete: () => {
        if (pet.sprite.body) {
          (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
        }
        this.switchStateAfterJump(pet);
      },
    });
  }

  // ==========================================
  // Climbing Behavior
  // ==========================================

  private updateClimbBehavior(pet: PetInstance): void {
    if (!pet.sprite.anims.isPlaying) return;

    if (Math.random() < this.CLIMB_PAUSE_CHANCE) {
      pet.sprite.anims.pause();
      this.updateDirection(pet, Direction.UNKNOWN);
      if (pet.sprite.body) {
        (pet.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      }

      const pauseDuration = Phaser.Math.Between(3000, 6000);
      this.time.delayedCall(pauseDuration, () => {
        if (!this.isPetValid(pet)) return;
        if (pet.sprite.anims && !pet.sprite.anims.isPlaying) {
          pet.sprite.anims.resume();
          const currentAnim = pet.sprite.anims.currentAnim?.key;
          if (currentAnim) {
            const stateKey = currentAnim.split('-').pop()!;
            this.updateStateDirection(pet, stateKey);
          }
        }
      });
      return;
    }

    if (Math.random() < this.CLIMB_JUMP_CHANCE) {
      this.jumpFromWall(pet);
    }
  }

  private jumpFromWall(pet: PetInstance): void {
    if (!this.hasAnimation(pet, 'jump')) return;

    const isFacingLeft = pet.sprite.scaleX < 0;
    const targetX = isFacingLeft
      ? Phaser.Math.Between(pet.sprite.x, this.bounds.right - 100)
      : Phaser.Math.Between(this.bounds.left + 100, pet.sprite.x);

    if (pet.sprite.body) {
      (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    }

    this.switchState(pet, 'jump');

    this.tweens.add({
      targets: pet.sprite,
      x: targetX,
      y: this.bounds.bottom,
      duration: 2000,
      ease: Ease.QuadEaseOut,
      onComplete: () => {
        if (pet.sprite.body) {
          (pet.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
          this.switchStateAfterJump(pet);
        }
      },
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Check if a pet instance is still valid (not removed/destroyed)
   * Use this in delayed callbacks to avoid accessing destroyed sprites
   */
  private isPetValid(pet: PetInstance): boolean {
    return pet && pet.sprite && !pet.sprite.scene !== undefined && pet.sprite.active;
  }

  private isOnGround(pet: PetInstance): boolean {
    return pet.sprite.y >= this.bounds.bottom - 10;
  }

  private updateDirection(pet: PetInstance, direction: Direction): void {
    pet.sprite.direction = direction;
    this.updateMovement(pet);
  }

  private updateMovement(pet: PetInstance): void {
    if (!pet.sprite.body) return;
    const body = pet.sprite.body as Phaser.Physics.Arcade.Body;
    const velocity = this.PET_MOVE_VELOCITY * this.speedMultiplier;
    const onPlatform = pet.currentPlatform !== null;

    switch (pet.sprite.direction) {
      case Direction.RIGHT:
        body.setVelocity(velocity, 0);
        body.setAcceleration(0);
        this.setPetFacingLeft(pet, false);
        break;
      case Direction.LEFT:
        body.setVelocity(-velocity, 0);
        body.setAcceleration(0);
        this.setPetFacingLeft(pet, true);
        break;
      case Direction.UP:
        if (!onPlatform) {
          body.setVelocity(0, -velocity);
        } else {
          body.setVelocity(0, 0);
        }
        body.setAcceleration(0);
        break;
      case Direction.DOWN:
        if (!onPlatform) {
          body.setVelocity(0, velocity);
          body.setAcceleration(0, this.PET_MOVE_ACCELERATION);
        } else {
          body.setVelocity(0, 0);
          body.setAcceleration(0);
        }
        break;
      case Direction.UPSIDELEFT:
        if (!onPlatform) {
          body.setVelocity(-velocity, -velocity);
        } else {
          body.setVelocity(-velocity, 0);
        }
        body.setAcceleration(0);
        this.setPetFacingLeft(pet, true);
        break;
      case Direction.UPSIDERIGHT:
        if (!onPlatform) {
          body.setVelocity(velocity, -velocity);
        } else {
          body.setVelocity(velocity, 0);
        }
        body.setAcceleration(0);
        this.setPetFacingLeft(pet, false);
        break;
      case Direction.UNKNOWN:
      default:
        body.setVelocity(0);
        body.setAcceleration(0);
        break;
    }

    const isMovingUp = [
      Direction.UP,
      Direction.UPSIDELEFT,
      Direction.UPSIDERIGHT,
    ].includes(pet.sprite.direction!);
    body.setAllowGravity(!isMovingUp && !onPlatform);
  }

  private updateStateDirection(pet: PetInstance, state: string): void {
    let direction = Direction.UNKNOWN;

    switch (state) {
      case 'walk':
        direction =
          pet.sprite.scaleX < 0 ? Direction.LEFT : Direction.RIGHT;
        break;
      case 'jump':
        this.toggleFlipX(pet);
        direction = Direction.DOWN;
        break;
      case 'climb':
        direction = Direction.UP;
        break;
      case 'crawl':
        direction =
          pet.sprite.scaleX > 0
            ? Direction.UPSIDELEFT
            : Direction.UPSIDERIGHT;
        break;
      default:
        direction = Direction.UNKNOWN;
    }

    this.updateDirection(pet, direction);
  }

  private setPetFacingLeft(pet: PetInstance, facingLeft: boolean): void {
    const absScale = Math.abs(pet.sprite.scaleX);

    if (facingLeft && pet.sprite.scaleX > 0) {
      pet.sprite.setScale(-absScale, pet.sprite.scaleY);
      pet.sprite.setOffset(pet.sprite.width, 0);
    } else if (!facingLeft && pet.sprite.scaleX < 0) {
      pet.sprite.setScale(absScale, pet.sprite.scaleY);
      pet.sprite.setOffset(0, 0);
    }
  }

  private toggleFlipX(pet: PetInstance): void {
    if (pet.sprite.scaleX > 0) {
      pet.sprite.setOffset(pet.sprite.width, 0);
    } else {
      pet.sprite.setOffset(0, 0);
    }
    pet.sprite.setScale(pet.sprite.scaleX * -1, pet.sprite.scaleY);
  }

  // ==========================================
  // State Management
  // ==========================================

  private switchState(
    pet: PetInstance,
    state: string,
    options: { repeat?: number; delay?: number } = {}
  ): void {
    if (!this.allowClimbing && (state === 'climb' || state === 'crawl')) return;

    const animKey = `${pet.characterId}-${state}`;
    if (!this.anims.exists(animKey)) return;

    if (pet.sprite.anims.currentAnim?.key === animKey) return;

    pet.sprite.play({
      key: animKey,
      repeat: options.repeat ?? -1,
      delay: options.delay ?? 0,
    });

    this.updateStateDirection(pet, state);
  }

  private hasAnimation(pet: PetInstance, state: string): boolean {
    const animKey = `${pet.characterId}-${state}`;
    return this.anims.exists(animKey);
  }

  private getRandomState(pet: PetInstance): string {
    const availableStates = pet.sprite.availableStates.filter(
      (state) => !FORBIDDEN_RANDOM_STATES.includes(state)
    );

    if (availableStates.length === 0) return 'stand';

    const randomIndex = Phaser.Math.Between(0, availableStates.length - 1);
    return availableStates[randomIndex];
  }

  private playRandomState(pet: PetInstance): void {
    if (!pet.canPlayRandomState) return;

    const state = this.getRandomState(pet);
    this.switchState(pet, state);

    pet.canPlayRandomState = false;
    this.time.delayedCall(this.RAND_STATE_DELAY, () => {
      if (!this.isPetValid(pet)) return;
      pet.canPlayRandomState = true;
    });
  }

  private petJumpOrPlayRandomState(pet: PetInstance): void {
    if (this.hasAnimation(pet, 'jump')) {
      this.switchState(pet, 'jump');
    } else {
      this.switchState(pet, this.getRandomState(pet));
    }
  }

  private switchStateAfterJump(pet: PetInstance): void {
    const currentAnim = pet.sprite.anims.currentAnim?.key;
    if (!currentAnim?.endsWith('-jump')) return;

    const fallAnimKey = `${pet.characterId}-fall`;
    if (this.anims.exists(fallAnimKey)) {
      this.switchState(pet, 'fall', { repeat: 0 });

      pet.sprite.once('animationcomplete', () => {
        this.playRandomState(pet);
      });
    } else {
      this.playRandomState(pet);
    }
  }

  private petOnGroundPlayRandomState(pet: PetInstance): void {
    const currentAnim = pet.sprite.anims.currentAnim?.key;

    const forbiddenEndings = ['-climb', '-crawl', '-drag', '-jump', '-fall'];
    if (forbiddenEndings.some((ending) => currentAnim?.endsWith(ending))) {
      return;
    }

    const random = Phaser.Math.Between(0, 2000);

    // Random jump from platform
    if (pet.currentPlatform && random >= 1998 && random <= 2000) {
      this.jumpFromPlatform(pet);
      return;
    }

    // When on platform, ensure pet is walking
    if (pet.currentPlatform) {
      if (currentAnim?.endsWith('-stand') || currentAnim?.endsWith('-idle')) {
        if (random >= 100 && random <= 120 && this.hasAnimation(pet, 'walk')) {
          this.switchState(pet, 'walk');
        }
      }
      return;
    }

    // Random idle during walk
    if (currentAnim?.endsWith('-walk') && random >= 0 && random <= 5) {
      if (this.hasAnimation(pet, 'idle') || this.hasAnimation(pet, 'stand')) {
        this.switchState(
          pet,
          this.hasAnimation(pet, 'idle') ? 'idle' : 'stand'
        );
        this.time.delayedCall(Phaser.Math.Between(3000, 6000), () => {
          if (!this.isPetValid(pet)) return;
          const walkAnimKey = `${pet.characterId}-walk`;
          if (pet.sprite.anims.currentAnim?.key !== walkAnimKey) {
            this.switchState(pet, 'walk');
          }
        });
      }
      return;
    }

    // Random flip
    if (random >= 888 && random <= 890 && pet.canRandomFlip) {
      this.toggleFlipX(pet);
      if (pet.sprite.direction === Direction.LEFT) {
        this.updateDirection(pet, Direction.RIGHT);
      } else if (pet.sprite.direction === Direction.RIGHT) {
        this.updateDirection(pet, Direction.LEFT);
      }

      pet.canRandomFlip = false;
      this.time.delayedCall(this.FLIP_DELAY, () => {
        if (!this.isPetValid(pet)) return;
        pet.canRandomFlip = true;
      });
      return;
    }

    // Random state change
    if (random >= 777 && random <= 780) {
      this.playRandomState(pet);
      return;
    }

    // Random walk
    if (random >= 170 && random <= 175 && this.hasAnimation(pet, 'walk')) {
      this.switchState(pet, 'walk');
    }
  }

  // ==========================================
  // Performance
  // ==========================================

  private checkAndAdjustPerformance(): void {
    const perfMonitor = getPerformanceMonitor();
    const metrics = perfMonitor.getMetrics();

    if (metrics.isLowPerformance) {
      const recommended = perfMonitor.getRecommendedQuality();

      this.pets.forEach((pet) => {
        const currentScale = Math.abs(pet.sprite.scaleX);
        if (currentScale > recommended.scale) {
          const newScale = recommended.scale;
          pet.sprite.setScale(
            pet.sprite.scaleX < 0 ? -newScale : newScale,
            newScale
          );
        }
      });

      this.game.loop.targetFps = recommended.frameRate;
    }
  }

  // ==========================================
  // Cleanup
  // ==========================================

  shutdown(): void {
    this.scale.off('resize', this.handleResize, this);
    this.physics.world.off('worldbounds', this.handleWorldBounds);

    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = undefined;
    }

    if (this.platformObserver) {
      destroyPlatformObserver(this.platformObserver);
      this.platformObserver = undefined;
    }
    this.platforms = [];

    // Cleanup all pets
    this.pets.forEach((pet) => {
      pet.chatBubble?.destroy();
      pet.sprite.destroy();
    });
    this.pets.clear();

    if (this.clickResetTimer) {
      this.clickResetTimer.destroy();
      this.clickResetTimer = undefined;
    }

    this.petEventUnsubscribers.forEach((unsub) => unsub());
    this.petEventUnsubscribers = [];
  }
}
