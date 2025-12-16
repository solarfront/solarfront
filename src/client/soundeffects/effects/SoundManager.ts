/**
 * SoundManager - Centralized sound effects manager for SolarFront
 * Provides a singleton interface to WebAudioSoundsV2
 */

import { WebAudioSoundsV2 } from './WebAudioSoundsV2';
import { WebAudioSounds } from '../WebAudioSounds';
import { MusicEngine } from '../music/MusicEngine';
import { TransformHandler } from '../../graphics/TransformHandler';
import { Cell } from '../../../core/game/Game';

// Sound priority levels
enum SoundPriority {
  LOW = 1,      // Ambient effects
  MEDIUM = 2,   // Ship movements, building sounds
  HIGH = 3      // Explosions, player actions
}

// Active sound tracking
interface ActiveSound {
  id: string;
  priority: SoundPriority;
  position?: Cell;
  startTime: number;
  duration: number; // Expected duration in seconds
  gainNode?: GainNode;
  soundType: string; // Category for volume scaling (e.g., "ship_firing", "nuke_explosion")
}

export class SoundManager {
  private static instance: SoundManager;
  private soundsV2: WebAudioSoundsV2;
  private soundsV1: WebAudioSounds;
  private musicEngine: MusicEngine;
  private initialized: boolean = false;
  private enabled: boolean = true;
  private volume: number = 0.197; // Sound effects at -14.1dB (5dB quieter than previous level)
  private musicVolume: number = 0.035; // Music at -29.1dB (10dB louder than previous level, 15dB below sound effects)
  private soundEffectsEnabled: boolean = true; // User toggle for sound effects
  private musicEnabled: boolean = true; // User toggle for background music
  private transformHandler: TransformHandler | null = null;
  private maxAudioDistance: number = 1500; // Tightened for better performance
  
  // Sound limiting system
  private activeSounds: ActiveSound[] = [];
  private maxConcurrentSounds: number = 10;
  private soundIdCounter: number = 0;
  private compressor: DynamicsCompressorNode | null = null;
  
  // Sound type tracking for volume scaling
  private activeSoundTypes: Map<string, number> = new Map();

