/**
 * Web Audio API Sound Effects for SolarFront
 * Pure synthesized sounds using oscillators, filters, and noise generators
 */

export class WebAudioSounds {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  /**
   * Ensures audio context is running (needed for user interaction)
   */
  public async init(): Promise<void> {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * NUKE EXPLOSION SOUND
   * Multi-layered explosion with rumble, blast, and debris
   */
  public playNukeExplosion(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // 1. Initial blast - white noise burst
    const blastNoise = this.createNoiseBuffer(2);
    const blastSource = this.audioContext.createBufferSource();
    blastSource.buffer = blastNoise;
    
    const blastGain = this.audioContext.createGain();
    const blastFilter = this.audioContext.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.setValueAtTime(8000, now);
    blastFilter.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    
    blastGain.gain.setValueAtTime(1, now);
    blastGain.gain.exponentialRampToValueAtTime(0.3, now + 0.1);
    blastGain.gain.exponentialRampToValueAtTime(0.01, now + 2);
    
    blastSource.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(masterGain);
    blastSource.start(now);
    blastSource.stop(now + 2);

    // 2. Sub-bass rumble
    const rumbleOsc = this.audioContext.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(30, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(20, now + 1.5);
    
    const rumbleGain = this.audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0, now);
    rumbleGain.gain.linearRampToValueAtTime(0.8, now + 0.05);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 3);
    
    const rumbleDistortion = this.audioContext.createWaveShaper();
    rumbleDistortion.curve = this.makeDistortionCurve(20) as any;
    
    rumbleOsc.connect(rumbleDistortion);
    rumbleDistortion.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(now);
    rumbleOsc.stop(now + 3);

    // 3. Impact thud
    const impactOsc = this.audioContext.createOscillator();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(150, now);
    impactOsc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    
    const impactGain = this.audioContext.createGain();
    impactGain.gain.setValueAtTime(0.6, now);
    impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    impactOsc.connect(impactGain);
    impactGain.connect(masterGain);
    impactOsc.start(now);
    impactOsc.stop(now + 0.3);

    // 4. High frequency debris/shockwave
    const debrisOsc = this.audioContext.createOscillator();
    debrisOsc.type = 'triangle';
    debrisOsc.frequency.setValueAtTime(2000, now + 0.1);
    debrisOsc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
    
    const debrisGain = this.audioContext.createGain();
    debrisGain.gain.setValueAtTime(0, now);
    debrisGain.gain.linearRampToValueAtTime(0.2, now + 0.1);
    debrisGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    
    const debrisFilter = this.audioContext.createBiquadFilter();
    debrisFilter.type = 'highpass';
    debrisFilter.frequency.value = 1000;
    debrisFilter.Q.value = 10;
    
    debrisOsc.connect(debrisFilter);
    debrisFilter.connect(debrisGain);
    debrisGain.connect(masterGain);
    debrisOsc.start(now);
    debrisOsc.stop(now + 1.5);
  }

  /**
   * BUILDING CONSTRUCTION SOUND
   * Mechanical/industrial construction noise with hammering and machinery
   */
  public playBuildingConstruction(volume: number = 0.5): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // 1. Machinery drone
    const droneOsc = this.audioContext.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.setValueAtTime(60, now);
    
    const droneGain = this.audioContext.createGain();
    droneGain.gain.setValueAtTime(0, now);
    droneGain.gain.linearRampToValueAtTime(0.2, now + 0.1);
    droneGain.gain.setValueAtTime(0.2, now + 0.8);
    droneGain.gain.linearRampToValueAtTime(0, now + 1);
    
    const droneFilter = this.audioContext.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 200;
    
    droneOsc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(masterGain);
    droneOsc.start(now);
    droneOsc.stop(now + 1);

    // 2. Hammer impacts (3 hits)
    for (let i = 0; i < 3; i++) {
      const hitTime = now + 0.15 + (i * 0.25);
      
      // Impact sound
      const hammerOsc = this.audioContext.createOscillator();
      hammerOsc.type = 'square';
      hammerOsc.frequency.setValueAtTime(150 - (i * 20), hitTime);
      hammerOsc.frequency.exponentialRampToValueAtTime(50, hitTime + 0.05);
      
      const hammerGain = this.audioContext.createGain();
      hammerGain.gain.setValueAtTime(0.4, hitTime);
      hammerGain.gain.exponentialRampToValueAtTime(0.01, hitTime + 0.1);
      
      // Add metallic ring
      const ringOsc = this.audioContext.createOscillator();
      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(800 + (i * 100), hitTime);
      
      const ringGain = this.audioContext.createGain();
      ringGain.gain.setValueAtTime(0.15, hitTime);
      ringGain.gain.exponentialRampToValueAtTime(0.01, hitTime + 0.2);
      
      hammerOsc.connect(hammerGain);
      hammerGain.connect(masterGain);
      hammerOsc.start(hitTime);
      hammerOsc.stop(hitTime + 0.1);
      
      ringOsc.connect(ringGain);
      ringGain.connect(masterGain);
      ringOsc.start(hitTime);
      ringOsc.stop(hitTime + 0.2);
    }

