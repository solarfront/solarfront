/**
 * MusicController - Manages background music playback based on game state
 * Starts ambient1.mp3 when spawn phase ends and stops it during win/defeat sequences
 */

import { GameView } from '../../../core/game/GameView';
import { SoundManager } from '../../soundeffects/effects/SoundManager';
import { Layer } from './Layer';

export class MusicController implements Layer {
  private game: GameView;
  private soundManager: SoundManager;
  private spawnPhaseEnded: boolean = false;
  private musicStarted: boolean = false;
  private musicStarting: boolean = false; // Track if music is currently being initialized
  private lastRestartCheck: number = 0; // Track last time we checked for restart

  constructor(game: GameView) {
    this.game = game;
    this.soundManager = SoundManager.getInstance();
  }

  init(): void {
    // Nothing to initialize
  }

  tick(): void {
    // Enhanced debugging for spawn phase detection
    const currentlyInSpawnPhase = this.game.inSpawnPhase();
    const currentTick = this.game.ticks();
    
    
    // Track when spawn phase ends - same logic as TutorialPopup
    if (!this.spawnPhaseEnded && !currentlyInSpawnPhase) {
      this.spawnPhaseEnded = true;
      this.startBackgroundMusic();
    }

    // Handle music restart when toggled back on
    // Only check every 30 ticks (3 seconds) to avoid rapid restart attempts
    // Also don't restart if music is currently being initialized
    if (this.spawnPhaseEnded &&
        !this.musicStarting &&
        this.musicStarted &&
        currentTick - this.lastRestartCheck >= 30 &&
        !this.soundManager.isMusicPlaying() &&
        this.soundManager.isMusicEnabled()) {
      this.lastRestartCheck = currentTick;
      this.musicStarted = false; // Reset so we can restart
      this.startBackgroundMusic();
    }
  }

  /**
   * Start background music when spawn phase ends
   */
  private async startBackgroundMusic(): Promise<void> {
    // Don't start if already started or currently starting
    if (this.musicStarted || this.musicStarting) {
      return;
    }

    try {
      // Mark as starting to prevent duplicate attempts
      this.musicStarting = true;

      await this.soundManager.startBackgroundMusic();

      // Mark as started and clear starting flag
      this.musicStarted = true;
      this.musicStarting = false;
    } catch (error) {
      console.error("MusicController: Failed to start background music:", error);
      // Clear flags on error so we can retry later
      this.musicStarting = false;
      this.musicStarted = false;
    }
  }

  /**
   * Stop background music (called by WinModal before victory/defeat sounds)
   */
  public stopBackgroundMusic(fadeOut: boolean = true): void {
    if (!this.musicStarted && !this.musicStarting) return;

    this.soundManager.stopBackgroundMusic(fadeOut);
    // Reset flags when music is stopped
    this.musicStarted = false;
    this.musicStarting = false;
  }

  /**
   * Check if background music is currently playing
   */
  public isMusicPlaying(): boolean {
    return this.soundManager.isMusicPlaying();
  }

  render(): void {
    // This is a controller layer - no rendering needed
  }
}