  private constructor() {
    this.soundsV2 = new WebAudioSoundsV2();
    this.soundsV1 = new WebAudioSounds();
    this.musicEngine = new MusicEngine();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  /**
   * Initialize the audio context (must be called from user interaction)
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.soundsV2.init();
      await this.soundsV1.init();
      await this.musicEngine.init();
      
      // Set music volume
      this.musicEngine.setVolume(this.musicVolume);
      
      // Set up audio compressor for master output
      this.setupAudioCompressor();
      
      this.initialized = true;
      console.log('SoundManager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SoundManager:', error);
    }
  }

  /**
   * Set up dynamics compressor to prevent audio clipping and reduce volume spikes
   */
  private setupAudioCompressor(): void {
    if (!this.soundsV2 || !this.soundsV1) return;
    
    try {
      // Use the V2 audio context as primary
      const audioContext = this.soundsV2.getContext();
      if (!audioContext) return;

      // Create and configure compressor
      this.compressor = audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -20; // Start compressing at -20dB
      this.compressor.knee.value = 10;       // Smooth compression curve
      this.compressor.ratio.value = 6;       // 6:1 compression ratio
      this.compressor.attack.value = 0.01;   // 10ms attack
      this.compressor.release.value = 0.1;   // 100ms release
      
      // Note: The compressor will be connected per-sound rather than globally
      // to maintain compatibility with existing architecture
      
    } catch (error) {
      console.warn('Failed to setup audio compressor:', error);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Set the transform handler for spatial audio calculations
   */
  public setTransformHandler(transformHandler: TransformHandler): void {
    this.transformHandler = transformHandler;
  }

  /**
   * Calculate volume based on position relative to screen center
   * Returns 0 if position is too far or off-screen, otherwise scaled volume
   */
  private calculateSpatialVolume(position: Cell): number {
    if (!this.transformHandler) {
      return this.volume; // Fall back to full volume if no transform handler
    }

    // Check if position is on screen
    if (!this.transformHandler.isOnScreen(position)) {
      return 0; // No sound if off-screen
    }

    // Calculate distance from screen center
    const screenCenter = this.transformHandler.screenCenter();
    const centerCell = new Cell(screenCenter.screenX, screenCenter.screenY);
    
    // Simple distance calculation (could be enhanced with proper distance functions)
    const deltaX = Math.abs(position.x - centerCell.x);
    const deltaY = Math.abs(position.y - centerCell.y);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // If distance exceeds max audio distance, no sound
    if (distance > this.maxAudioDistance) {
      return 0;
    }

    // Calculate volume scaling: closer = louder
    const distanceRatio = distance / this.maxAudioDistance;
    const volumeScale = Math.max(0.1, 1 - distanceRatio); // Minimum 10% volume for nearby sounds
    
    return this.volume * volumeScale;
  }

  /**
   * Generate unique sound ID
   */
  private generateSoundId(): string {
    return `sound_${++this.soundIdCounter}_${Date.now()}`;
  }

  /**
   * Clean up finished sounds from active sounds array and update type counters
   */
  private cleanupFinishedSounds(): void {
    const now = Date.now() / 1000; // Convert to seconds
    const finishedSounds: ActiveSound[] = [];
    
    this.activeSounds = this.activeSounds.filter(sound => {
      const elapsed = now - sound.startTime;
      const isActive = elapsed < sound.duration;
      
      if (!isActive) {
        finishedSounds.push(sound);
      }
      
      return isActive;
    });
    
    // Update sound type counters for finished sounds
    finishedSounds.forEach(sound => {
      const currentCount = this.activeSoundTypes.get(sound.soundType) || 0;
      if (currentCount > 1) {
        this.activeSoundTypes.set(sound.soundType, currentCount - 1);
      } else {
        this.activeSoundTypes.delete(sound.soundType);
      }
    });
  }

  /**
   * Check if we can play a new sound, and make room if needed
   */
  private canPlaySound(priority: SoundPriority, position?: Cell): boolean {
    this.cleanupFinishedSounds();
    
    // If under limit, always allow
    if (this.activeSounds.length < this.maxConcurrentSounds) {
      return true;
    }

    // Find lowest priority sound to potentially replace
    const lowestPrioritySound = this.activeSounds
      .sort((a, b) => a.priority - b.priority)[0];

    // Only replace if new sound has higher priority
    if (priority > lowestPrioritySound.priority) {
      // Stop the lowest priority sound
      this.stopActiveSound(lowestPrioritySound.id);
      return true;
    }

    // If same priority, check distance (closer wins)
    if (priority === lowestPrioritySound.priority && position && lowestPrioritySound.position) {
      const newDistance = this.calculateDistanceFromCenter(position);
      const oldDistance = this.calculateDistanceFromCenter(lowestPrioritySound.position);
      
      if (newDistance < oldDistance) {
        this.stopActiveSound(lowestPrioritySound.id);
        return true;
      }
    }

    return false; // Can't play sound
  }

  /**
   * Calculate distance from screen center for priority comparisons
   */
  private calculateDistanceFromCenter(position: Cell): number {
    if (!this.transformHandler) return 0;
    
    const screenCenter = this.transformHandler.screenCenter();
    const centerCell = new Cell(screenCenter.screenX, screenCenter.screenY);
    
    const deltaX = Math.abs(position.x - centerCell.x);
    const deltaY = Math.abs(position.y - centerCell.y);
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  /**
   * Stop an active sound by ID and update type counters
   */
  private stopActiveSound(soundId: string): void {
    const soundIndex = this.activeSounds.findIndex(s => s.id === soundId);
    if (soundIndex !== -1) {
      const sound = this.activeSounds[soundIndex];
      
      // Stop the gain node if available
      if (sound.gainNode) {
        try {
          sound.gainNode.gain.exponentialRampToValueAtTime(0.001, sound.gainNode.context.currentTime + 0.1);
        } catch (error) {
          // Ignore if context is closed
        }
      }
      
      // Update sound type counter
      const currentCount = this.activeSoundTypes.get(sound.soundType) || 0;
      if (currentCount > 1) {
        this.activeSoundTypes.set(sound.soundType, currentCount - 1);
      } else {
        this.activeSoundTypes.delete(sound.soundType);
      }
      
      this.activeSounds.splice(soundIndex, 1);
    }
  }

  /**
   * Get sound type category for volume scaling
   */
  private getSoundType(methodName: string): string {
    // Map sound method calls to categories for volume scaling
    const soundTypeMap: Record<string, string> = {
      'playPlasmaBurst': 'ship_firing',
      'playShockwaveImpact': 'nuke_explosion',
      'playMissileDeploy': 'missile_launch',
      'playUnitDestruction': 'unit_destruction',
      'playSAMIntercept': 'sam_intercept',
      'playBuildingConstruction': 'building_construction',
      'playPortComplete': 'building_complete',
      'playCityComplete': 'building_complete',
      'playDefensePostComplete': 'building_complete',
      'playMissileSiloComplete': 'building_complete',
      'playTerritoryCapture': 'territory_capture',
      'playPortActivity': 'port_activity',
      'playFalloutCreation': 'fallout_creation',
      'playBuildingDestruction': 'building_destruction',
      'playGameStart': 'game_event',
      'playDefeatJingle': 'game_event',
      'playVictory1stPlace': 'game_event',
      'playPlayerConquest': 'game_event',
      'playUIConfirm': 'ui_sound'
    };
    
    return soundTypeMap[methodName] || 'unknown';
  }

  /**
   * Calculate volume scaling based on active sounds of the same type
   */
  private calculateVolumeScaling(soundType: string, baseVolume: number): number {
    const activeSameType = this.activeSoundTypes.get(soundType) || 0;
    if (activeSameType === 0) {
      return baseVolume;
    }
    
    // Apply custom volume scaling to prevent doubling
    // 1 sound = 100%, 2 sounds = 60% each, 3 sounds = 45% each, 4+ sounds = 40% each
    let volumeMultiplier: number;
    switch (activeSameType + 1) { // +1 because we're about to add this sound
      case 1:
        volumeMultiplier = 1.0;    // 100%
        break;
      case 2:
        volumeMultiplier = 0.6;    // 60%
        break;
      case 3:
        volumeMultiplier = 0.45;   // 45%
        break;
      default: // 4 or more
        volumeMultiplier = 0.4;    // 40%
        break;
    }
    
    return baseVolume * volumeMultiplier;
  }

  /**
   * Register a new active sound with sound type tracking
   */
  private registerActiveSound(priority: SoundPriority, duration: number, soundType: string, position?: Cell, gainNode?: GainNode): string {
    const soundId = this.generateSoundId();
    const activeSound: ActiveSound = {
      id: soundId,
      priority,
      position,
      startTime: Date.now() / 1000,
      duration,
      gainNode,
      soundType
    };
    
    this.activeSounds.push(activeSound);
    
    // Update sound type counter
    const currentCount = this.activeSoundTypes.get(soundType) || 0;
    this.activeSoundTypes.set(soundType, currentCount + 1);
    
    // Auto-cleanup after duration
    setTimeout(() => {
      this.stopActiveSound(soundId);
    }, duration * 1000);
    
    return soundId;
  }

  private playV2(soundMethod: (volume: number) => void, methodName: string, priority: SoundPriority, duration: number, position?: Cell): void {
    if (!this.initialized || !this.enabled || !this.soundEffectsEnabled) return;
    
    // Check if we can play this sound
    if (!this.canPlaySound(priority, position)) {
      return; // Sound rejected due to limit/priority
    }
    
    try {
      // Get sound type and calculate base volume
      const soundType = this.getSoundType(methodName);
      const baseVolume = position ? this.calculateSpatialVolume(position) : this.volume;
      
      if (baseVolume > 0) {
        // Apply volume scaling to prevent doubling of same-type sounds
        const scaledVolume = this.calculateVolumeScaling(soundType, baseVolume);
        
        // Play the sound with scaled volume
        soundMethod.call(this.soundsV2, scaledVolume);
        
        // Register the sound as active
        this.registerActiveSound(priority, duration, soundType, position);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  private playV1(soundMethod: (volume: number) => void, methodName: string, priority: SoundPriority, duration: number, position?: Cell): void {
    if (!this.initialized || !this.enabled || !this.soundEffectsEnabled) return;
    
    // Check if we can play this sound
    if (!this.canPlaySound(priority, position)) {
      return; // Sound rejected due to limit/priority
    }
    
    try {
      // Get sound type and calculate base volume
      const soundType = this.getSoundType(methodName);
      const baseVolume = position ? this.calculateSpatialVolume(position) : this.volume;
      
      if (baseVolume > 0) {
        // Apply volume scaling to prevent doubling of same-type sounds
        const scaledVolume = this.calculateVolumeScaling(soundType, baseVolume);
        
        // Play the sound with scaled volume
        soundMethod.call(this.soundsV1, scaledVolume);
        
        // Register the sound as active
        this.registerActiveSound(priority, duration, soundType, position);
      }
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  // Ship Firing Sounds - Both Viper and Condor use plasma burst
  public playShipFiring(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playPlasmaBurst(v), 'playPlasmaBurst', SoundPriority.MEDIUM, 0.8, position);
  }

  public playUnitDestruction(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playUnitDestruction(v), 'playUnitDestruction', SoundPriority.HIGH, 1.5, position);
  }

  // Building Sounds
  public playBuildingConstruction(position?: Cell): void {
    this.playV1((v) => this.soundsV1.playBuildingConstruction(v), 'playBuildingConstruction', SoundPriority.MEDIUM, 1.0, position);
  }

  public playPortComplete(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playPortComplete(v), 'playPortComplete', SoundPriority.MEDIUM, 2.0, position);
  }

  public playCityComplete(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playCityComplete(v), 'playCityComplete', SoundPriority.MEDIUM, 2.5, position);
  }

  public playDefensePostComplete(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playDefensePostComplete(v), 'playDefensePostComplete', SoundPriority.MEDIUM, 2.0, position);
  }

  public playMissileSiloComplete(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playMissileSiloComplete(v), 'playMissileSiloComplete', SoundPriority.MEDIUM, 2.0, position);
  }

  // Game State Sounds - High priority, no position
  public playGameStart(): void {
    this.playV2((v) => this.soundsV2.playGameStart(v), 'playGameStart', SoundPriority.HIGH, 3.0);
  }

  public playDefeatJingle(): void {
    this.playV2((v) => this.soundsV2.playDefeatJingle(v), 'playDefeatJingle', SoundPriority.HIGH, 4.0);
  }

  public playVictory1stPlace(): void {
    this.playV2((v) => this.soundsV2.playVictory1stPlace(v), 'playVictory1stPlace', SoundPriority.HIGH, 5.0);
  }

  public playPlayerConquest(): void {
    this.playV2((v) => this.soundsV2.playPlayerConquest(v), 'playPlayerConquest', SoundPriority.HIGH, 3.0);
  }

  // Explosion & Defense Sounds - High priority for explosions
  public playMissileLaunch(position?: Cell): void {
    // Use missile deploy sound for nuke launches (both atom bomb and hydrogen bomb)
    this.playV2((v) => this.soundsV2.playMissileDeploy(v), 'playMissileDeploy', SoundPriority.HIGH, 2.5, position);
  }

  public playNukeDetonation(position?: Cell): void {
    // Use shockwave impact for atom bombs
    this.playV2((v) => this.soundsV2.playShockwaveImpact(v), 'playShockwaveImpact', SoundPriority.HIGH, 3.0, position);
  }

  public playHydrogenBombImpact(position?: Cell): void {
    // Use shockwave impact for fusion bombs
    this.playV2((v) => this.soundsV2.playShockwaveImpact(v), 'playShockwaveImpact', SoundPriority.HIGH, 3.5, position);
  }

  public playSAMIntercept(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playSAMIntercept(v), 'playSAMIntercept', SoundPriority.HIGH, 1.3, position);
  }

  public playBuildingDestruction(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playBuildingDestruction(v), 'playBuildingDestruction', SoundPriority.HIGH, 2.0, position);
  }

  public playFalloutCreation(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playFalloutCreation(v), 'playFalloutCreation', SoundPriority.MEDIUM, 2.0, position);
  }

