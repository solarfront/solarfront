/**
 * MusicEngine.ts - Musical Composition Engine using Web Audio API
 * 
 * This module handles musical compositions and songs, separate from game sound effects.
 * Uses the same Web Audio API techniques as the game sounds but focused on musical content.
 * 
 * Features:
 * - Musical note generation with proper frequencies
 * - Chord progressions and harmonies
 * - Rhythm and timing systems
 * - Musical instruments simulation via oscillators
 * - Song structure management (intro, verse, chorus, etc.)
 */

export class MusicEngine {
  private audioContext: AudioContext;
  private backgroundMusic: HTMLAudioElement | null = null;
  private isInitialized: boolean = false;
  private currentVolume: number = 0.89; // Increased by 5 dB from 0.5
  
  // Musical note frequencies (A4 = 440Hz standard)
  private static readonly NOTE_FREQUENCIES = {
    'C': [65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00], // C1-C6
    'C#': [69.30, 138.59, 277.18, 554.37, 1108.73, 2217.46],
    'D': [73.42, 146.83, 293.66, 587.33, 1174.66, 2349.32],
    'D#': [77.78, 155.56, 311.13, 622.25, 1244.51, 2489.02],
    'E': [82.41, 164.81, 329.63, 659.25, 1318.51, 2637.02],
    'F': [87.31, 174.61, 349.23, 698.46, 1396.91, 2793.83],
    'F#': [92.50, 185.00, 369.99, 739.99, 1479.98, 2959.96],
    'G': [98.00, 196.00, 392.00, 783.99, 1567.98, 3135.96],
    'G#': [103.83, 207.65, 415.30, 830.61, 1661.22, 3322.44],
    'A': [110.00, 220.00, 440.00, 880.00, 1760.00, 3520.00],
    'A#': [116.54, 233.08, 466.16, 932.33, 1864.66, 3729.31],
    'B': [123.47, 246.94, 493.88, 987.77, 1975.53, 3951.07]
  };

  constructor(audioContext?: AudioContext) {
    this.audioContext = audioContext || new AudioContext();
  }

  /**
   * Initialize the music engine and preload background music
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    const timestamp = new Date().toISOString();
    const environment = (window as any).process?.env?.GAME_ENV || 'unknown';
    const audioPath = '/ambient1.mp3';

    console.log(`[MusicEngine] [${timestamp}] Initializing music engine`);
    console.log(`[MusicEngine] Environment: ${environment}`);
    console.log(`[MusicEngine] Audio path: ${audioPath}`);
    console.log(`[MusicEngine] Base URL: ${window.location.origin}`);

    try {
      // Load ambient1.mp3 for background music (served from resources folder via webpack CopyPlugin)
      console.log(`[MusicEngine] [${timestamp}] Creating Audio element for: ${audioPath}`);
      this.backgroundMusic = new Audio(audioPath);
      this.backgroundMusic.loop = true;
      this.backgroundMusic.volume = this.currentVolume;
      this.backgroundMusic.preload = 'auto';

      // Add ended event listener for loop detection
      this.backgroundMusic.addEventListener('ended', () => {
        console.log(`[MusicEngine] [${new Date().toISOString()}] \u21bb Track ended, looping back to start`);
      });

      // Add play event listener
      this.backgroundMusic.addEventListener('play', () => {
        console.log(`[MusicEngine] [${new Date().toISOString()}] \u25b6 Playback event triggered`);
      });

      // Add pause event listener
      this.backgroundMusic.addEventListener('pause', () => {
        console.log(`[MusicEngine] [${new Date().toISOString()}] \u23f8 Pause event triggered`);
      });
      
      // Wait for music to be loaded
      await new Promise((resolve, reject) => {
        if (!this.backgroundMusic) {
          const error = 'Background music not initialized';
          console.error(`[MusicEngine] [${new Date().toISOString()}] ${error}`);
          reject(new Error(error));
          return;
        }

        // Add all relevant event listeners for debugging
        this.backgroundMusic.addEventListener('loadstart', () => {
          console.log(`[MusicEngine] [${new Date().toISOString()}] Load started for ${audioPath}`);
        });

        this.backgroundMusic.addEventListener('loadedmetadata', () => {
          const duration = this.backgroundMusic?.duration || 0;
          console.log(`[MusicEngine] [${new Date().toISOString()}] Metadata loaded, duration: ${duration.toFixed(2)}s`);
        });

        this.backgroundMusic.addEventListener('canplay', () => {
          console.log(`[MusicEngine] [${new Date().toISOString()}] Can start playing (buffering sufficient)`);
        });

        this.backgroundMusic.addEventListener('canplaythrough', () => {
          const duration = this.backgroundMusic?.duration || 0;
          console.log(`[MusicEngine] [${new Date().toISOString()}] ✓ Audio loaded successfully`);
          console.log(`[MusicEngine] Duration: ${duration.toFixed(2)}s`);
          console.log(`[MusicEngine] Ready state: ${this.backgroundMusic?.readyState}`);
          console.log(`[MusicEngine] Network state: ${this.backgroundMusic?.networkState}`);
          resolve(null);
        });

        this.backgroundMusic.addEventListener('error', (e) => {
          const audio = e.target as HTMLAudioElement;
          const errorInfo = {
            code: audio.error?.code,
            message: audio.error?.message,
            path: audioPath,
            environment: environment,
            currentSrc: audio.currentSrc,
            networkState: audio.networkState,
            readyState: audio.readyState
          };

          console.error(`[MusicEngine] [${new Date().toISOString()}] ✗ Failed to load audio`);
          console.error(`[MusicEngine] Error details:`, errorInfo);
          console.error(`[MusicEngine] Possible fixes:`);
          console.error(`[MusicEngine] - Check if file exists at: ${window.location.origin}${audioPath}`);
          console.error(`[MusicEngine] - Verify webpack dev server is running on port 9000`);
          console.error(`[MusicEngine] - Check browser console Network tab for 404 errors`);
          console.error(`[MusicEngine] - Ensure 'npm run dev' copied resources to static folder`);
          reject(e);
        });

        // Load the music
        console.log(`[MusicEngine] [${new Date().toISOString()}] Starting load of ${audioPath}`);
        this.backgroundMusic.load();
      });
      
      this.isInitialized = true;
      console.log(`[MusicEngine] [${new Date().toISOString()}] ✓ Music engine initialized successfully`);
    } catch (error) {
      console.error(`[MusicEngine] [${new Date().toISOString()}] ✗ Failed to initialize music engine:`, error);
      console.error(`[MusicEngine] Music will not be available for this session`);
    }
  }

  /**
   * Get frequency for a musical note
   * @param note - Note name (C, C#, D, etc.)
   * @param octave - Octave number (1-6)
   * @returns Frequency in Hz
   */
  private getNoteFrequency(note: string, octave: number): number {
    const frequencies = MusicEngine.NOTE_FREQUENCIES[note];
    if (!frequencies || octave < 1 || octave > 6) {
      throw new Error(`Invalid note: ${note}${octave}`);
    }
    return frequencies[octave - 1];
  }