    // 3. Construction noise texture
    const noise = this.createNoiseBuffer(1);
    const noiseSource = this.audioContext.createBufferSource();
    noiseSource.buffer = noise;
    
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.setValueAtTime(0.05, now + 0.8);
    noiseGain.gain.linearRampToValueAtTime(0, now + 1);
    
    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    noiseFilter.Q.value = 2;
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + 1);
  }

  /**
   * BUILDING COMPLETE SOUND
   * Triumphant completion chime with harmonic progression
   */
  public playBuildingComplete(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Musical notes for completion fanfare (C major chord arpeggio)
    const notes = [
      { freq: 261.63, time: 0 },      // C4
      { freq: 329.63, time: 0.08 },    // E4
      { freq: 392.00, time: 0.16 },    // G4
      { freq: 523.25, time: 0.24 },    // C5
      { freq: 659.25, time: 0.32 },    // E5
    ];

    // Main chime melody
    notes.forEach((note, index) => {
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.freq;
      
      const oscGain = this.audioContext.createGain();
      const startTime = now + note.time;
      
      // ADSR envelope
      oscGain.gain.setValueAtTime(0, startTime);
      oscGain.gain.linearRampToValueAtTime(0.3, startTime + 0.02); // Attack
      oscGain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.1); // Decay
      oscGain.gain.setValueAtTime(0.15, startTime + 0.3); // Sustain
      oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.8); // Release
      
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + 0.8);

      // Add harmonic overtone
      const harmonicOsc = this.audioContext.createOscillator();
      harmonicOsc.type = 'triangle';
      harmonicOsc.frequency.value = note.freq * 2;
      
      const harmonicGain = this.audioContext.createGain();
      harmonicGain.gain.setValueAtTime(0, startTime);
      harmonicGain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
      harmonicGain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
      
      harmonicOsc.connect(harmonicGain);
      harmonicGain.connect(masterGain);
      harmonicOsc.start(startTime);
      harmonicOsc.stop(startTime + 0.5);
    });

    // Add a subtle "sparkle" effect at the end
    const sparkleTime = now + 0.4;
    const sparkleOsc = this.audioContext.createOscillator();
    sparkleOsc.type = 'sine';
    sparkleOsc.frequency.setValueAtTime(2093.00, sparkleTime); // C7
    sparkleOsc.frequency.exponentialRampToValueAtTime(4186.01, sparkleTime + 0.2); // C8
    
    const sparkleGain = this.audioContext.createGain();
    sparkleGain.gain.setValueAtTime(0.1, sparkleTime);
    sparkleGain.gain.exponentialRampToValueAtTime(0.01, sparkleTime + 0.3);
    
    const sparkleFilter = this.audioContext.createBiquadFilter();
    sparkleFilter.type = 'highpass';
    sparkleFilter.frequency.value = 2000;
    sparkleFilter.Q.value = 5;
    
    sparkleOsc.connect(sparkleFilter);
    sparkleFilter.connect(sparkleGain);
    sparkleGain.connect(masterGain);
    sparkleOsc.start(sparkleTime);
    sparkleOsc.stop(sparkleTime + 0.3);

    // Bass foundation note
    const bassOsc = this.audioContext.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 130.81; // C3
    
    const bassGain = this.audioContext.createGain();
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    bassGain.gain.setValueAtTime(0.15, now + 0.5);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
    
    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start(now);
    bassOsc.stop(now + 1);
  }

  /**
   * Helper: Create white noise buffer
   */
  private createNoiseBuffer(duration: number): AudioBuffer {
    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }

  /**
   * Helper: Create distortion curve for wave shaping
   */
  private makeDistortionCurve(amount: number): Float32Array {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    
    return curve;
  }

  /**
   * ATTACK LAUNCH SOUND
   * Whoosh/energy discharge for initiating attacks
   */
  public playAttackLaunch(volume: number = 0.5): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Energy buildup - rising oscillator
    const energyOsc = this.audioContext.createOscillator();
    energyOsc.type = 'sawtooth';
    energyOsc.frequency.setValueAtTime(200, now);
    energyOsc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    
    const energyGain = this.audioContext.createGain();
    energyGain.gain.setValueAtTime(0, now);
    energyGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    energyGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    const energyFilter = this.audioContext.createBiquadFilter();
    energyFilter.type = 'highpass';
    energyFilter.frequency.setValueAtTime(300, now);
    energyFilter.frequency.linearRampToValueAtTime(100, now + 0.4);
    
    energyOsc.connect(energyFilter);
    energyFilter.connect(energyGain);
    energyGain.connect(masterGain);
    energyOsc.start(now);
    energyOsc.stop(now + 0.4);

    // Whoosh wind effect
    const whooshNoise = this.createNoiseBuffer(0.6);
    const whooshSource = this.audioContext.createBufferSource();
    whooshSource.buffer = whooshNoise;
    
    const whooshGain = this.audioContext.createGain();
    whooshGain.gain.setValueAtTime(0, now + 0.1);
    whooshGain.gain.linearRampToValueAtTime(0.2, now + 0.2);
    whooshGain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    
    const whooshFilter = this.audioContext.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.frequency.setValueAtTime(2000, now + 0.1);
    whooshFilter.frequency.exponentialRampToValueAtTime(500, now + 0.7);
    whooshFilter.Q.value = 3;
    
    whooshSource.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshSource.start(now + 0.1);
    whooshSource.stop(now + 0.7);
  }

  /**
   * IMPACT HIT SOUND
   * Sharp impact when attacks land on territories
   */
  public playImpactHit(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Sharp impact transient
    const impactOsc = this.audioContext.createOscillator();
    impactOsc.type = 'square';
    impactOsc.frequency.setValueAtTime(120, now);
    impactOsc.frequency.exponentialRampToValueAtTime(60, now + 0.1);
    
    const impactGain = this.audioContext.createGain();
    impactGain.gain.setValueAtTime(0.8, now);
    impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    impactOsc.connect(impactGain);
    impactGain.connect(masterGain);
    impactOsc.start(now);
    impactOsc.stop(now + 0.15);

    // Metallic clang
    const clangOsc = this.audioContext.createOscillator();
    clangOsc.type = 'triangle';
    clangOsc.frequency.setValueAtTime(1500, now);
    clangOsc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    
    const clangGain = this.audioContext.createGain();
    clangGain.gain.setValueAtTime(0.4, now);
    clangGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    const clangFilter = this.audioContext.createBiquadFilter();
    clangFilter.type = 'bandpass';
    clangFilter.frequency.value = 1200;
    clangFilter.Q.value = 8;
    
    clangOsc.connect(clangFilter);
    clangFilter.connect(clangGain);
    clangGain.connect(masterGain);
    clangOsc.start(now);
    clangOsc.stop(now + 0.3);

    // Impact debris
    const debrisNoise = this.createNoiseBuffer(0.4);
    const debrisSource = this.audioContext.createBufferSource();
    debrisSource.buffer = debrisNoise;
    
    const debrisGain = this.audioContext.createGain();
    debrisGain.gain.setValueAtTime(0.15, now);
    debrisGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    const debrisFilter = this.audioContext.createBiquadFilter();
    debrisFilter.type = 'highpass';
    debrisFilter.frequency.value = 3000;
    debrisFilter.Q.value = 2;
    
    debrisSource.connect(debrisFilter);
    debrisFilter.connect(debrisGain);
    debrisGain.connect(masterGain);
    debrisSource.start(now);
    debrisSource.stop(now + 0.4);
  }

  /**
   * TACTICAL RETREAT SOUND
   * Declining pitch sweep for withdrawals
   */
  public playTacticalRetreat(volume: number = 0.4): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Declining sweep
    const sweepOsc = this.audioContext.createOscillator();
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(800, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(200, now + 1.2);
    
    const sweepGain = this.audioContext.createGain();
    sweepGain.gain.setValueAtTime(0, now);
    sweepGain.gain.linearRampToValueAtTime(0.3, now + 0.1);
    sweepGain.gain.setValueAtTime(0.25, now + 0.8);
    sweepGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    
    const sweepFilter = this.audioContext.createBiquadFilter();
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.setValueAtTime(1200, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(300, now + 1.5);
    sweepFilter.Q.value = 4;
    
    sweepOsc.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(masterGain);
    sweepOsc.start(now);
    sweepOsc.stop(now + 1.5);

    // Doppler effect simulation
    for (let i = 0; i < 4; i++) {
      const dopplerTime = now + 0.2 + (i * 0.15);
      const dopplerOsc = this.audioContext.createOscillator();
      dopplerOsc.type = 'triangle';
      dopplerOsc.frequency.setValueAtTime(600 - (i * 50), dopplerTime);
      dopplerOsc.frequency.exponentialRampToValueAtTime(400 - (i * 30), dopplerTime + 0.1);
      
      const dopplerGain = this.audioContext.createGain();
      dopplerGain.gain.setValueAtTime(0.1 - (i * 0.02), dopplerTime);
      dopplerGain.gain.exponentialRampToValueAtTime(0.01, dopplerTime + 0.2);
      
      dopplerOsc.connect(dopplerGain);
      dopplerGain.connect(masterGain);
      dopplerOsc.start(dopplerTime);
      dopplerOsc.stop(dopplerTime + 0.2);
    }
  }

  /**
   * VICTORY SOUND
   * Triumphant chord progression for successful attacks
   */
  public playVictory(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Triumphant chord progression (C Major -> F Major -> G Major -> C Major)
    const chords = [
      { notes: [261.63, 329.63, 392.00], time: 0 },      // C Major
      { notes: [349.23, 440.00, 523.25], time: 0.3 },    // F Major
      { notes: [392.00, 493.88, 587.33], time: 0.6 },    // G Major
      { notes: [523.25, 659.25, 783.99], time: 0.9 },    // C Major (octave up)
    ];

    chords.forEach((chord, chordIndex) => {
      chord.notes.forEach((freq, noteIndex) => {
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        
        const oscGain = this.audioContext.createGain();
        const startTime = now + chord.time;
        const sustainTime = 0.4;
        
        oscGain.gain.setValueAtTime(0, startTime);
        oscGain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
        oscGain.gain.setValueAtTime(0.15, startTime + sustainTime);
        oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + sustainTime + 0.2);
        
        // Add brightness with harmonics
        const harmonicOsc = this.audioContext.createOscillator();
        harmonicOsc.type = 'triangle';
        harmonicOsc.frequency.value = freq * 2;
        
        const harmonicGain = this.audioContext.createGain();
        harmonicGain.gain.setValueAtTime(0, startTime);
        harmonicGain.gain.linearRampToValueAtTime(0.08, startTime + 0.05);
        harmonicGain.gain.exponentialRampToValueAtTime(0.01, startTime + sustainTime);
        
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start(startTime);
        osc.stop(startTime + sustainTime + 0.2);
        
        harmonicOsc.connect(harmonicGain);
        harmonicGain.connect(masterGain);
        harmonicOsc.start(startTime);
        harmonicOsc.stop(startTime + sustainTime);
      });
    });

    // Add crescendo effect
    const crescendoTime = now + 1.2;
    const crescendoOsc = this.audioContext.createOscillator();
    crescendoOsc.type = 'sine';
    crescendoOsc.frequency.value = 1046.50; // C6
    
    const crescendoGain = this.audioContext.createGain();
    crescendoGain.gain.setValueAtTime(0, crescendoTime);
    crescendoGain.gain.linearRampToValueAtTime(0.3, crescendoTime + 0.1);
    crescendoGain.gain.exponentialRampToValueAtTime(0.01, crescendoTime + 0.8);
    
    crescendoOsc.connect(crescendoGain);
    crescendoGain.connect(masterGain);
    crescendoOsc.start(crescendoTime);
    crescendoOsc.stop(crescendoTime + 0.8);
  }

  /**
   * DEFEAT SOUND
   * Minor key descending notes for failed attacks
   */
  public playDefeat(volume: number = 0.5): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Descending minor scale (A minor)
    const notes = [
      { freq: 440.00, time: 0 },      // A4
      { freq: 392.00, time: 0.2 },    // G4
      { freq: 349.23, time: 0.4 },    // F4
      { freq: 329.63, time: 0.6 },    // E4
      { freq: 293.66, time: 0.8 },    // D4
      { freq: 261.63, time: 1.0 },    // C4
      { freq: 220.00, time: 1.2 },    // A3
    ];

    notes.forEach((note, index) => {
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.freq;
      
      const oscGain = this.audioContext.createGain();
      const startTime = now + note.time;
      const duration = 0.3 + (index * 0.05); // Each note gets progressively longer
      
      oscGain.gain.setValueAtTime(0, startTime);
      oscGain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      oscGain.gain.exponentialRampToValueAtTime(0.1, startTime + 0.1);
      oscGain.gain.setValueAtTime(0.08, startTime + duration - 0.1);
      oscGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      // Add subtle distortion for sadness
      const sadnessFilter = this.audioContext.createBiquadFilter();
      sadnessFilter.type = 'lowpass';
      sadnessFilter.frequency.value = note.freq * 1.5;
      sadnessFilter.Q.value = 2;
      
      osc.connect(sadnessFilter);
      sadnessFilter.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    });

    // Add final low rumble of defeat
    const rumbleTime = now + 1.5;
    const rumbleOsc = this.audioContext.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(110, rumbleTime); // A2
    rumbleOsc.frequency.exponentialRampToValueAtTime(55, rumbleTime + 1);
    
    const rumbleGain = this.audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0, rumbleTime);
    rumbleGain.gain.linearRampToValueAtTime(0.15, rumbleTime + 0.1);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, rumbleTime + 1.5);
    
    const rumbleFilter = this.audioContext.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 200;
    
    rumbleOsc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(rumbleTime);
    rumbleOsc.stop(rumbleTime + 1.5);
  }

  /**
   * SPACE PORT BUILDING SOUND
   * Industrial dock operations and mechanical systems
   */
  public playSpacePort(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Mechanical systems hum (now starts immediately)
    const mechTime = now;
    const mechOsc = this.audioContext.createOscillator();
    mechOsc.type = 'sawtooth';
    mechOsc.frequency.value = 80;
    
    const mechGain = this.audioContext.createGain();
    mechGain.gain.setValueAtTime(0.1, mechTime);
    mechGain.gain.setValueAtTime(0.15, mechTime + 0.5);
    mechGain.gain.exponentialRampToValueAtTime(0.01, mechTime + 1.5);
    
    const mechFilter = this.audioContext.createBiquadFilter();
    mechFilter.type = 'lowpass';
    mechFilter.frequency.value = 200;
    
    mechOsc.connect(mechFilter);
    mechFilter.connect(mechGain);
    mechGain.connect(masterGain);
    mechOsc.start(mechTime);
    mechOsc.stop(mechTime + 1.5);

    // Airlock cycling (moved earlier)
    const airlockTime = now + 0.6;
    const airlockNoise = this.createNoiseBuffer(0.3);
    const airlockSource = this.audioContext.createBufferSource();
    airlockSource.buffer = airlockNoise;
    
    const airlockGain = this.audioContext.createGain();
    airlockGain.gain.setValueAtTime(0.08, airlockTime);
    airlockGain.gain.exponentialRampToValueAtTime(0.01, airlockTime + 0.5);
    
    const airlockFilter = this.audioContext.createBiquadFilter();
    airlockFilter.type = 'bandpass';
    airlockFilter.frequency.value = 800;
    airlockFilter.Q.value = 2;
    
    airlockSource.connect(airlockFilter);
    airlockFilter.connect(airlockGain);
    airlockGain.connect(masterGain);
    airlockSource.start(airlockTime);
    airlockSource.stop(airlockTime + 0.5);
  }

  /**
   * SPACE PORT VIPER SHIP
   * Fast, agile fighter ship launch
   */
  public playSpacePortViper(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Fast departure swoosh (now starts immediately)
    const swooshTime = now;
    const swooshNoise = this.createNoiseBuffer(0.6);
    const swooshSource = this.audioContext.createBufferSource();
    swooshSource.buffer = swooshNoise;
    
    const swooshGain = this.audioContext.createGain();
    swooshGain.gain.setValueAtTime(0.4, swooshTime);
    swooshGain.gain.exponentialRampToValueAtTime(0.01, swooshTime + 0.6);
    
    const swooshFilter = this.audioContext.createBiquadFilter();
    swooshFilter.type = 'bandpass';
    swooshFilter.frequency.setValueAtTime(2000, swooshTime);
    swooshFilter.frequency.exponentialRampToValueAtTime(800, swooshTime + 0.6);
    swooshFilter.Q.value = 5;
    
    swooshSource.connect(swooshFilter);
    swooshFilter.connect(swooshGain);
    swooshGain.connect(masterGain);
    swooshSource.start(swooshTime);
    swooshSource.stop(swooshTime + 0.6);

    // Sharp doppler effect (moved earlier since no engine spool)
    const dopplerOsc = this.audioContext.createOscillator();
    dopplerOsc.type = 'triangle';
    dopplerOsc.frequency.setValueAtTime(1200, now + 0.4);
    dopplerOsc.frequency.exponentialRampToValueAtTime(400, now + 0.8);
    
    const dopplerGain = this.audioContext.createGain();
    dopplerGain.gain.setValueAtTime(0.2, now + 0.4);
    dopplerGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    
    dopplerOsc.connect(dopplerGain);
    dopplerGain.connect(masterGain);
    dopplerOsc.start(now + 0.4);
    dopplerOsc.stop(now + 0.8);
  }

  /**
   * SPACE PORT CONDOR SHIP
   * Heavy destroyer launch with powerful engines
   */
  public playSpacePortCondor(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Deep engine rumble buildup
    const rumbleOsc = this.audioContext.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(40, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(120, now + 1);
    
    const rumbleGain = this.audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0.4, now);
    rumbleGain.gain.setValueAtTime(0.6, now + 1);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 2);
    
    const rumbleFilter = this.audioContext.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 200;
    
    rumbleOsc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(now);
    rumbleOsc.stop(now + 2);

    // Heavy engine ignition
    const ignitionTime = now + 1.2;
    const ignitionOsc = this.audioContext.createOscillator();
    ignitionOsc.type = 'square';
    ignitionOsc.frequency.value = 80;
    
    const ignitionGain = this.audioContext.createGain();
    ignitionGain.gain.setValueAtTime(0.8, ignitionTime);
    ignitionGain.gain.exponentialRampToValueAtTime(0.01, ignitionTime + 1);
    
    ignitionOsc.connect(ignitionGain);
    ignitionGain.connect(masterGain);
    ignitionOsc.start(ignitionTime);
    ignitionOsc.stop(ignitionTime + 1);

    // Slow, powerful departure
    const departTime = now + 2;
    const departNoise = this.createNoiseBuffer(1.5);
    const departSource = this.audioContext.createBufferSource();
    departSource.buffer = departNoise;
    
    const departGain = this.audioContext.createGain();
    departGain.gain.setValueAtTime(0.3, departTime);
    departGain.gain.setValueAtTime(0.2, departTime + 0.8);
    departGain.gain.exponentialRampToValueAtTime(0.01, departTime + 1.5);
    
    const departFilter = this.audioContext.createBiquadFilter();
    departFilter.type = 'lowpass';
    departFilter.frequency.setValueAtTime(600, departTime);
    departFilter.frequency.exponentialRampToValueAtTime(200, departTime + 1.5);
    
    departSource.connect(departFilter);
    departFilter.connect(departGain);
    departGain.connect(masterGain);
    departSource.start(departTime);
    departSource.stop(departTime + 1.5);

    // Low doppler fade
    const dopplerOsc = this.audioContext.createOscillator();
    dopplerOsc.type = 'sine';
    dopplerOsc.frequency.setValueAtTime(300, now + 3);
    dopplerOsc.frequency.exponentialRampToValueAtTime(100, now + 4);
    
    const dopplerGain = this.audioContext.createGain();
    dopplerGain.gain.setValueAtTime(0.15, now + 3);
    dopplerGain.gain.exponentialRampToValueAtTime(0.01, now + 4);
    
    dopplerOsc.connect(dopplerGain);
    dopplerGain.connect(masterGain);
    dopplerOsc.start(now + 3);
    dopplerOsc.stop(now + 4);
  }

  /**
   * COLONY SOUND
   * Ambient life support and habitation systems
   */
  public playColony(volume: number = 0.4): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Life support hum
    const lifeOsc = this.audioContext.createOscillator();
    lifeOsc.type = 'sine';
    lifeOsc.frequency.setValueAtTime(180, now);
    lifeOsc.frequency.setValueAtTime(185, now + 1);
    lifeOsc.frequency.setValueAtTime(175, now + 2);
    
    const lifeGain = this.audioContext.createGain();
    lifeGain.gain.setValueAtTime(0, now);
    lifeGain.gain.linearRampToValueAtTime(0.2, now + 0.3);
    lifeGain.gain.setValueAtTime(0.18, now + 2.5);
    lifeGain.gain.exponentialRampToValueAtTime(0.01, now + 3);
    
    const lifeFilter = this.audioContext.createBiquadFilter();
    lifeFilter.type = 'lowpass';
    lifeFilter.frequency.value = 400;
    
    lifeOsc.connect(lifeFilter);
    lifeFilter.connect(lifeGain);
    lifeGain.connect(masterGain);
    lifeOsc.start(now);
    lifeOsc.stop(now + 3);

    // Atmospheric processing cycles
    for (let i = 0; i < 3; i++) {
      const cycleTime = now + 0.8 + (i * 0.7);
      
      const cycleOsc = this.audioContext.createOscillator();
      cycleOsc.type = 'triangle';
      cycleOsc.frequency.setValueAtTime(320, cycleTime);
      cycleOsc.frequency.linearRampToValueAtTime(360, cycleTime + 0.3);
      cycleOsc.frequency.linearRampToValueAtTime(300, cycleTime + 0.5);
      
      const cycleGain = this.audioContext.createGain();
      cycleGain.gain.setValueAtTime(0.1, cycleTime);
      cycleGain.gain.linearRampToValueAtTime(0.15, cycleTime + 0.2);
      cycleGain.gain.exponentialRampToValueAtTime(0.01, cycleTime + 0.6);
      
      cycleOsc.connect(cycleGain);
      cycleGain.connect(masterGain);
      cycleOsc.start(cycleTime);
      cycleOsc.stop(cycleTime + 0.6);
    }

    // Gentle population activity sounds
    const activityNoise = this.createNoiseBuffer(2.5);
    const activitySource = this.audioContext.createBufferSource();
    activitySource.buffer = activityNoise;
    
    const activityGain = this.audioContext.createGain();
    activityGain.gain.setValueAtTime(0.03, now + 0.5);
    activityGain.gain.setValueAtTime(0.025, now + 2.8);
    activityGain.gain.exponentialRampToValueAtTime(0.01, now + 3.2);
    
    const activityFilter = this.audioContext.createBiquadFilter();
    activityFilter.type = 'bandpass';
    activityFilter.frequency.value = 800;
    activityFilter.Q.value = 0.8;
    
    activitySource.connect(activityFilter);
    activityFilter.connect(activityGain);
    activityGain.connect(masterGain);
    activitySource.start(now + 0.5);
    activitySource.stop(now + 3.2);

    // Peaceful harmony chime
    const harmonyTime = now + 2.8;
    const chimeOsc = this.audioContext.createOscillator();
    chimeOsc.type = 'sine';
    chimeOsc.frequency.value = 523.25; // C5
    
    const chimeGain = this.audioContext.createGain();
    chimeGain.gain.setValueAtTime(0.12, harmonyTime);
    chimeGain.gain.exponentialRampToValueAtTime(0.01, harmonyTime + 0.8);
    
    chimeOsc.connect(chimeGain);
    chimeGain.connect(masterGain);
    chimeOsc.start(harmonyTime);
    chimeOsc.stop(harmonyTime + 0.8);
  }

  /**
   * DEFENSE POST SOUND
   * Calm defensive monitoring system with subtle protection tones
   */
  public playDefensePost(volume: number = 0.5): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Gentle surveillance hum
    const humOsc = this.audioContext.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 120;
    
    const humGain = this.audioContext.createGain();
    humGain.gain.setValueAtTime(0.08, now);
    humGain.gain.setValueAtTime(0.12, now + 1);
    humGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);
    
    const humFilter = this.audioContext.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 300;
    
    humOsc.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(masterGain);
    humOsc.start(now);
    humOsc.stop(now + 2.5);

    // Soft protective shield activation
    const shieldOsc = this.audioContext.createOscillator();
    shieldOsc.type = 'sine';
    shieldOsc.frequency.setValueAtTime(400, now + 0.5);
    shieldOsc.frequency.exponentialRampToValueAtTime(600, now + 1.5);
    shieldOsc.frequency.exponentialRampToValueAtTime(400, now + 2.5);
    
    const shieldGain = this.audioContext.createGain();
    shieldGain.gain.setValueAtTime(0.1, now + 0.5);
    shieldGain.gain.setValueAtTime(0.08, now + 1.5);
    shieldGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);
    
    shieldOsc.connect(shieldGain);
    shieldGain.connect(masterGain);
    shieldOsc.start(now + 0.5);
    shieldOsc.stop(now + 2.5);

    // Confirmation beeps (reassuring, not alarming)
    const confirmTimes = [1.2, 1.8];
    confirmTimes.forEach((time, index) => {
      const confirmOsc = this.audioContext.createOscillator();
      confirmOsc.type = 'sine';
      confirmOsc.frequency.value = 800 - (index * 50); // Descending, calming
      
      const confirmGain = this.audioContext.createGain();
      confirmGain.gain.setValueAtTime(0.12, now + time);
      confirmGain.gain.exponentialRampToValueAtTime(0.01, now + time + 0.2);
      
      confirmOsc.connect(confirmGain);
      confirmGain.connect(masterGain);
      confirmOsc.start(now + time);
      confirmOsc.stop(now + time + 0.2);
    });

    // Subtle barrier field
    const fieldTime = now + 2.8;
    const fieldNoise = this.createNoiseBuffer(0.3);
    const fieldSource = this.audioContext.createBufferSource();
    fieldSource.buffer = fieldNoise;
    
    const fieldGain = this.audioContext.createGain();
    fieldGain.gain.setValueAtTime(0.04, fieldTime);
    fieldGain.gain.exponentialRampToValueAtTime(0.01, fieldTime + 0.4);
    
    const fieldFilter = this.audioContext.createBiquadFilter();
    fieldFilter.type = 'bandpass';
    fieldFilter.frequency.value = 1200;
    fieldFilter.Q.value = 1;
    
    fieldSource.connect(fieldFilter);
    fieldFilter.connect(fieldGain);
    fieldGain.connect(masterGain);
    fieldSource.start(fieldTime);
    fieldSource.stop(fieldTime + 0.4);
  }

  /**
   * ORBITAL CANNON CHARGE UP
   * Energy buildup and targeting sequence
   */
  public playOrbitalCannon(volume: number = 0.8): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Massive energy buildup
    const buildupOsc = this.audioContext.createOscillator();
    buildupOsc.type = 'sawtooth';
    buildupOsc.frequency.setValueAtTime(50, now);
    buildupOsc.frequency.exponentialRampToValueAtTime(150, now + 1.5);
    
    const buildupGain = this.audioContext.createGain();
    buildupGain.gain.setValueAtTime(0, now);
    buildupGain.gain.linearRampToValueAtTime(0.6, now + 1.2);
    buildupGain.gain.exponentialRampToValueAtTime(0.01, now + 2);
    
    const buildupFilter = this.audioContext.createBiquadFilter();
    buildupFilter.type = 'lowpass';
    buildupFilter.frequency.setValueAtTime(300, now);
    buildupFilter.frequency.exponentialRampToValueAtTime(800, now + 1.5);
    
    const buildupDistortion = this.audioContext.createWaveShaper();
    buildupDistortion.curve = this.makeDistortionCurve(40) as any;
    
    buildupOsc.connect(buildupDistortion);
    buildupDistortion.connect(buildupFilter);
    buildupFilter.connect(buildupGain);
    buildupGain.connect(masterGain);
    buildupOsc.start(now);
    buildupOsc.stop(now + 2);

    // Orbital targeting lock-on beeps
    const lockTimes = [0.3, 0.6, 0.9, 1.2];
    lockTimes.forEach((time, index) => {
      const lockOsc = this.audioContext.createOscillator();
      lockOsc.type = 'square';
      lockOsc.frequency.value = 2000 - (index * 100);
      
      const lockGain = this.audioContext.createGain();
      lockGain.gain.setValueAtTime(0.15, now + time);
      lockGain.gain.exponentialRampToValueAtTime(0.01, now + time + 0.08);
      
      lockOsc.connect(lockGain);
      lockGain.connect(masterGain);
      lockOsc.start(now + time);
      lockOsc.stop(now + time + 0.08);
    });

    // Final charge ready tone
    const readyTime = now + 1.8;
    const readyOsc = this.audioContext.createOscillator();
    readyOsc.type = 'sine';
    readyOsc.frequency.value = 1600;
    
    const readyGain = this.audioContext.createGain();
    readyGain.gain.setValueAtTime(0.25, readyTime);
    readyGain.gain.exponentialRampToValueAtTime(0.01, readyTime + 0.3);
    
    readyOsc.connect(readyGain);
    readyGain.connect(masterGain);
    readyOsc.start(readyTime);
    readyOsc.stop(readyTime + 0.3);
  }

  /**
   * ORBITAL CANNON FIRE
   * Massive energy discharge and beam projection
   */
  public playOrbitalCannonFire(volume: number = 0.8): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Massive cannon discharge
    const fireNoise = this.createNoiseBuffer(0.8);
    const fireSource = this.audioContext.createBufferSource();
    fireSource.buffer = fireNoise;
    
    const fireGain = this.audioContext.createGain();
    fireGain.gain.setValueAtTime(0.8, now);
    fireGain.gain.exponentialRampToValueAtTime(0.2, now + 0.1);
    fireGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
    
    const fireFilter = this.audioContext.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.setValueAtTime(5000, now);
    fireFilter.frequency.exponentialRampToValueAtTime(200, now + 1);
    
    fireSource.connect(fireFilter);
    fireFilter.connect(fireGain);
    fireGain.connect(masterGain);
    fireSource.start(now);
    fireSource.stop(now + 1);

    // Energy beam projection
    const beamTime = now + 0.1;
    const beamOsc = this.audioContext.createOscillator();
    beamOsc.type = 'sine';
    beamOsc.frequency.setValueAtTime(3000, beamTime);
    beamOsc.frequency.exponentialRampToValueAtTime(1500, beamTime + 0.3);
    beamOsc.frequency.exponentialRampToValueAtTime(800, beamTime + 0.8);
    
    const beamGain = this.audioContext.createGain();
    beamGain.gain.setValueAtTime(0.3, beamTime);
    beamGain.gain.exponentialRampToValueAtTime(0.01, beamTime + 1);
    
    beamOsc.connect(beamGain);
    beamGain.connect(masterGain);
    beamOsc.start(beamTime);
    beamOsc.stop(beamTime + 1);

    // Orbital strike impact resonance
    const impactTime = now + 0.8;
    const impactOsc = this.audioContext.createOscillator();
    impactOsc.type = 'square';
    impactOsc.frequency.setValueAtTime(400, impactTime);
    impactOsc.frequency.exponentialRampToValueAtTime(100, impactTime + 0.5);
    
    const impactGain = this.audioContext.createGain();
    impactGain.gain.setValueAtTime(0.4, impactTime);
    impactGain.gain.exponentialRampToValueAtTime(0.01, impactTime + 0.8);
    
    const impactFilter = this.audioContext.createBiquadFilter();
    impactFilter.type = 'lowpass';
    impactFilter.frequency.value = 600;
    
    impactOsc.connect(impactFilter);
    impactFilter.connect(impactGain);
    impactGain.connect(masterGain);
    impactOsc.start(impactTime);
    impactOsc.stop(impactTime + 0.8);
  }

  /**
   * DEFENSE CANNON SOUND
   * Single shell interception system for anti-nuke defense
   */
  public playDefenseCannon(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Brief targeting beep
    const targetOsc = this.audioContext.createOscillator();
    targetOsc.type = 'sine';
    targetOsc.frequency.value = 800;
    
    const targetGain = this.audioContext.createGain();
    targetGain.gain.setValueAtTime(0, now);
    targetGain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    targetGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    targetOsc.connect(targetGain);
    targetGain.connect(masterGain);
    targetOsc.start(now);
    targetOsc.stop(now + 0.2);

    // Single cannon blast
    const blastOsc = this.audioContext.createOscillator();
    blastOsc.type = 'sawtooth';
    blastOsc.frequency.value = 150;
    
    const blastGain = this.audioContext.createGain();
    blastGain.gain.setValueAtTime(0, now + 0.3);
    blastGain.gain.linearRampToValueAtTime(1.0, now + 0.31);
    blastGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    const blastFilter = this.audioContext.createBiquadFilter();
    blastFilter.type = 'lowpass';
    blastFilter.frequency.value = 600;
    
    blastOsc.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(masterGain);
    blastOsc.start(now + 0.3);
    blastOsc.stop(now + 0.6);

    // Shell whistle
    const whistleOsc = this.audioContext.createOscillator();
    whistleOsc.type = 'sine';
    whistleOsc.frequency.setValueAtTime(1400, now + 0.32);
    whistleOsc.frequency.exponentialRampToValueAtTime(900, now + 0.8);
    
    const whistleGain = this.audioContext.createGain();
    whistleGain.gain.setValueAtTime(0, now + 0.32);
    whistleGain.gain.linearRampToValueAtTime(0.3, now + 0.35);
    whistleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    
    whistleOsc.connect(whistleGain);
    whistleGain.connect(masterGain);
    whistleOsc.start(now + 0.32);
    whistleOsc.stop(now + 0.8);

    // Interception explosion
    const explosionOsc = this.audioContext.createOscillator();
    explosionOsc.type = 'square';
    explosionOsc.frequency.value = 200;
    
    const explosionGain = this.audioContext.createGain();
    explosionGain.gain.setValueAtTime(0, now + 0.9);
    explosionGain.gain.linearRampToValueAtTime(0.6, now + 0.92);
    explosionGain.gain.exponentialRampToValueAtTime(0.01, now + 1.3);
    
    const explosionFilter = this.audioContext.createBiquadFilter();
    explosionFilter.type = 'bandpass';
    explosionFilter.frequency.value = 400;
    explosionFilter.Q.value = 1;
    
    explosionOsc.connect(explosionFilter);
    explosionFilter.connect(explosionGain);
    explosionGain.connect(masterGain);
    explosionOsc.start(now + 0.9);
    explosionOsc.stop(now + 1.3);
  }

  /**
   * PHASE 3: WEAPONS & COMBAT
   * Advanced weapon and defensive system sounds
   */

  /**
   * LASER WEAPON SOUND
   * High-energy beam discharge with charging hum
   */
  public playLaserWeapon(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Charging hum buildup
    const chargeOsc = this.audioContext.createOscillator();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.setValueAtTime(200, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
    
    const chargeGain = this.audioContext.createGain();
    chargeGain.gain.setValueAtTime(0.1, now);
    chargeGain.gain.exponentialRampToValueAtTime(0.3, now + 0.5);
    chargeGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    chargeOsc.connect(chargeGain);
    chargeGain.connect(masterGain);
    chargeOsc.start(now);
    chargeOsc.stop(now + 0.6);

    // High-energy beam discharge
    const beamTime = now + 0.6;
    const beamOsc = this.audioContext.createOscillator();
    beamOsc.type = 'sawtooth';
    beamOsc.frequency.value = 2000;
    
    const beamGain = this.audioContext.createGain();
    beamGain.gain.setValueAtTime(0.8, beamTime);
    beamGain.gain.exponentialRampToValueAtTime(0.01, beamTime + 0.3);
    
    const beamFilter = this.audioContext.createBiquadFilter();
    beamFilter.type = 'highpass';
    beamFilter.frequency.value = 1500;
    beamFilter.Q.value = 5;
    
    beamOsc.connect(beamFilter);
    beamFilter.connect(beamGain);
    beamGain.connect(masterGain);
    beamOsc.start(beamTime);
    beamOsc.stop(beamTime + 0.3);

    // Harmonic resonance
    const harmOsc = this.audioContext.createOscillator();
    harmOsc.type = 'sine';
    harmOsc.frequency.value = 4000;
    
    const harmGain = this.audioContext.createGain();
    harmGain.gain.setValueAtTime(0.2, beamTime);
    harmGain.gain.exponentialRampToValueAtTime(0.01, beamTime + 0.4);
    
    harmOsc.connect(harmGain);
    harmGain.connect(masterGain);
    harmOsc.start(beamTime);
    harmOsc.stop(beamTime + 0.4);
  }

  /**
   * MISSILE LAUNCH SOUND
   * Rocket ignition, flight trail, and impact explosion
   */
  public playMissileLaunch(volume: number = 0.8): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Rocket ignition
    const ignitionNoise = this.createNoiseBuffer(0.2);
    const ignitionSource = this.audioContext.createBufferSource();
    ignitionSource.buffer = ignitionNoise;
    
    const ignitionGain = this.audioContext.createGain();
    ignitionGain.gain.setValueAtTime(0.6, now);
    ignitionGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    const ignitionFilter = this.audioContext.createBiquadFilter();
    ignitionFilter.type = 'bandpass';
    ignitionFilter.frequency.value = 800;
    ignitionFilter.Q.value = 3;
    
    ignitionSource.connect(ignitionFilter);
    ignitionFilter.connect(ignitionGain);
    ignitionGain.connect(masterGain);
    ignitionSource.start(now);
    ignitionSource.stop(now + 0.3);

    // Engine thrust
    const thrustTime = now + 0.1;
    const thrustOsc = this.audioContext.createOscillator();
    thrustOsc.type = 'sawtooth';
    thrustOsc.frequency.setValueAtTime(150, thrustTime);
    thrustOsc.frequency.exponentialRampToValueAtTime(200, thrustTime + 1);
    
    const thrustGain = this.audioContext.createGain();
    thrustGain.gain.setValueAtTime(0.4, thrustTime);
    thrustGain.gain.setValueAtTime(0.3, thrustTime + 0.8);
    thrustGain.gain.exponentialRampToValueAtTime(0.01, thrustTime + 1.2);
    
    const thrustFilter = this.audioContext.createBiquadFilter();
    thrustFilter.type = 'lowpass';
    thrustFilter.frequency.value = 400;
    
    thrustOsc.connect(thrustFilter);
    thrustFilter.connect(thrustGain);
    thrustGain.connect(masterGain);
    thrustOsc.start(thrustTime);
    thrustOsc.stop(thrustTime + 1.2);

    // Flight trail whoosh
    const whooshTime = now + 0.5;
    const whooshNoise = this.createNoiseBuffer(1);
    const whooshSource = this.audioContext.createBufferSource();
    whooshSource.buffer = whooshNoise;
    
    const whooshGain = this.audioContext.createGain();
    whooshGain.gain.setValueAtTime(0.3, whooshTime);
    whooshGain.gain.exponentialRampToValueAtTime(0.01, whooshTime + 1);
    
    const whooshFilter = this.audioContext.createBiquadFilter();
    whooshFilter.type = 'highpass';
    whooshFilter.frequency.setValueAtTime(2000, whooshTime);
    whooshFilter.frequency.exponentialRampToValueAtTime(500, whooshTime + 1);
    whooshFilter.Q.value = 2;
    
    whooshSource.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(masterGain);
    whooshSource.start(whooshTime);
    whooshSource.stop(whooshTime + 1);

    // Impact explosion
    const explosionTime = now + 2;
    const explosionNoise = this.createNoiseBuffer(0.5);
    const explosionSource = this.audioContext.createBufferSource();
    explosionSource.buffer = explosionNoise;
    
    const explosionGain = this.audioContext.createGain();
    explosionGain.gain.setValueAtTime(0.9, explosionTime);
    explosionGain.gain.exponentialRampToValueAtTime(0.01, explosionTime + 0.8);
    
    explosionSource.connect(explosionGain);
    explosionGain.connect(masterGain);
    explosionSource.start(explosionTime);
    explosionSource.stop(explosionTime + 0.8);
  }

  /**
   * ARTILLERY STRIKE SOUND
   * Heavy cannon blast with incoming shell whistle
   */
  public playArtilleryStrike(volume: number = 0.9): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Heavy cannon blast
    const cannonNoise = this.createNoiseBuffer(0.4);
    const cannonSource = this.audioContext.createBufferSource();
    cannonSource.buffer = cannonNoise;
    
    const cannonGain = this.audioContext.createGain();
    cannonGain.gain.setValueAtTime(1.0, now);
    cannonGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    
    const cannonFilter = this.audioContext.createBiquadFilter();
    cannonFilter.type = 'lowpass';
    cannonFilter.frequency.value = 200;
    
    cannonSource.connect(cannonFilter);
    cannonFilter.connect(cannonGain);
    cannonGain.connect(masterGain);
    cannonSource.start(now);
    cannonSource.stop(now + 0.6);

    // Deep bass thump
    const bassOsc = this.audioContext.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = 60;
    
    const bassGain = this.audioContext.createGain();
    bassGain.gain.setValueAtTime(0.8, now);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
    
    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start(now);
    bassOsc.stop(now + 1);

    // Incoming shell whistle
    const whistleTime = now + 0.8;
    const whistleOsc = this.audioContext.createOscillator();
    whistleOsc.type = 'sine';
    whistleOsc.frequency.setValueAtTime(1500, whistleTime);
    whistleOsc.frequency.exponentialRampToValueAtTime(800, whistleTime + 1);
    
    const whistleGain = this.audioContext.createGain();
    whistleGain.gain.setValueAtTime(0.2, whistleTime);
    whistleGain.gain.setValueAtTime(0.4, whistleTime + 0.8);
    whistleGain.gain.exponentialRampToValueAtTime(0.01, whistleTime + 1.2);
    
    whistleOsc.connect(whistleGain);
    whistleGain.connect(masterGain);
    whistleOsc.start(whistleTime);
    whistleOsc.stop(whistleTime + 1.2);

    // Impact explosion
    const impactTime = now + 2.2;
    const impactNoise = this.createNoiseBuffer(0.6);
    const impactSource = this.audioContext.createBufferSource();
    impactSource.buffer = impactNoise;
    
    const impactGain = this.audioContext.createGain();
    impactGain.gain.setValueAtTime(0.8, impactTime);
    impactGain.gain.exponentialRampToValueAtTime(0.01, impactTime + 1);
    
    impactSource.connect(impactGain);
    impactGain.connect(masterGain);
    impactSource.start(impactTime);
    impactSource.stop(impactTime + 1);
  }

  /**
   * ENERGY SHIELD SOUND
   * Protective barrier activation and deflection effects
   */
  public playEnergyShield(volume: number = 0.6): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Shield activation hum
    const activationOsc = this.audioContext.createOscillator();
    activationOsc.type = 'sine';
    activationOsc.frequency.setValueAtTime(300, now);
    activationOsc.frequency.exponentialRampToValueAtTime(600, now + 0.5);
    
    const activationGain = this.audioContext.createGain();
    activationGain.gain.setValueAtTime(0.3, now);
    activationGain.gain.setValueAtTime(0.2, now + 2);
    activationGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);
    
    activationOsc.connect(activationGain);
    activationGain.connect(masterGain);
    activationOsc.start(now);
    activationOsc.stop(now + 2.5);

    // Harmonic resonance layers
    const harmonics = [900, 1200, 1800];
    harmonics.forEach((freq, index) => {
      const harmOsc = this.audioContext.createOscillator();
      harmOsc.type = 'sine';
      harmOsc.frequency.value = freq;
      
      const harmGain = this.audioContext.createGain();
      const startTime = now + 0.2 + (index * 0.1);
      harmGain.gain.setValueAtTime(0.1, startTime);
      harmGain.gain.setValueAtTime(0.05, startTime + 2);
      harmGain.gain.exponentialRampToValueAtTime(0.01, startTime + 2.5);
      
      harmOsc.connect(harmGain);
      harmGain.connect(masterGain);
      harmOsc.start(startTime);
      harmOsc.stop(startTime + 2.5);
    });

    // Energy crackle
    const crackleTime = now + 1;
    const crackleNoise = this.createNoiseBuffer(0.3);
    const crackleSource = this.audioContext.createBufferSource();
    crackleSource.buffer = crackleNoise;
    
    const crackleGain = this.audioContext.createGain();
    crackleGain.gain.setValueAtTime(0.08, crackleTime);
    crackleGain.gain.exponentialRampToValueAtTime(0.01, crackleTime + 0.5);
    
    const crackleFilter = this.audioContext.createBiquadFilter();
    crackleFilter.type = 'highpass';
    crackleFilter.frequency.value = 3000;
    
    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(masterGain);
    crackleSource.start(crackleTime);
    crackleSource.stop(crackleTime + 0.5);
  }

  /**
   * EMP BLAST SOUND
   * Electromagnetic pulse with electronic disruption
   */
  public playEMPBlast(volume: number = 0.8): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // EMP charge buildup
    const chargeOsc = this.audioContext.createOscillator();
    chargeOsc.type = 'square';
    chargeOsc.frequency.setValueAtTime(100, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(1000, now + 0.8);
    
    const chargeGain = this.audioContext.createGain();
    chargeGain.gain.setValueAtTime(0.2, now);
    chargeGain.gain.exponentialRampToValueAtTime(0.5, now + 0.8);
    chargeGain.gain.exponentialRampToValueAtTime(0.01, now + 1);
    
    const chargeDistortion = this.audioContext.createWaveShaper();
    chargeDistortion.curve = this.makeDistortionCurve(50) as any;
    
    chargeOsc.connect(chargeDistortion);
    chargeDistortion.connect(chargeGain);
    chargeGain.connect(masterGain);
    chargeOsc.start(now);
    chargeOsc.stop(now + 1);

    // Electronic disruption burst
    const burstTime = now + 1;
    const burstNoise = this.createNoiseBuffer(0.4);
    const burstSource = this.audioContext.createBufferSource();
    burstSource.buffer = burstNoise;
    
    const burstGain = this.audioContext.createGain();
    burstGain.gain.setValueAtTime(0.9, burstTime);
    burstGain.gain.exponentialRampToValueAtTime(0.01, burstTime + 0.2);
    
    const burstFilter = this.audioContext.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.value = 2000;
    burstFilter.Q.value = 10;
    
    burstSource.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(masterGain);
    burstSource.start(burstTime);
    burstSource.stop(burstTime + 0.2);

    // Frequency sweep interference
    const sweepTime = now + 1.1;
    const sweepOsc = this.audioContext.createOscillator();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(3000, sweepTime);
    sweepOsc.frequency.exponentialRampToValueAtTime(200, sweepTime + 0.8);
    
    const sweepGain = this.audioContext.createGain();
    sweepGain.gain.setValueAtTime(0.4, sweepTime);
    sweepGain.gain.exponentialRampToValueAtTime(0.01, sweepTime + 1);
    
    sweepOsc.connect(sweepGain);
    sweepGain.connect(masterGain);
    sweepOsc.start(sweepTime);
    sweepOsc.stop(sweepTime + 1);

    // Static aftermath
    const staticTime = now + 1.8;
    const staticNoise = this.createNoiseBuffer(0.5);
    const staticSource = this.audioContext.createBufferSource();
    staticSource.buffer = staticNoise;
    
    const staticGain = this.audioContext.createGain();
    staticGain.gain.setValueAtTime(0.15, staticTime);
    staticGain.gain.exponentialRampToValueAtTime(0.01, staticTime + 0.8);
    
    const staticFilter = this.audioContext.createBiquadFilter();
    staticFilter.type = 'highpass';
    staticFilter.frequency.value = 4000;
    
    staticSource.connect(staticFilter);
    staticFilter.connect(staticGain);
    staticGain.connect(masterGain);
    staticSource.start(staticTime);
    staticSource.stop(staticTime + 0.8);
  }

  /**
   * Get audio context (for external use if needed)
   */
  public getContext(): AudioContext {
    return this.audioContext;
  }
}

// Export singleton instance
export const webAudioSounds = new WebAudioSounds();