  // Additional utility sounds
  public playTerritoryCapture(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playTerritoryCapture(v), 'playTerritoryCapture', SoundPriority.MEDIUM, 1.5, position);
  }

  public playUIConfirm(): void {
    // UI sounds should always play at full volume regardless of position
    this.playV2((v) => this.soundsV2.playUIConfirm(v), 'playUIConfirm', SoundPriority.HIGH, 0.3);
  }

  public playPortActivity(position?: Cell): void {
    this.playV2((v) => this.soundsV2.playPortActivity(v), 'playPortActivity', SoundPriority.LOW, 1.0, position);
  }

  /**
   * Get current number of active sounds (for debugging/monitoring)
   */
  public getActiveSoundCount(): number {
    this.cleanupFinishedSounds();
    return this.activeSounds.length;
  }

  /**
   * Force cleanup of all active sounds
   */
  public clearAllActiveSounds(): void {
    this.activeSounds.forEach(sound => {
      if (sound.gainNode) {
        try {
          sound.gainNode.gain.exponentialRampToValueAtTime(0.001, sound.gainNode.context.currentTime + 0.1);
        } catch (error) {
          // Ignore if context is closed
        }
      }
    });
    this.activeSounds = [];
  }

  /**
   * Set maximum concurrent sounds limit
   */
  public setMaxConcurrentSounds(limit: number): void {
    this.maxConcurrentSounds = Math.max(1, Math.min(20, limit)); // Clamp between 1-20
  }

  /**
   * Get active sound types count (for debugging)
   */
  public getActiveSoundTypes(): Map<string, number> {
    this.cleanupFinishedSounds();
    return new Map(this.activeSoundTypes);
  }

  /**
   * Get detailed sound statistics (for debugging)
   */
  public getSoundStats(): { totalActive: number; byType: Record<string, number>; limit: number } {
    this.cleanupFinishedSounds();
    const byType: Record<string, number> = {};
    this.activeSoundTypes.forEach((count, type) => {
      byType[type] = count;
    });
    
    return {
      totalActive: this.activeSounds.length,
      byType,
      limit: this.maxConcurrentSounds
    };
  }

  // ===== BACKGROUND MUSIC CONTROLS =====

  /**
   * Start playing background music (ambient1.mp3)
   */
  public async startBackgroundMusic(): Promise<void> {
    console.log(`SoundManager: startBackgroundMusic called - initialized: ${this.initialized}, enabled: ${this.enabled}, musicEnabled: ${this.musicEnabled}`);
    
    if (!this.initialized || !this.enabled || !this.musicEnabled) {
      console.warn('SoundManager not initialized, disabled, or music disabled - cannot start background music');
      return;
    }
    
    try {
      console.log('SoundManager: Attempting to start background music via MusicEngine');
      await this.musicEngine.playBackgroundMusic();
      console.log('SoundManager: Background music started successfully');
    } catch (error) {
      console.error('SoundManager: Failed to start background music:', error);
    }
  }

  /**
   * Stop background music with optional fade out
   */
  public stopBackgroundMusic(fadeOut: boolean = true): void {
    this.musicEngine.stopBackgroundMusic(fadeOut);
    console.log(`SoundManager: Background music stopped${fadeOut ? ' with fade out' : ''}`);
  }

  /**
   * Pause background music
   */
  public pauseBackgroundMusic(): void {
    this.musicEngine.pauseBackgroundMusic();
    console.log('SoundManager: Background music paused');
  }

  /**
   * Resume background music
   */
  public resumeBackgroundMusic(): void {
    this.musicEngine.resumeBackgroundMusic();
    console.log('SoundManager: Background music resumed');
  }

  /**
   * Set background music volume (0-1)
   */
  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    this.musicEngine.setVolume(this.musicVolume);
    console.log(`SoundManager: Music volume set to ${this.musicVolume}`);
  }

  /**
   * Check if background music is currently playing
   */
  public isMusicPlaying(): boolean {
    return this.musicEngine.isPlaying();
  }

  /**
   * Enable or disable sound effects
   */
  public setSoundEffectsEnabled(enabled: boolean): void {
    this.soundEffectsEnabled = enabled;
    console.log(`SoundManager: Sound effects ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable background music
   */
  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    
    if (!enabled && this.isMusicPlaying()) {
      // Stop music immediately if disabled
      this.stopBackgroundMusic(false);
    } else if (enabled && this.initialized) {
      // Restart music if enabled and we're in a game (music controller will handle this)
      console.log('SoundManager: Music enabled - music controller will handle restart if needed');
    }
    
    console.log(`SoundManager: Background music ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current sound effects enabled state
   */
  public isSoundEffectsEnabled(): boolean {
    return this.soundEffectsEnabled;
  }

  /**
   * Get current music enabled state
   */
  public isMusicEnabled(): boolean {
    return this.musicEnabled;
  }
}

// Export the enum for use by other modules if needed
export { SoundPriority };