  /**
   * Play a single musical note
   * @param note - Note name (C, C#, D, etc.)
   * @param octave - Octave number (1-6)
   * @param duration - Duration in seconds
   * @param volume - Volume (0-1)
   * @param waveType - Oscillator type
   * @param startTime - When to start (default: now)
   */
  public playNote(
    note: string, 
    octave: number, 
    duration: number, 
    volume: number = 0.5,
    waveType: OscillatorType = 'sine',
    startTime?: number
  ): void {
    const now = startTime || this.audioContext.currentTime;
    const frequency = this.getNoteFrequency(note, octave);
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.type = waveType;
    oscillator.frequency.setValueAtTime(frequency, now);
    
    // ADSR envelope for musical note
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Attack
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.8, now + 0.1); // Decay
    gainNode.gain.setValueAtTime(volume * 0.8, now + duration - 0.1); // Sustain
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration); // Release
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  /**
   * Play a chord (multiple notes simultaneously)
   * @param notes - Array of note objects {note: string, octave: number}
   * @param duration - Duration in seconds
   * @param volume - Volume (0-1)
   * @param waveType - Oscillator type
   * @param startTime - When to start (default: now)
   */
  public playChord(
    notes: Array<{note: string, octave: number}>,
    duration: number,
    volume: number = 0.5,
    waveType: OscillatorType = 'sine',
    startTime?: number
  ): void {
    const chordVolume = volume / notes.length; // Reduce volume per note to prevent clipping
    notes.forEach(({note, octave}) => {
      this.playNote(note, octave, duration, chordVolume, waveType, startTime);
    });
  }

  /**
   * PLACEHOLDER: Play Cool Music (to be implemented based on MP3 analysis)
   * This method will recreate the coolmusic.mp3 using Web Audio API
   * @param volume - Volume (0-1)
   */
  public playCoolMusic(volume: number = 0.5): void {
    // TODO: Implement based on musical analysis of coolmusic.mp3
    // This is a placeholder that plays a simple test sequence
    
    const now = this.audioContext.currentTime;
    
    // Example: Simple C major scale as placeholder
    const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
    const octave = 4;
    const noteDuration = 0.5;
    
    notes.forEach((note, index) => {
      this.playNote(note, octave, noteDuration, volume, 'sine', now + (index * noteDuration));
    });
    
    console.log('Playing placeholder Cool Music - C major scale');
    console.log('TODO: Replace with actual song recreation from coolmusic.mp3');
  }

  /**
   * Play background music (ambient1.mp3)
   */
  public async playBackgroundMusic(): Promise<void> {
    const timestamp = new Date().toISOString();

    if (!this.isInitialized || !this.backgroundMusic) {
      console.warn(`[MusicEngine] [${timestamp}] Cannot play - engine not initialized`);
      console.warn(`[MusicEngine] Initialized: ${this.isInitialized}, Audio element: ${!!this.backgroundMusic}`);
      return;
    }

    try {
      console.log(`[MusicEngine] [${timestamp}] Attempting to play background music`);
      console.log(`[MusicEngine] Current time: ${this.backgroundMusic.currentTime}s`);
      console.log(`[MusicEngine] Volume: ${this.backgroundMusic.volume}`);
      console.log(`[MusicEngine] Loop: ${this.backgroundMusic.loop}`);
      console.log(`[MusicEngine] Ready state: ${this.backgroundMusic.readyState}`);

      this.backgroundMusic.currentTime = 0; // Start from beginning
      await this.backgroundMusic.play();

      console.log(`[MusicEngine] [${timestamp}] ♫ Background music started playing`);
      console.log(`[MusicEngine] Duration: ${this.backgroundMusic.duration?.toFixed(2)}s`);
    } catch (error: any) {
      console.error(`[MusicEngine] [${timestamp}] ✗ Failed to play background music:`, error);
      console.error(`[MusicEngine] Error name: ${error?.name}`);
      console.error(`[MusicEngine] Error message: ${error?.message}`);

      if (error?.name === 'NotAllowedError') {
        console.error(`[MusicEngine] Browser autoplay policy blocked playback`);
        console.error(`[MusicEngine] User interaction required before playing audio`);
      }
    }
  }

  /**
   * Stop background music with fade out
   */
  public stopBackgroundMusic(fadeOut: boolean = true): void {
    if (!this.backgroundMusic) return;

    const timestamp = new Date().toISOString();

    if (fadeOut) {
      console.log(`[MusicEngine] [${timestamp}] Stopping music with fade out`);
      // Fade out over 1 second
      const fadeOutInterval = 50; // ms
      const fadeSteps = 1000 / fadeOutInterval; // 20 steps over 1 second
      const volumeStep = this.backgroundMusic.volume / fadeSteps;

      const fadeInterval = setInterval(() => {
        if (!this.backgroundMusic) {
          clearInterval(fadeInterval);
          return;
        }

        this.backgroundMusic.volume -= volumeStep;

        if (this.backgroundMusic.volume <= 0) {
          clearInterval(fadeInterval);
          this.backgroundMusic.pause();
          this.backgroundMusic.volume = this.currentVolume; // Reset volume for next play
          console.log(`[MusicEngine] [${new Date().toISOString()}] ■ Music stopped (fade out complete)`);
        }
      }, fadeOutInterval);
    } else {
      this.backgroundMusic.pause();
      console.log(`[MusicEngine] [${timestamp}] ■ Music stopped immediately`);
    }
  }

  /**
   * Pause background music
   */
  public pauseBackgroundMusic(): void {
    if (!this.backgroundMusic) return;

    const timestamp = new Date().toISOString();
    this.backgroundMusic.pause();
    console.log(`[MusicEngine] [${timestamp}] ⏸ Music paused at ${this.backgroundMusic.currentTime.toFixed(2)}s`);
  }

  /**
   * Resume background music
   */
  public resumeBackgroundMusic(): void {
    if (!this.backgroundMusic) return;

    const timestamp = new Date().toISOString();

    try {
      this.backgroundMusic.play();
      console.log(`[MusicEngine] [${timestamp}] ▶ Music resumed from ${this.backgroundMusic.currentTime.toFixed(2)}s`);
    } catch (error) {
      console.error(`[MusicEngine] [${timestamp}] Failed to resume music:`, error);
    }
  }

  /**
   * Set music volume (0-1)
   */
  public setVolume(volume: number): void {
    const oldVolume = this.currentVolume;
    this.currentVolume = Math.max(0, Math.min(1, volume));

    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.currentVolume;
      console.log(`[MusicEngine] [${new Date().toISOString()}] Volume changed: ${oldVolume.toFixed(2)} → ${this.currentVolume.toFixed(2)}`);
    }
  }

  /**
   * Check if background music is playing
   */
  public isPlaying(): boolean {
    return this.backgroundMusic ? !this.backgroundMusic.paused : false;
  }

  /**
   * Get the audio context (useful for timing coordination)
   */
  public getAudioContext(): AudioContext {
    return this.audioContext;
  }
}