/**
 * WebAudioSoundsV2 - Optimized sound effects for SolarFront
 * All sounds are designed with specific duration targets:
 * - Quick Battle: 0.5-1.0 seconds
 * - Building: 0.8-1.2 seconds  
 * - Impact: 0.3-0.8 seconds
 * - Ship: 0.6-1.0 seconds
 */

export class WebAudioSoundsV2 {
  private audioContext: AudioContext;
  private initialized: boolean = false;

  constructor() {
    // Audio context will be created on init() due to browser autoplay policies
  }

  /**
   * Initialize the audio context (must be called from user interaction)
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.initialized = true;
    
    // Ensure audio context is running
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Helper function to create white noise buffer
   */
  private createNoiseBuffer(duration: number = 1): AudioBuffer {
    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  }

  /**
   * Helper function to create distortion curve for wave shaping
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

  // ==========================================
  // PHASE 1: QUICK BATTLE SOUNDS (0.1-0.5s)
  // Frame-tight feedback with layered construction
  // ==========================================

  /**
   * VIPER SHELL HIT - Warship shell impact (0.2s)
   * Based on: 20-tick attack cycle, 250 damage
   * Layers: Sharp ping (clarity) + metallic crack (body) + sub-bass thump (weight)
   */
  public playViperShellHit(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Clarity layer - Sharp ping
    const clarityOsc = this.audioContext.createOscillator();
    clarityOsc.type = 'triangle';
    clarityOsc.frequency.setValueAtTime(2800, now);
    clarityOsc.frequency.exponentialRampToValueAtTime(1400, now + 0.05);
    
    const clarityGain = this.audioContext.createGain();
    clarityGain.gain.setValueAtTime(0.8, now);
    clarityGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    clarityOsc.connect(clarityGain);
    clarityGain.connect(masterGain);
    clarityOsc.start(now);
    clarityOsc.stop(now + 0.05);

    // Body layer - Metallic crack
    const bodyOsc = this.audioContext.createOscillator();
    bodyOsc.type = 'square';
    bodyOsc.frequency.setValueAtTime(800, now + 0.005);
    bodyOsc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
    
    const bodyGain = this.audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.6, now + 0.005);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    const bodyFilter = this.audioContext.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.value = 1200;
    bodyFilter.Q.value = 4;
    
    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(masterGain);
    bodyOsc.start(now + 0.005);
    bodyOsc.stop(now + 0.15);

    // Weight layer - Sub-bass thump
    const weightOsc = this.audioContext.createOscillator();
    weightOsc.type = 'sine';
    weightOsc.frequency.setValueAtTime(60, now + 0.01);
    weightOsc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    
    const weightGain = this.audioContext.createGain();
    weightGain.gain.setValueAtTime(0.4, now + 0.01);
    weightGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    weightOsc.connect(weightGain);
    weightGain.connect(masterGain);
    weightOsc.start(now + 0.01);
    weightOsc.stop(now + 0.2);
  }

  /**
   * DEFENSE POST SHOT - Long-range artillery (0.4s)
   * Based on: 100-tick attack cycle (10 seconds), 30-tile range
   * Authoritative sound with long tail signaling power
   */
  public playDefensePostShot(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Initial boom
    const boomOsc = this.audioContext.createOscillator();
    boomOsc.type = 'triangle';
    boomOsc.frequency.setValueAtTime(120, now);
    boomOsc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    
    const boomGain = this.audioContext.createGain();
    boomGain.gain.setValueAtTime(0.8, now);
    boomGain.gain.exponentialRampToValueAtTime(0.3, now + 0.1);
    
    boomOsc.connect(boomGain);
    boomGain.connect(masterGain);
    boomOsc.start(now);
    boomOsc.stop(now + 0.1);

    // Authoritative crack
    const crackOsc = this.audioContext.createOscillator();
    crackOsc.type = 'square';
    crackOsc.frequency.setValueAtTime(2000, now + 0.01);
    crackOsc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
    
    const crackGain = this.audioContext.createGain();
    crackGain.gain.setValueAtTime(0.6, now + 0.01);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    crackOsc.connect(crackGain);
    crackGain.connect(masterGain);
    crackOsc.start(now + 0.01);
    crackOsc.stop(now + 0.15);

    // Power tail
    const tailOsc = this.audioContext.createOscillator();
    tailOsc.type = 'sine';
    tailOsc.frequency.setValueAtTime(200, now + 0.1);
    tailOsc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    
    const tailGain = this.audioContext.createGain();
    tailGain.gain.setValueAtTime(0.3, now + 0.1);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    tailOsc.connect(tailGain);
    tailGain.connect(masterGain);
    tailOsc.start(now + 0.1);
    tailOsc.stop(now + 0.4);
  }

  /**
   * SAM MISSILE LAUNCH - Anti-air interception (0.3s)
   * Based on: 75-tick cooldown, 100% hit rate
   * Sharp snap + upward blip signifying interception certainty
   */
  public playSAMLaunch(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Sharp snap
    const snapOsc = this.audioContext.createOscillator();
    snapOsc.type = 'square';
    snapOsc.frequency.value = 1800;
    
    const snapGain = this.audioContext.createGain();
    snapGain.gain.setValueAtTime(0.8, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    snapOsc.connect(snapGain);
    snapGain.connect(masterGain);
    snapOsc.start(now);
    snapOsc.stop(now + 0.05);

    // Upward blip (certainty signal)
    const blipOsc = this.audioContext.createOscillator();
    blipOsc.type = 'triangle';
    blipOsc.frequency.setValueAtTime(800, now + 0.03);
    blipOsc.frequency.exponentialRampToValueAtTime(2400, now + 0.15);
    
    const blipGain = this.audioContext.createGain();
    blipGain.gain.setValueAtTime(0.6, now + 0.03);
    blipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    blipOsc.connect(blipGain);
    blipGain.connect(masterGain);
    blipOsc.start(now + 0.03);
    blipOsc.stop(now + 0.15);

    // Thrust trail
    const thrustNoise = this.createNoiseBuffer(0.25);
    const thrustSource = this.audioContext.createBufferSource();
    thrustSource.buffer = thrustNoise;
    
    const thrustGain = this.audioContext.createGain();
    thrustGain.gain.setValueAtTime(0.3, now + 0.05);
    thrustGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    const thrustFilter = this.audioContext.createBiquadFilter();
    thrustFilter.type = 'highpass';
    thrustFilter.frequency.value = 2000;
    
    thrustSource.connect(thrustFilter);
    thrustFilter.connect(thrustGain);
    thrustGain.connect(masterGain);
    thrustSource.start(now + 0.05);
    thrustSource.stop(now + 0.3);
  }

  /**
   * ORBITAL CANNON FIRE - Space-based weapon (0.35s)
   * Based on: 20-tick attack cycle, 150-tile range
   * Weighty, authoritative laser discharge from space
   */
  public playOrbitalCannonFire(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Charge-up phase
    const chargeOsc = this.audioContext.createOscillator();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.setValueAtTime(400, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    
    const chargeGain = this.audioContext.createGain();
    chargeGain.gain.setValueAtTime(0, now);
    chargeGain.gain.linearRampToValueAtTime(0.5, now + 0.1);
    
    chargeOsc.connect(chargeGain);
    chargeGain.connect(masterGain);
    chargeOsc.start(now);
    chargeOsc.stop(now + 0.1);

    // Laser discharge
    const laserOsc = this.audioContext.createOscillator();
    laserOsc.type = 'sawtooth';
    laserOsc.frequency.setValueAtTime(1200, now + 0.1);
    laserOsc.frequency.exponentialRampToValueAtTime(800, now + 0.25);
    
    const laserGain = this.audioContext.createGain();
    laserGain.gain.setValueAtTime(0.7, now + 0.1);
    laserGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    const laserFilter = this.audioContext.createBiquadFilter();
    laserFilter.type = 'bandpass';
    laserFilter.frequency.value = 1000;
    laserFilter.Q.value = 6;
    
    laserOsc.connect(laserFilter);
    laserFilter.connect(laserGain);
    laserGain.connect(masterGain);
    laserOsc.start(now + 0.1);
    laserOsc.stop(now + 0.25);

    // Space resonance tail
    const tailOsc = this.audioContext.createOscillator();
    tailOsc.type = 'sine';
    tailOsc.frequency.setValueAtTime(300, now + 0.2);
    tailOsc.frequency.exponentialRampToValueAtTime(150, now + 0.35);
    
    const tailGain = this.audioContext.createGain();
    tailGain.gain.setValueAtTime(0.3, now + 0.2);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    tailOsc.connect(tailGain);
    tailGain.connect(masterGain);
    tailOsc.start(now + 0.2);
    tailOsc.stop(now + 0.35);
  }

  /**
   * LAND ATTACK HIT - Territory combat success (0.18s)
   * Based on: 16.5-25 tick cycles depending on terrain
   * Crisp ping + body layer for attack confirm
   */
  public playLandAttackHit(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Crisp ping (attack confirm)
    const pingOsc = this.audioContext.createOscillator();
    pingOsc.type = 'triangle';
    pingOsc.frequency.setValueAtTime(2000, now);
    pingOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
    
    const pingGain = this.audioContext.createGain();
    pingGain.gain.setValueAtTime(0.7, now);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    pingOsc.connect(pingGain);
    pingGain.connect(masterGain);
    pingOsc.start(now);
    pingOsc.stop(now + 0.08);

    // Body layer
    const bodyOsc = this.audioContext.createOscillator();
    bodyOsc.type = 'square';
    bodyOsc.frequency.setValueAtTime(600, now + 0.02);
    bodyOsc.frequency.exponentialRampToValueAtTime(300, now + 0.18);
    
    const bodyGain = this.audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.4, now + 0.02);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    
    bodyOsc.connect(bodyGain);
    bodyGain.connect(masterGain);
    bodyOsc.start(now + 0.02);
    bodyOsc.stop(now + 0.18);

    // Add ±3% humanization jitter
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    pingOsc.frequency.value *= jitter;
    bodyOsc.frequency.value *= jitter;
  }

  /**
   * UNIT DESTRUCTION - Death sound (0.15s)
   * Soft, short, low-pitched descending motif (gentle failure sound)
   */
  public playUnitDestruction(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume * 0.6; // Softer for negative reinforcement
    masterGain.connect(this.audioContext.destination);

    const destructionOsc = this.audioContext.createOscillator();
    destructionOsc.type = 'sine';
    destructionOsc.frequency.setValueAtTime(400, now);
    destructionOsc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
    
    const destructionGain = this.audioContext.createGain();
    destructionGain.gain.setValueAtTime(0.5, now);
    destructionGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    
    destructionOsc.connect(filter);
    filter.connect(destructionGain);
    destructionGain.connect(masterGain);
    destructionOsc.start(now);
    destructionOsc.stop(now + 0.15);
  }

  /**
   * UI CONFIRM - Interface interaction success (0.1s)
   * Sharp retro precision for UI confirmations
   */
  public playUIConfirm(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    const confirmOsc = this.audioContext.createOscillator();
    confirmOsc.type = 'square';
    confirmOsc.frequency.setValueAtTime(1600, now);
    confirmOsc.frequency.exponentialRampToValueAtTime(2400, now + 0.05);
    confirmOsc.frequency.setValueAtTime(2400, now + 0.05);
    confirmOsc.frequency.exponentialRampToValueAtTime(1600, now + 0.1);
    
    const confirmGain = this.audioContext.createGain();
    confirmGain.gain.setValueAtTime(0.6, now);
    confirmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    confirmOsc.connect(confirmGain);
    confirmGain.connect(masterGain);
    confirmOsc.start(now);
    confirmOsc.stop(now + 0.1);
  }

  /**
   * TERRITORY CAPTURE - Land conquest success (0.3s)
   * Bright, layered, longer success sound with celebratory elements
   */
  public playTerritoryCapture(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Success chord (triad)
    const chord1 = this.audioContext.createOscillator();
    chord1.type = 'triangle';
    chord1.frequency.value = 523; // C5
    
    const chord2 = this.audioContext.createOscillator();
    chord2.type = 'triangle';
    chord2.frequency.value = 659; // E5
    
    const chord3 = this.audioContext.createOscillator();
    chord3.type = 'triangle';
    chord3.frequency.value = 784; // G5
    
    const chordGain = this.audioContext.createGain();
    chordGain.gain.setValueAtTime(0.4, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    chord1.connect(chordGain);
    chord2.connect(chordGain);
    chord3.connect(chordGain);
    chordGain.connect(masterGain);
    
    chord1.start(now);
    chord2.start(now);
    chord3.start(now);
    chord1.stop(now + 0.25);
    chord2.stop(now + 0.25);
    chord3.stop(now + 0.25);

    // Shimmer overlay
    const shimmerOsc = this.audioContext.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(1500, now + 0.05);
    shimmerOsc.frequency.exponentialRampToValueAtTime(3000, now + 0.15);
    shimmerOsc.frequency.exponentialRampToValueAtTime(1500, now + 0.3);
    
    const shimmerGain = this.audioContext.createGain();
    shimmerGain.gain.setValueAtTime(0.3, now + 0.05);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(masterGain);
    shimmerOsc.start(now + 0.05);
    shimmerOsc.stop(now + 0.3);
  }

  // ==========================================
  // PHASE 2: BUILDING NOISES (0.8-1.2s)
  // Construction, economy, and major achievements
  // ==========================================


  /**
   * PORT CONSTRUCTION COMPLETE - Space port ready (1.0s)
   * Based on: 20-tick construction (2 seconds), 125k gold cost
   * Layers: Completion chord + industrial hum + trade route activation
   */
  public playPortComplete(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Completion chord (F major triad)
    const chord1 = this.audioContext.createOscillator();
    chord1.type = 'triangle';
    chord1.frequency.value = 349; // F4
    
    const chord2 = this.audioContext.createOscillator();
    chord2.type = 'triangle';
    chord2.frequency.value = 440; // A4
    
    const chord3 = this.audioContext.createOscillator();
    chord3.type = 'triangle';
    chord3.frequency.value = 523; // C5
    
    const chordGain = this.audioContext.createGain();
    chordGain.gain.setValueAtTime(0.5, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    chord1.connect(chordGain);
    chord2.connect(chordGain);
    chord3.connect(chordGain);
    chordGain.connect(masterGain);
    
    chord1.start(now);
    chord2.start(now);
    chord3.start(now);
    chord1.stop(now + 0.6);
    chord2.stop(now + 0.6);
    chord3.stop(now + 0.6);

    // Industrial hum layer
    const humOsc = this.audioContext.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.setValueAtTime(120, now + 0.2);
    humOsc.frequency.setValueAtTime(120, now + 0.8);
    
    const humGain = this.audioContext.createGain();
    humGain.gain.setValueAtTime(0, now + 0.2);
    humGain.gain.linearRampToValueAtTime(0.3, now + 0.4);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    humOsc.connect(humGain);
    humGain.connect(masterGain);
    humOsc.start(now + 0.2);
    humOsc.stop(now + 1.0);

    // Trade route activation sparkle
    const sparkleOsc = this.audioContext.createOscillator();
    sparkleOsc.type = 'sine';
    sparkleOsc.frequency.setValueAtTime(1200, now + 0.4);
    sparkleOsc.frequency.exponentialRampToValueAtTime(2400, now + 0.7);
    sparkleOsc.frequency.exponentialRampToValueAtTime(1800, now + 1.0);
    
    const sparkleGain = this.audioContext.createGain();
    sparkleGain.gain.setValueAtTime(0.25, now + 0.4);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    sparkleOsc.connect(sparkleGain);
    sparkleGain.connect(masterGain);
    sparkleOsc.start(now + 0.4);
    sparkleOsc.stop(now + 1.0);
  }

  /**
   * CITY CONSTRUCTION COMPLETE - Population center ready (1.1s)
   * Based on: 20-tick construction, +250k population capacity
   * Layers: Celebratory chord + population growth + prosperity shimmer
   */
  public playCityComplete(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Celebratory chord (C major 7th)
    const chord1 = this.audioContext.createOscillator();
    chord1.type = 'triangle';
    chord1.frequency.value = 523; // C5
    
    const chord2 = this.audioContext.createOscillator();
    chord2.type = 'triangle';
    chord2.frequency.value = 659; // E5
    
    const chord3 = this.audioContext.createOscillator();
    chord3.type = 'triangle';
    chord3.frequency.value = 784; // G5
    
    const chord4 = this.audioContext.createOscillator();
    chord4.type = 'triangle';
    chord4.frequency.value = 987; // B5
    
    const chordGain = this.audioContext.createGain();
    chordGain.gain.setValueAtTime(0.4, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    chord1.connect(chordGain);
    chord2.connect(chordGain);
    chord3.connect(chordGain);
    chord4.connect(chordGain);
    chordGain.connect(masterGain);
    
    chord1.start(now);
    chord2.start(now);
    chord3.start(now);
    chord4.start(now);
    chord1.stop(now + 0.8);
    chord2.stop(now + 0.8);
    chord3.stop(now + 0.8);
    chord4.stop(now + 0.8);

    // Population growth ascending notes
    const growthFreqs = [440, 554, 659, 784, 880];
    growthFreqs.forEach((freq, i) => {
      const growthOsc = this.audioContext.createOscillator();
      growthOsc.type = 'sine';
      growthOsc.frequency.value = freq;
      
      const growthGain = this.audioContext.createGain();
      growthGain.gain.setValueAtTime(0.2, now + 0.3 + (i * 0.1));
      growthGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i * 0.1));
      
      growthOsc.connect(growthGain);
      growthGain.connect(masterGain);
      growthOsc.start(now + 0.3 + (i * 0.1));
      growthOsc.stop(now + 0.5 + (i * 0.1));
    });

    // Prosperity shimmer
    const shimmerOsc = this.audioContext.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(1500, now + 0.6);
    shimmerOsc.frequency.exponentialRampToValueAtTime(3000, now + 0.9);
    shimmerOsc.frequency.exponentialRampToValueAtTime(2000, now + 1.1);
    
    const shimmerGain = this.audioContext.createGain();
    shimmerGain.gain.setValueAtTime(0.2, now + 0.6);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(masterGain);
    shimmerOsc.start(now + 0.6);
    shimmerOsc.stop(now + 1.1);
  }

  /**
   * DEFENSE POST COMPLETE - Fortification ready (1.2s)
   * Based on: 50-tick construction (5 seconds), 100k gold, 5x defense bonus
   * Layers: Authoritative chord + fortification rumble + defensive presence
   */
  public playDefensePostComplete(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Authoritative chord (D minor - strong, defensive)
    const chord1 = this.audioContext.createOscillator();
    chord1.type = 'triangle';
    chord1.frequency.value = 294; // D4
    
    const chord2 = this.audioContext.createOscillator();
    chord2.type = 'triangle';
    chord2.frequency.value = 349; // F4
    
    const chord3 = this.audioContext.createOscillator();
    chord3.type = 'triangle';
    chord3.frequency.value = 440; // A4
    
    const chordGain = this.audioContext.createGain();
    chordGain.gain.setValueAtTime(0.6, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    chord1.connect(chordGain);
    chord2.connect(chordGain);
    chord3.connect(chordGain);
    chordGain.connect(masterGain);
    
    chord1.start(now);
    chord2.start(now);
    chord3.start(now);
    chord1.stop(now + 1.0);
    chord2.stop(now + 1.0);
    chord3.stop(now + 1.0);

    // Fortification rumble
    const rumbleOsc = this.audioContext.createOscillator();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.setValueAtTime(60, now + 0.2);
    rumbleOsc.frequency.setValueAtTime(80, now + 0.6);
    rumbleOsc.frequency.exponentialRampToValueAtTime(50, now + 1.2);
    
    const rumbleGain = this.audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0.4, now + 0.2);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(now + 0.2);
    rumbleOsc.stop(now + 1.2);

    // Defensive presence (power up sound)
    const powerOsc = this.audioContext.createOscillator();
    powerOsc.type = 'square';
    powerOsc.frequency.setValueAtTime(200, now + 0.4);
    powerOsc.frequency.exponentialRampToValueAtTime(400, now + 0.8);
    powerOsc.frequency.exponentialRampToValueAtTime(300, now + 1.2);
    
    const powerGain = this.audioContext.createGain();
    powerGain.gain.setValueAtTime(0.3, now + 0.4);
    powerGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    const powerFilter = this.audioContext.createBiquadFilter();
    powerFilter.type = 'lowpass';
    powerFilter.frequency.value = 800;
    
    powerOsc.connect(powerFilter);
    powerFilter.connect(powerGain);
    powerGain.connect(masterGain);
    powerOsc.start(now + 0.4);
    powerOsc.stop(now + 1.2);
  }

  /**
   * MISSILE SILO COMPLETE - Nuclear capability ready (1.0s)
   * Based on: 100-tick construction (10 seconds), 1M gold, nuclear launch capability
   * Layers: Ominous completion + underground systems + power activation
   */
  public playMissileSiloComplete(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Ominous completion chord (A minor)
    const chord1 = this.audioContext.createOscillator();
    chord1.type = 'triangle';
    chord1.frequency.value = 220; // A3
    
    const chord2 = this.audioContext.createOscillator();
    chord2.type = 'triangle';
    chord2.frequency.value = 261; // C4
    
    const chord3 = this.audioContext.createOscillator();
    chord3.type = 'triangle';
    chord3.frequency.value = 330; // E4
    
    const chordGain = this.audioContext.createGain();
    chordGain.gain.setValueAtTime(0.5, now);
    chordGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    chord1.connect(chordGain);
    chord2.connect(chordGain);
    chord3.connect(chordGain);
    chordGain.connect(masterGain);
    
    chord1.start(now);
    chord2.start(now);
    chord3.start(now);
    chord1.stop(now + 0.8);
    chord2.stop(now + 0.8);
    chord3.stop(now + 0.8);

    // Underground systems activation
    const systemsOsc = this.audioContext.createOscillator();
    systemsOsc.type = 'sine';
    systemsOsc.frequency.setValueAtTime(80, now + 0.3);
    systemsOsc.frequency.linearRampToValueAtTime(120, now + 0.7);
    systemsOsc.frequency.exponentialRampToValueAtTime(60, now + 1.0);
    
    const systemsGain = this.audioContext.createGain();
    systemsGain.gain.setValueAtTime(0.4, now + 0.3);
    systemsGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    systemsOsc.connect(systemsGain);
    systemsGain.connect(masterGain);
    systemsOsc.start(now + 0.3);
    systemsOsc.stop(now + 1.0);

    // Power activation sequence
    const powerFreqs = [150, 200, 250, 300];
    powerFreqs.forEach((freq, i) => {
      const powerOsc = this.audioContext.createOscillator();
      powerOsc.type = 'square';
      powerOsc.frequency.value = freq;
      
      const powerGain = this.audioContext.createGain();
      powerGain.gain.setValueAtTime(0.15, now + 0.5 + (i * 0.08));
      powerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65 + (i * 0.08));
      
      const powerFilter = this.audioContext.createBiquadFilter();
      powerFilter.type = 'lowpass';
      powerFilter.frequency.value = 600;
      
      powerOsc.connect(powerFilter);
      powerFilter.connect(powerGain);
      powerGain.connect(masterGain);
      powerOsc.start(now + 0.5 + (i * 0.08));
      powerOsc.stop(now + 0.65 + (i * 0.08));
    });
  }

  /**
   * GOLD 125K MILESTONE - Simple foundation layer (0.5s)
   * Foundation of wealth - Single clear C4 tone
   * Building progression: First layer with basic achievement chime
   */
  public playGold125k(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Foundation tone - C4 root (262 Hz)
    const foundationOsc = this.audioContext.createOscillator();
    foundationOsc.type = 'triangle';
    foundationOsc.frequency.value = 262; // C4
    
    const foundationGain = this.audioContext.createGain();
    foundationGain.gain.setValueAtTime(0.5, now);
    foundationGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    foundationOsc.connect(foundationGain);
    foundationGain.connect(masterGain);
    foundationOsc.start(now);
    foundationOsc.stop(now + 0.5);

    // Basic achievement chime
    const chimeOsc = this.audioContext.createOscillator();
    chimeOsc.type = 'triangle';
    chimeOsc.frequency.setValueAtTime(524, now + 0.1); // C5
    chimeOsc.frequency.exponentialRampToValueAtTime(262, now + 0.4); // Back to C4
    
    const chimeGain = this.audioContext.createGain();
    chimeGain.gain.setValueAtTime(0.3, now + 0.1);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    chimeOsc.connect(chimeGain);
    chimeGain.connect(masterGain);
    chimeOsc.start(now + 0.1);
    chimeOsc.stop(now + 0.5);

    // Add ±3% humanization jitter
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    foundationOsc.frequency.value *= jitter;
  }

  /**
   * GOLD 750K MILESTONE - Building on foundation (0.7s)
   * Nuclear capability unlocked - Adds harmony to foundation
   * Building progression: Foundation + harmony (C4 + E4)
   */
  public playGold750k(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Foundation tone - C4 root (same as 125k)
    const foundationOsc = this.audioContext.createOscillator();
    foundationOsc.type = 'triangle';
    foundationOsc.frequency.value = 262; // C4
    
    const foundationGain = this.audioContext.createGain();
    foundationGain.gain.setValueAtTime(0.4, now);
    foundationGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    foundationOsc.connect(foundationGain);
    foundationGain.connect(masterGain);
    foundationOsc.start(now);
    foundationOsc.stop(now + 0.7);

    // Harmony layer - E4 (building on foundation)
    const harmonyOsc = this.audioContext.createOscillator();
    harmonyOsc.type = 'triangle';
    harmonyOsc.frequency.value = 330; // E4
    
    const harmonyGain = this.audioContext.createGain();
    harmonyGain.gain.setValueAtTime(0.35, now + 0.1);
    harmonyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    harmonyOsc.connect(harmonyGain);
    harmonyGain.connect(masterGain);
    harmonyOsc.start(now + 0.1);
    harmonyOsc.stop(now + 0.7);

    // Nuclear capability achievement chime
    const nuclearChime = this.audioContext.createOscillator();
    nuclearChime.type = 'triangle';
    nuclearChime.frequency.setValueAtTime(660, now + 0.2); // E5
    nuclearChime.frequency.exponentialRampToValueAtTime(330, now + 0.6); // Back to E4
    
    const nuclearGain = this.audioContext.createGain();
    nuclearGain.gain.setValueAtTime(0.25, now + 0.2);
    nuclearGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    nuclearChime.connect(nuclearGain);
    nuclearGain.connect(masterGain);
    nuclearChime.start(now + 0.2);
    nuclearChime.stop(now + 0.7);

    // Add ±3% humanization jitter
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    foundationOsc.frequency.value *= jitter;
    harmonyOsc.frequency.value *= jitter;
  }

  /**
   * GOLD 1M MILESTONE - Complete progression (0.9s)
   * Ultimate economic power - Full C major chord with cascade finale
   * Building progression: Foundation + harmony + completion (C4 + E4 + G4)
   */
  public playGold1M(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Foundation tone - C4 root (same as previous milestones)
    const foundationOsc = this.audioContext.createOscillator();
    foundationOsc.type = 'triangle';
    foundationOsc.frequency.value = 262; // C4
    
    const foundationGain = this.audioContext.createGain();
    foundationGain.gain.setValueAtTime(0.35, now);
    foundationGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    
    foundationOsc.connect(foundationGain);
    foundationGain.connect(masterGain);
    foundationOsc.start(now);
    foundationOsc.stop(now + 0.9);

    // Harmony layer - E4 (same as 750k)
    const harmonyOsc = this.audioContext.createOscillator();
    harmonyOsc.type = 'triangle';
    harmonyOsc.frequency.value = 330; // E4
    
    const harmonyGain = this.audioContext.createGain();
    harmonyGain.gain.setValueAtTime(0.3, now + 0.1);
    harmonyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    
    harmonyOsc.connect(harmonyGain);
    harmonyGain.connect(masterGain);
    harmonyOsc.start(now + 0.1);
    harmonyOsc.stop(now + 0.9);

    // Completion layer - G4 (completes the C major chord)
    const completionOsc = this.audioContext.createOscillator();
    completionOsc.type = 'triangle';
    completionOsc.frequency.value = 392; // G4
    
    const completionGain = this.audioContext.createGain();
    completionGain.gain.setValueAtTime(0.25, now + 0.2);
    completionGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    
    completionOsc.connect(completionGain);
    completionGain.connect(masterGain);
    completionOsc.start(now + 0.2);
    completionOsc.stop(now + 0.9);

    // Cascade finale - ascending chord progression showing ultimate power
    const cascadeFreqs = [524, 659, 784]; // C5, E5, G5 (octave up)
    cascadeFreqs.forEach((freq, i) => {
      const cascadeOsc = this.audioContext.createOscillator();
      cascadeOsc.type = 'triangle';
      cascadeOsc.frequency.value = freq;
      
      const cascadeGain = this.audioContext.createGain();
      cascadeGain.gain.setValueAtTime(0.2, now + 0.4 + (i * 0.1));
      cascadeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      
      cascadeOsc.connect(cascadeGain);
      cascadeGain.connect(masterGain);
      cascadeOsc.start(now + 0.4 + (i * 0.1));
      cascadeOsc.stop(now + 0.9);
    });

    // Add ±3% humanization jitter
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    foundationOsc.frequency.value *= jitter;
    harmonyOsc.frequency.value *= jitter;
    completionOsc.frequency.value *= jitter;
  }

  /**
   * PLAYER CONQUEST - Complete enemy elimination (1.5s)
   * Ultimate achievement: completely conquering another player
   * Layers: Victory fanfare + conquest drums + domination cascade + triumph finale
   */
  public playPlayerConquest(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Victory fanfare (G major - glorious)
    const victoryChord1 = this.audioContext.createOscillator();
    victoryChord1.type = 'triangle';
    victoryChord1.frequency.value = 392; // G4
    
    const victoryChord2 = this.audioContext.createOscillator();
    victoryChord2.type = 'triangle';
    victoryChord2.frequency.value = 494; // B4
    
    const victoryChord3 = this.audioContext.createOscillator();
    victoryChord3.type = 'triangle';
    victoryChord3.frequency.value = 587; // D5
    
    const victoryChord4 = this.audioContext.createOscillator();
    victoryChord4.type = 'triangle';
    victoryChord4.frequency.value = 784; // G5
    
    const victoryGain = this.audioContext.createGain();
    victoryGain.gain.setValueAtTime(0.7, now);
    victoryGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    victoryChord1.connect(victoryGain);
    victoryChord2.connect(victoryGain);
    victoryChord3.connect(victoryGain);
    victoryChord4.connect(victoryGain);
    victoryGain.connect(masterGain);
    
    victoryChord1.start(now);
    victoryChord2.start(now);
    victoryChord3.start(now);
    victoryChord4.start(now);
    victoryChord1.stop(now + 1.2);
    victoryChord2.stop(now + 1.2);
    victoryChord3.stop(now + 1.2);
    victoryChord4.stop(now + 1.2);

    // Conquest drums (rhythmic power)
    for (let i = 0; i < 6; i++) {
      const drumOsc = this.audioContext.createOscillator();
      drumOsc.type = 'triangle';
      drumOsc.frequency.setValueAtTime(80, now + (i * 0.15));
      drumOsc.frequency.exponentialRampToValueAtTime(40, now + 0.08 + (i * 0.15));
      
      const drumGain = this.audioContext.createGain();
      drumGain.gain.setValueAtTime(0.5, now + (i * 0.15));
      drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12 + (i * 0.15));
      
      drumOsc.connect(drumGain);
      drumGain.connect(masterGain);
      drumOsc.start(now + (i * 0.15));
      drumOsc.stop(now + 0.12 + (i * 0.15));
    }

    // Domination cascade (ascending triumph)
    const dominationFreqs = [196, 247, 294, 370, 440, 554, 659, 831, 1047];
    dominationFreqs.forEach((freq, i) => {
      const dominationOsc = this.audioContext.createOscillator();
      dominationOsc.type = 'sine';
      dominationOsc.frequency.value = freq;
      
      const dominationGain = this.audioContext.createGain();
      dominationGain.gain.setValueAtTime(0.25, now + 0.6 + (i * 0.06));
      dominationGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8 + (i * 0.06));
      
      dominationOsc.connect(dominationGain);
      dominationGain.connect(masterGain);
      dominationOsc.start(now + 0.6 + (i * 0.06));
      dominationOsc.stop(now + 0.8 + (i * 0.06));
    });

    // Triumph finale sparkles
    const finaleOsc = this.audioContext.createOscillator();
    finaleOsc.type = 'sine';
    finaleOsc.frequency.setValueAtTime(2637, now + 1.1);
    finaleOsc.frequency.exponentialRampToValueAtTime(5274, now + 1.3);
    finaleOsc.frequency.exponentialRampToValueAtTime(3951, now + 1.5);
    
    const finaleGain = this.audioContext.createGain();
    finaleGain.gain.setValueAtTime(0.4, now + 1.1);
    finaleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    
    finaleOsc.connect(finaleGain);
    finaleGain.connect(masterGain);
    finaleOsc.start(now + 1.1);
    finaleOsc.stop(now + 1.5);
  }

  /**
   * GAME START JINGLE - Match begins (1.2s)
   * Upbeat reverse of the defeat jingle - ascending instead of descending
   * Layers: Rising motif + welcoming chord + bright opening bell
   */
  public playGameStart(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Bright opening bell (reverse of defeat's closing bell)
    const bellOsc = this.audioContext.createOscillator();
    bellOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(494, now); // B4→C5 (reverse of defeat's C5→B4)
    bellOsc.frequency.exponentialRampToValueAtTime(523, now + 0.2);
    
    const bellGain = this.audioContext.createGain();
    bellGain.gain.setValueAtTime(0.3, now);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    bellOsc.connect(bellGain);
    bellGain.connect(masterGain);
    bellOsc.start(now);
    bellOsc.stop(now + 0.2);

    // Ascending motif (reverse of defeat's descending A4→G4→E4→D4)
    const ascentFreqs = [294, 330, 392, 440]; // D4→E4→G4→A4 (upward progression)
    ascentFreqs.forEach((freq, i) => {
      const ascentOsc = this.audioContext.createOscillator();
      ascentOsc.type = 'triangle'; // Warmer than defeat's sine, more upbeat
      ascentOsc.frequency.value = freq;
      
      const ascentGain = this.audioContext.createGain();
      ascentGain.gain.setValueAtTime(0.5, now + 0.2 + (i * 0.15)); // Brighter than defeat's 0.4
      ascentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45 + (i * 0.15));
      
      const ascentFilter = this.audioContext.createBiquadFilter();
      ascentFilter.type = 'highpass'; // Reverse of defeat's lowpass - more brightness
      ascentFilter.frequency.value = 200;
      
      ascentOsc.connect(ascentFilter);
      ascentFilter.connect(ascentGain);
      ascentGain.connect(masterGain);
      ascentOsc.start(now + 0.2 + (i * 0.15));
      ascentOsc.stop(now + 0.45 + (i * 0.15));
    });

    // Welcoming major chord (reverse of defeat's F major - use C major instead)
    const welcomeChord1 = this.audioContext.createOscillator();
    welcomeChord1.type = 'triangle'; // Brighter than defeat's sine
    welcomeChord1.frequency.value = 262; // C4
    
    const welcomeChord2 = this.audioContext.createOscillator();
    welcomeChord2.type = 'triangle';
    welcomeChord2.frequency.value = 330; // E4
    
    const welcomeChord3 = this.audioContext.createOscillator();
    welcomeChord3.type = 'triangle';
    welcomeChord3.frequency.value = 392; // G4
    
    const welcomeGain = this.audioContext.createGain();
    welcomeGain.gain.setValueAtTime(0.4, now + 0.8);
    welcomeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    welcomeChord1.connect(welcomeGain);
    welcomeChord2.connect(welcomeGain);
    welcomeChord3.connect(welcomeGain);
    welcomeGain.connect(masterGain);
    
    welcomeChord1.start(now + 0.8);
    welcomeChord2.start(now + 0.8);
    welcomeChord3.start(now + 0.8);
    welcomeChord1.stop(now + 1.2);
    welcomeChord2.stop(now + 1.2);
    welcomeChord3.stop(now + 1.2);

    // Add ±3% humanization jitter
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    // Apply slight frequency variation to the bell
    bellOsc.frequency.value *= jitter;
  }

  /**
   * DEFEAT JINGLE - Player eliminated (1.2s)
   * Soft, respectful defeat sound following gentle failure principles
   * Layers: Descending motif + respectful farewell + gentle closure
   */
  public playDefeatJingle(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume * 0.7; // Softer for negative reinforcement
    masterGain.connect(this.audioContext.destination);

    // Gentle descending motif (A minor descending)
    const descentFreqs = [440, 392, 330, 294]; // A4-G4-E4-D4
    descentFreqs.forEach((freq, i) => {
      const descentOsc = this.audioContext.createOscillator();
      descentOsc.type = 'sine';
      descentOsc.frequency.value = freq;
      
      const descentGain = this.audioContext.createGain();
      descentGain.gain.setValueAtTime(0.4, now + (i * 0.2));
      descentGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3 + (i * 0.2));
      
      const descentFilter = this.audioContext.createBiquadFilter();
      descentFilter.type = 'lowpass';
      descentFilter.frequency.value = 800;
      
      descentOsc.connect(descentFilter);
      descentFilter.connect(descentGain);
      descentGain.connect(masterGain);
      descentOsc.start(now + (i * 0.2));
      descentOsc.stop(now + 0.3 + (i * 0.2));
    });

    // Respectful farewell chord (F major - warm and respectful)
    const farewellChord1 = this.audioContext.createOscillator();
    farewellChord1.type = 'sine';
    farewellChord1.frequency.value = 175; // F3
    
    const farewellChord2 = this.audioContext.createOscillator();
    farewellChord2.type = 'sine';
    farewellChord2.frequency.value = 220; // A3
    
    const farewellChord3 = this.audioContext.createOscillator();
    farewellChord3.type = 'sine';
    farewellChord3.frequency.value = 262; // C4
    
    const farewellGain = this.audioContext.createGain();
    farewellGain.gain.setValueAtTime(0.3, now + 0.6);
    farewellGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    farewellChord1.connect(farewellGain);
    farewellChord2.connect(farewellGain);
    farewellChord3.connect(farewellGain);
    farewellGain.connect(masterGain);
    
    farewellChord1.start(now + 0.6);
    farewellChord2.start(now + 0.6);
    farewellChord3.start(now + 0.6);
    farewellChord1.stop(now + 1.2);
    farewellChord2.stop(now + 1.2);
    farewellChord3.stop(now + 1.2);

    // Gentle closing bell
    const bellOsc = this.audioContext.createOscillator();
    bellOsc.type = 'sine';
    bellOsc.frequency.setValueAtTime(523, now + 1.0);
    bellOsc.frequency.exponentialRampToValueAtTime(494, now + 1.2);
    
    const bellGain = this.audioContext.createGain();
    bellGain.gain.setValueAtTime(0.2, now + 1.0);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    bellOsc.connect(bellGain);
    bellGain.connect(masterGain);
    bellOsc.start(now + 1.0);
    bellOsc.stop(now + 1.2);
  }

  /**
   * VICTORY 1ST PLACE GRAND JINGLE - Ultimate triumph (2.5s)
   * The most rewarding sound - complete victory celebration
   * Layers: Victory fanfare + triumph cascade + domination finale + glory sparkles
   */
  public playVictory1stPlace(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Grand opening fanfare (G major triumphant)
    const grandFanfareFreqs = [196, 247, 294, 392, 494]; // G3-B3-D4-G4-B4
    grandFanfareFreqs.forEach((freq, i) => {
      const fanfareOsc = this.audioContext.createOscillator();
      fanfareOsc.type = 'triangle';
      fanfareOsc.frequency.value = freq;
      
      const fanfareGain = this.audioContext.createGain();
      fanfareGain.gain.setValueAtTime(0.6, now + (i * 0.1));
      fanfareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8 + (i * 0.1));
      
      fanfareOsc.connect(fanfareGain);
      fanfareGain.connect(masterGain);
      fanfareOsc.start(now + (i * 0.1));
      fanfareOsc.stop(now + 0.8 + (i * 0.1));
    });

    // Victory drums (powerful rhythm)
    for (let i = 0; i < 8; i++) {
      const drumOsc = this.audioContext.createOscillator();
      drumOsc.type = 'triangle';
      drumOsc.frequency.setValueAtTime(120, now + 0.6 + (i * 0.15));
      drumOsc.frequency.exponentialRampToValueAtTime(60, now + 0.7 + (i * 0.15));
      
      const drumGain = this.audioContext.createGain();
      drumGain.gain.setValueAtTime(0.7, now + 0.6 + (i * 0.15));
      drumGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75 + (i * 0.15));
      
      drumOsc.connect(drumGain);
      drumGain.connect(masterGain);
      drumOsc.start(now + 0.6 + (i * 0.15));
      drumOsc.stop(now + 0.75 + (i * 0.15));
    }

    // Triumph cascade (ascending victory)
    const triumphFreqs = [294, 370, 440, 554, 659, 831, 1047, 1319, 1661]; // D4 to A6
    triumphFreqs.forEach((freq, i) => {
      const triumphOsc = this.audioContext.createOscillator();
      triumphOsc.type = 'sine';
      triumphOsc.frequency.value = freq;
      
      const triumphGain = this.audioContext.createGain();
      triumphGain.gain.setValueAtTime(0.4, now + 1.2 + (i * 0.08));
      triumphGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5 + (i * 0.08));
      
      triumphOsc.connect(triumphGain);
      triumphGain.connect(masterGain);
      triumphOsc.start(now + 1.2 + (i * 0.08));
      triumphOsc.stop(now + 1.5 + (i * 0.08));
    });

    // Domination finale chord (C major 7th - absolutely triumphant)
    const dominationChord1 = this.audioContext.createOscillator();
    dominationChord1.type = 'triangle';
    dominationChord1.frequency.value = 523; // C5
    
    const dominationChord2 = this.audioContext.createOscillator();
    dominationChord2.type = 'triangle';
    dominationChord2.frequency.value = 659; // E5
    
    const dominationChord3 = this.audioContext.createOscillator();
    dominationChord3.type = 'triangle';
    dominationChord3.frequency.value = 784; // G5
    
    const dominationChord4 = this.audioContext.createOscillator();
    dominationChord4.type = 'triangle';
    dominationChord4.frequency.value = 987; // B5
    
    const dominationChord5 = this.audioContext.createOscillator();
    dominationChord5.type = 'triangle';
    dominationChord5.frequency.value = 1047; // C6
    
    const dominationGain = this.audioContext.createGain();
    dominationGain.gain.setValueAtTime(0.8, now + 1.8);
    dominationGain.gain.exponentialRampToValueAtTime(0.001, now + 2.3);
    
    dominationChord1.connect(dominationGain);
    dominationChord2.connect(dominationGain);
    dominationChord3.connect(dominationGain);
    dominationChord4.connect(dominationGain);
    dominationChord5.connect(dominationGain);
    dominationGain.connect(masterGain);
    
    dominationChord1.start(now + 1.8);
    dominationChord2.start(now + 1.8);
    dominationChord3.start(now + 1.8);
    dominationChord4.start(now + 1.8);
    dominationChord5.start(now + 1.8);
    dominationChord1.stop(now + 2.3);
    dominationChord2.stop(now + 2.3);
    dominationChord3.stop(now + 2.3);
    dominationChord4.stop(now + 2.3);
    dominationChord5.stop(now + 2.3);

    // Glory sparkles finale (ultimate celebration)
    const gloryOsc = this.audioContext.createOscillator();
    gloryOsc.type = 'sine';
    gloryOsc.frequency.setValueAtTime(2093, now + 2.1);
    gloryOsc.frequency.exponentialRampToValueAtTime(4186, now + 2.3);
    gloryOsc.frequency.exponentialRampToValueAtTime(3136, now + 2.5);
    
    const gloryGain = this.audioContext.createGain();
    gloryGain.gain.setValueAtTime(0.5, now + 2.1);
    gloryGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
    
    gloryOsc.connect(gloryGain);
    gloryGain.connect(masterGain);
    gloryOsc.start(now + 2.1);
    gloryOsc.stop(now + 2.5);

    // Final celebration bells
    const celebrationFreqs = [1047, 1319, 1661, 2093];
    celebrationFreqs.forEach((freq, i) => {
      const celebrationOsc = this.audioContext.createOscillator();
      celebrationOsc.type = 'sine';
      celebrationOsc.frequency.value = freq;
      
      const celebrationGain = this.audioContext.createGain();
      celebrationGain.gain.setValueAtTime(0.3, now + 2.2 + (i * 0.05));
      celebrationGain.gain.exponentialRampToValueAtTime(0.001, now + 2.4 + (i * 0.05));
      
      celebrationOsc.connect(celebrationGain);
      celebrationGain.connect(masterGain);
      celebrationOsc.start(now + 2.2 + (i * 0.05));
      celebrationOsc.stop(now + 2.4 + (i * 0.05));
    });
  }

  // ==========================================
  // PHASE 3: IMPACT NOISES (0.3-0.8s)
  // Nuclear, structural destruction, and environmental effects
  // ==========================================

  /**
   * NUKE DETONATION - Massive nuclear explosion (0.8s)
   * Based on: Atom/Hydrogen bomb impact, variable flight time
   * Layers: Initial flash + cascade explosion + devastation rumble
   */
  public playNukeDetonation(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Initial flash (massive burst)
    const flashOsc = this.audioContext.createOscillator();
    flashOsc.type = 'square';
    flashOsc.frequency.setValueAtTime(4000, now);
    flashOsc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
    
    const flashGain = this.audioContext.createGain();
    flashGain.gain.setValueAtTime(0.9, now);
    flashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    flashOsc.connect(flashGain);
    flashGain.connect(masterGain);
    flashOsc.start(now);
    flashOsc.stop(now + 0.05);

    // Cascade explosion layers
    const cascadeFreqs = [60, 80, 120, 180, 250, 350];
    cascadeFreqs.forEach((freq, i) => {
      const cascadeOsc = this.audioContext.createOscillator();
      cascadeOsc.type = 'sine';
      cascadeOsc.frequency.setValueAtTime(freq, now + 0.1 + (i * 0.05));
      cascadeOsc.frequency.exponentialRampToValueAtTime(freq * 0.3, now + 0.4 + (i * 0.05));
      
      const cascadeGain = this.audioContext.createGain();
      cascadeGain.gain.setValueAtTime(0.6, now + 0.1 + (i * 0.05));
      cascadeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + (i * 0.05));
      
      cascadeOsc.connect(cascadeGain);
      cascadeGain.connect(masterGain);
      cascadeOsc.start(now + 0.1 + (i * 0.05));
      cascadeOsc.stop(now + 0.6 + (i * 0.05));
    });

    // Devastation rumble (long tail)
    const rumbleOsc = this.audioContext.createOscillator();
    rumbleOsc.type = 'sine';
    rumbleOsc.frequency.setValueAtTime(40, now + 0.3);
    rumbleOsc.frequency.setValueAtTime(30, now + 0.6);
    rumbleOsc.frequency.exponentialRampToValueAtTime(20, now + 0.8);
    
    const rumbleGain = this.audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0.5, now + 0.3);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(now + 0.3);
    rumbleOsc.stop(now + 0.8);
  }

  /**
   * HYDROGEN BOMB IMPACT - World-ending blast (1.8s)
   * Based on: 5M gold cost, 80-100 tile blast radius
   * Much more devastating than atom bomb with apocalyptic aftermath
   */
  public playHydrogenBombImpact(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Apocalyptic flash - much more intense than atom bomb
    const megaFlashOsc = this.audioContext.createOscillator();
    megaFlashOsc.type = 'square';
    megaFlashOsc.frequency.setValueAtTime(8000, now);
    megaFlashOsc.frequency.exponentialRampToValueAtTime(100, now + 0.12);
    
    const megaFlashGain = this.audioContext.createGain();
    megaFlashGain.gain.setValueAtTime(1.0, now);
    megaFlashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    megaFlashOsc.connect(megaFlashGain);
    megaFlashGain.connect(masterGain);
    megaFlashOsc.start(now);
    megaFlashOsc.stop(now + 0.12);

    // Secondary flash harmonics for overwhelming intensity
    [1.5, 2.0, 3.0].forEach((harmonic, i) => {
      const harmOsc = this.audioContext.createOscillator();
      harmOsc.type = 'square';
      harmOsc.frequency.setValueAtTime(4000 * harmonic, now + 0.02 + (i * 0.01));
      harmOsc.frequency.exponentialRampToValueAtTime(150 * harmonic, now + 0.08 + (i * 0.01));
      
      const harmGain = this.audioContext.createGain();
      harmGain.gain.setValueAtTime(0.4 - (i * 0.1), now + 0.02 + (i * 0.01));
      harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08 + (i * 0.01));
      
      harmOsc.connect(harmGain);
      harmGain.connect(masterGain);
      harmOsc.start(now + 0.02 + (i * 0.01));
      harmOsc.stop(now + 0.08 + (i * 0.01));
    });

    // Multi-stage devastation cascade - much longer and deeper
    const devastationFreqs = [25, 40, 60, 85, 120, 170, 240, 340, 480, 680];
    devastationFreqs.forEach((freq, i) => {
      const devOsc = this.audioContext.createOscillator();
      devOsc.type = 'sine';
      devOsc.frequency.setValueAtTime(freq, now + 0.15 + (i * 0.06));
      devOsc.frequency.exponentialRampToValueAtTime(freq * 0.15, now + 0.8 + (i * 0.06));
      
      const devGain = this.audioContext.createGain();
      devGain.gain.setValueAtTime(0.8 - (i * 0.02), now + 0.15 + (i * 0.06));
      devGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2 + (i * 0.06));
      
      devOsc.connect(devGain);
      devGain.connect(masterGain);
      devOsc.start(now + 0.15 + (i * 0.06));
      devOsc.stop(now + 1.2 + (i * 0.06));
    });

    // Cataclysmic sub-bass layer
    const subBassOsc = this.audioContext.createOscillator();
    subBassOsc.type = 'sine';
    subBassOsc.frequency.setValueAtTime(18, now + 0.3);
    subBassOsc.frequency.exponentialRampToValueAtTime(12, now + 1.5);
    
    const subBassGain = this.audioContext.createGain();
    subBassGain.gain.setValueAtTime(0.9, now + 0.3);
    subBassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    
    subBassOsc.connect(subBassGain);
    subBassGain.connect(masterGain);
    subBassOsc.start(now + 0.3);
    subBassOsc.stop(now + 1.5);

    // World-ending aftermath tremors
    [28, 22, 16].forEach((freq, i) => {
      const tremOsc = this.audioContext.createOscillator();
      tremOsc.type = 'sine';
      tremOsc.frequency.setValueAtTime(freq, now + 0.8 + (i * 0.15));
      tremOsc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 1.8 + (i * 0.15));
      
      const tremGain = this.audioContext.createGain();
      tremGain.gain.setValueAtTime(0.7 - (i * 0.1), now + 0.8 + (i * 0.15));
      tremGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + (i * 0.15));
      
      tremOsc.connect(tremGain);
      tremGain.connect(masterGain);
      tremOsc.start(now + 0.8 + (i * 0.15));
      tremOsc.stop(now + 1.8 + (i * 0.15));
    });
  }

  /**
   * SAM INTERCEPT SUCCESS - Missile destroyed mid-air (0.45s)
   * Based on: 75-tick cooldown, 100% hit rate, 300 HP damage to nukes
   * Successful intercept explosion with victory confirmation
   */
  public playSAMIntercept(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Successful intercept explosion
    const interceptOsc = this.audioContext.createOscillator();
    interceptOsc.type = 'square';
    interceptOsc.frequency.setValueAtTime(2200, now);
    interceptOsc.frequency.exponentialRampToValueAtTime(800, now + 0.12);
    
    const interceptGain = this.audioContext.createGain();
    interceptGain.gain.setValueAtTime(0.7, now);
    interceptGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    interceptOsc.connect(interceptGain);
    interceptGain.connect(masterGain);
    interceptOsc.start(now);
    interceptOsc.stop(now + 0.12);

    // Debris cascade
    const debrisFreqs = [1600, 1200, 900, 650];
    debrisFreqs.forEach((freq, i) => {
      const debrisOsc = this.audioContext.createOscillator();
      debrisOsc.type = 'triangle';
      debrisOsc.frequency.value = freq;
      
      const debrisGain = this.audioContext.createGain();
      debrisGain.gain.setValueAtTime(0.3, now + 0.08 + (i * 0.05));
      debrisGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + (i * 0.05));
      
      debrisOsc.connect(debrisGain);
      debrisGain.connect(masterGain);
      debrisOsc.start(now + 0.08 + (i * 0.05));
      debrisOsc.stop(now + 0.2 + (i * 0.05));
    });

    // Victory confirmation tone
    const victoryOsc = this.audioContext.createOscillator();
    victoryOsc.type = 'triangle';
    victoryOsc.frequency.setValueAtTime(880, now + 0.25);
    victoryOsc.frequency.exponentialRampToValueAtTime(1760, now + 0.35);
    
    const victoryGain = this.audioContext.createGain();
    victoryGain.gain.setValueAtTime(0.4, now + 0.25);
    victoryGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    
    victoryOsc.connect(victoryGain);
    victoryGain.connect(masterGain);
    victoryOsc.start(now + 0.25);
    victoryOsc.stop(now + 0.45);
  }

  /**
   * BUILDING DESTRUCTION - Instant structure collapse (0.25s)
   * Major structure destroyed instantly in combat
   * Layers: Instant crack + rapid rumble + final crash
   */
  public playBuildingDestruction(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Instant destruction crack
    const crackOsc = this.audioContext.createOscillator();
    crackOsc.type = 'square';
    crackOsc.frequency.setValueAtTime(1200, now);
    crackOsc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    
    const crackGain = this.audioContext.createGain();
    crackGain.gain.setValueAtTime(0.8, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    crackOsc.connect(crackGain);
    crackGain.connect(masterGain);
    crackOsc.start(now);
    crackOsc.stop(now + 0.08);

    // Rapid collapse rumble
    const rumbleOsc = this.audioContext.createOscillator();
    rumbleOsc.type = 'triangle';
    rumbleOsc.frequency.setValueAtTime(200, now + 0.02);
    rumbleOsc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    
    const rumbleGain = this.audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0.7, now + 0.02);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumbleOsc.start(now + 0.02);
    rumbleOsc.stop(now + 0.15);

    // Final crash
    const crashOsc = this.audioContext.createOscillator();
    crashOsc.type = 'sine';
    crashOsc.frequency.setValueAtTime(150, now + 0.12);
    crashOsc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
    
    const crashGain = this.audioContext.createGain();
    crashGain.gain.setValueAtTime(0.6, now + 0.12);
    crashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    
    crashOsc.connect(crashGain);
    crashGain.connect(masterGain);
    crashOsc.start(now + 0.12);
    crashOsc.stop(now + 0.25);
  }

  /**
   * UNIT ELIMINATION - Heavy unit destroyed (0.5s)
   * Large military unit completely eliminated
   * Layers: Heavy unit blast + metal wreckage + final settling
   */
  public playUnitElimination(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Heavy unit destruction blast
    const blastOsc = this.audioContext.createOscillator();
    blastOsc.type = 'square';
    blastOsc.frequency.setValueAtTime(1200, now);
    blastOsc.frequency.exponentialRampToValueAtTime(300, now + 0.12);
    
    const blastGain = this.audioContext.createGain();
    blastGain.gain.setValueAtTime(0.7, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    blastOsc.connect(blastGain);
    blastGain.connect(masterGain);
    blastOsc.start(now);
    blastOsc.stop(now + 0.12);

    // Metal wreckage sounds
    const wreckageFreqs = [900, 650, 450];
    wreckageFreqs.forEach((freq, i) => {
      const wreckOsc = this.audioContext.createOscillator();
      wreckOsc.type = 'triangle';
      wreckOsc.frequency.value = freq;
      
      const wreckGain = this.audioContext.createGain();
      wreckGain.gain.setValueAtTime(0.4, now + 0.08 + (i * 0.06));
      wreckGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2 + (i * 0.06));
      
      wreckOsc.connect(wreckGain);
      wreckGain.connect(masterGain);
      wreckOsc.start(now + 0.08 + (i * 0.06));
      wreckOsc.stop(now + 0.2 + (i * 0.06));
    });

    // Final settling
    const settleOsc = this.audioContext.createOscillator();
    settleOsc.type = 'sine';
    settleOsc.frequency.setValueAtTime(200, now + 0.3);
    settleOsc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
    
    const settleGain = this.audioContext.createGain();
    settleGain.gain.setValueAtTime(0.3, now + 0.3);
    settleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    settleOsc.connect(settleGain);
    settleGain.connect(masterGain);
    settleOsc.start(now + 0.3);
    settleOsc.stop(now + 0.5);
  }

  /**
   * ARMOR BREAK - Defense overcome (0.4s)
   * Defensive systems breached
   * Layers: Sharp crack + armor shattering + vulnerability exposed
   */
  public playArmorBreak(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Sharp crack of armor breaking
    const crackOsc = this.audioContext.createOscillator();
    crackOsc.type = 'square';
    crackOsc.frequency.setValueAtTime(2800, now);
    crackOsc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    
    const crackGain = this.audioContext.createGain();
    crackGain.gain.setValueAtTime(0.8, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    crackOsc.connect(crackGain);
    crackGain.connect(masterGain);
    crackOsc.start(now);
    crackOsc.stop(now + 0.08);

    // Armor shattering cascade
    const shatterFreqs = [1800, 1400, 1000, 700];
    shatterFreqs.forEach((freq, i) => {
      const shatterOsc = this.audioContext.createOscillator();
      shatterOsc.type = 'triangle';
      shatterOsc.frequency.value = freq;
      
      const shatterGain = this.audioContext.createGain();
      shatterGain.gain.setValueAtTime(0.5, now + 0.05 + (i * 0.04));
      shatterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + (i * 0.04));
      
      shatterOsc.connect(shatterGain);
      shatterGain.connect(masterGain);
      shatterOsc.start(now + 0.05 + (i * 0.04));
      shatterOsc.stop(now + 0.15 + (i * 0.04));
    });

    // Vulnerability exposed (ominous undertone)
    const vulnOsc = this.audioContext.createOscillator();
    vulnOsc.type = 'sine';
    vulnOsc.frequency.setValueAtTime(150, now + 0.25);
    vulnOsc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    
    const vulnGain = this.audioContext.createGain();
    vulnGain.gain.setValueAtTime(0.3, now + 0.25);
    vulnGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    vulnOsc.connect(vulnGain);
    vulnGain.connect(masterGain);
    vulnOsc.start(now + 0.25);
    vulnOsc.stop(now + 0.4);
  }

  /**
   * FALLOUT CREATION - Radioactive terrain formed (0.7s)
   * Nuclear weapon creates permanent fallout
   * Layers: Radioactive hiss + contamination spread + permanent damage
   */
  public playFalloutCreation(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Radioactive hiss layer
    const noiseBuffer = this.createNoiseBuffer(0.7);
    const noiseSource = this.audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.0, now);
    noiseGain.gain.linearRampToValueAtTime(0.4, now + 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 800;
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(now);
    noiseSource.stop(now + 0.7);

    // Contamination spread (eerie tones)
    const contamFreqs = [110, 147, 220, 330];
    contamFreqs.forEach((freq, i) => {
      const contamOsc = this.audioContext.createOscillator();
      contamOsc.type = 'sine';
      contamOsc.frequency.setValueAtTime(freq, now + 0.15 + (i * 0.1));
      contamOsc.frequency.exponentialRampToValueAtTime(freq * 0.8, now + 0.4 + (i * 0.1));
      
      const contamGain = this.audioContext.createGain();
      contamGain.gain.setValueAtTime(0.2, now + 0.15 + (i * 0.1));
      contamGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i * 0.1));
      
      contamOsc.connect(contamGain);
      contamGain.connect(masterGain);
      contamOsc.start(now + 0.15 + (i * 0.1));
      contamOsc.stop(now + 0.5 + (i * 0.1));
    });

    // Permanent damage undertone
    const damageOsc = this.audioContext.createOscillator();
    damageOsc.type = 'sine';
    damageOsc.frequency.setValueAtTime(55, now + 0.3);
    damageOsc.frequency.setValueAtTime(45, now + 0.6);
    
    const damageGain = this.audioContext.createGain();
    damageGain.gain.setValueAtTime(0.3, now + 0.3);
    damageGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    damageOsc.connect(damageGain);
    damageGain.connect(masterGain);
    damageOsc.start(now + 0.3);
    damageOsc.stop(now + 0.7);
  }

  /**
   * SHOCKWAVE IMPACT - Area effect damage (0.6s)
   * Large-scale area damage with ripple effects
   * Layers: Shockwave pulse + area effect ripples
   */
  public playShockwaveImpact(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Shockwave pulse
    const pulseOsc = this.audioContext.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.setValueAtTime(80, now);
    pulseOsc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    pulseOsc.frequency.setValueAtTime(60, now + 0.3);
    pulseOsc.frequency.exponentialRampToValueAtTime(30, now + 0.6);
    
    const pulseGain = this.audioContext.createGain();
    pulseGain.gain.setValueAtTime(0.8, now);
    pulseGain.gain.exponentialRampToValueAtTime(0.3, now + 0.2);
    pulseGain.gain.setValueAtTime(0.5, now + 0.3);
    pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    pulseOsc.connect(pulseGain);
    pulseGain.connect(masterGain);
    pulseOsc.start(now);
    pulseOsc.stop(now + 0.6);

    // Area effect ripples
    const rippleFreqs = [200, 150, 100];
    rippleFreqs.forEach((freq, i) => {
      const rippleOsc = this.audioContext.createOscillator();
      rippleOsc.type = 'triangle';
      rippleOsc.frequency.setValueAtTime(freq, now + 0.1 + (i * 0.08));
      rippleOsc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.3 + (i * 0.08));
      
      const rippleGain = this.audioContext.createGain();
      rippleGain.gain.setValueAtTime(0.4, now + 0.1 + (i * 0.08));
      rippleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4 + (i * 0.08));
      
      rippleOsc.connect(rippleGain);
      rippleGain.connect(masterGain);
      rippleOsc.start(now + 0.1 + (i * 0.08));
      rippleOsc.stop(now + 0.4 + (i * 0.08));
    });
  }

  // Placeholder methods for future phases

  // ==========================================
  // PHASE 4: SHIP NOISES (0.6-1.0s)
  // Naval operations and fleet movements
  // ==========================================

  /**
   * TRADE SHIP ARRIVAL - Economic vessel docking (0.8s)
   * Based on: Auto-generated trade ships, income generation
   * Layers: Engine approach + docking clank + cargo settle
   */
  public playTradeShipArrival(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Engine approach (distant to close)
    const engineOsc = this.audioContext.createOscillator();
    engineOsc.type = 'triangle';
    engineOsc.frequency.setValueAtTime(80, now);
    engineOsc.frequency.exponentialRampToValueAtTime(120, now + 0.4);
    engineOsc.frequency.exponentialRampToValueAtTime(100, now + 0.6);
    
    const engineGain = this.audioContext.createGain();
    engineGain.gain.setValueAtTime(0.2, now);
    engineGain.gain.linearRampToValueAtTime(0.5, now + 0.4);
    engineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    engineOsc.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start(now);
    engineOsc.stop(now + 0.6);

    // Docking clank
    const clankOsc = this.audioContext.createOscillator();
    clankOsc.type = 'square';
    clankOsc.frequency.value = 300;
    
    const clankGain = this.audioContext.createGain();
    clankGain.gain.setValueAtTime(0.4, now + 0.5);
    clankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    
    clankOsc.connect(clankGain);
    clankGain.connect(masterGain);
    clankOsc.start(now + 0.5);
    clankOsc.stop(now + 0.65);

    // Cargo settle
    const settleOsc = this.audioContext.createOscillator();
    settleOsc.type = 'sine';
    settleOsc.frequency.setValueAtTime(150, now + 0.6);
    settleOsc.frequency.exponentialRampToValueAtTime(80, now + 0.8);
    
    const settleGain = this.audioContext.createGain();
    settleGain.gain.setValueAtTime(0.3, now + 0.6);
    settleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    settleOsc.connect(settleGain);
    settleGain.connect(masterGain);
    settleOsc.start(now + 0.6);
    settleOsc.stop(now + 0.8);
  }

  /**
   * TRANSPORT SHIP LOADING - Troop transport preparation (0.9s)
   * Based on: Cross-water troop movement, variable capacity
   * Layers: Hydraulics + boarding sounds + departure prep
   */
  public playTransportShipLoading(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Hydraulic loading systems
    const hydraulicOsc = this.audioContext.createOscillator();
    hydraulicOsc.type = 'sawtooth';
    hydraulicOsc.frequency.setValueAtTime(60, now);
    hydraulicOsc.frequency.linearRampToValueAtTime(90, now + 0.3);
    hydraulicOsc.frequency.linearRampToValueAtTime(70, now + 0.6);
    
    const hydraulicGain = this.audioContext.createGain();
    hydraulicGain.gain.setValueAtTime(0.4, now);
    hydraulicGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    hydraulicOsc.connect(hydraulicGain);
    hydraulicGain.connect(masterGain);
    hydraulicOsc.start(now);
    hydraulicOsc.stop(now + 0.6);

    // Boarding activity (mechanical sounds)
    for (let i = 0; i < 4; i++) {
      const boardingOsc = this.audioContext.createOscillator();
      boardingOsc.type = 'square';
      boardingOsc.frequency.value = 200 + (i * 50);
      
      const boardingGain = this.audioContext.createGain();
      boardingGain.gain.setValueAtTime(0.3, now + 0.2 + (i * 0.1));
      boardingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28 + (i * 0.1));
      
      boardingOsc.connect(boardingGain);
      boardingGain.connect(masterGain);
      boardingOsc.start(now + 0.2 + (i * 0.1));
      boardingOsc.stop(now + 0.28 + (i * 0.1));
    }

    // Departure preparation (engine warmup)
    const prepOsc = this.audioContext.createOscillator();
    prepOsc.type = 'triangle';
    prepOsc.frequency.setValueAtTime(90, now + 0.6);
    prepOsc.frequency.exponentialRampToValueAtTime(130, now + 0.9);
    
    const prepGain = this.audioContext.createGain();
    prepGain.gain.setValueAtTime(0.3, now + 0.6);
    prepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    
    prepOsc.connect(prepGain);
    prepGain.connect(masterGain);
    prepOsc.start(now + 0.6);
    prepOsc.stop(now + 0.9);
  }

  /**
   * WARSHIP PATROL - Naval unit on patrol route (0.7s)
   * Based on: 100-200 tile patrol ranges, constant vigilance
   * Layers: Steady engine + sonar ping + wake wash
   */
  public playWarshipPatrol(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Steady patrol engine
    const engineOsc = this.audioContext.createOscillator();
    engineOsc.type = 'triangle';
    engineOsc.frequency.value = 110;
    
    const engineGain = this.audioContext.createGain();
    engineGain.gain.setValueAtTime(0.4, now);
    engineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    engineOsc.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start(now);
    engineOsc.stop(now + 0.7);

    // Sonar ping sequence (naval awareness)
    const sonarPings = [0.2, 0.45];
    sonarPings.forEach(time => {
      const pingOsc = this.audioContext.createOscillator();
      pingOsc.type = 'sine';
      pingOsc.frequency.setValueAtTime(1200, now + time);
      pingOsc.frequency.exponentialRampToValueAtTime(800, now + time + 0.1);
      
      const pingGain = this.audioContext.createGain();
      pingGain.gain.setValueAtTime(0.5, now + time);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + time + 0.1);
      
      pingOsc.connect(pingGain);
      pingGain.connect(masterGain);
      pingOsc.start(now + time);
      pingOsc.stop(now + time + 0.1);
    });

    // Wake wash (water displacement)
    const wakeNoise = this.createNoiseBuffer(0.4);
    const wakeSource = this.audioContext.createBufferSource();
    wakeSource.buffer = wakeNoise;
    
    const wakeGain = this.audioContext.createGain();
    wakeGain.gain.setValueAtTime(0.2, now + 0.3);
    wakeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    
    const wakeFilter = this.audioContext.createBiquadFilter();
    wakeFilter.type = 'lowpass';
    wakeFilter.frequency.value = 400;
    
    wakeSource.connect(wakeFilter);
    wakeFilter.connect(wakeGain);
    wakeGain.connect(masterGain);
    wakeSource.start(now + 0.3);
    wakeSource.stop(now + 0.7);
  }

  /**
   * FLEET FORMATION - Multiple ships coordinating (1.0s)
   * Based on: Multiple warships working together
   * Layers: Coordinated engines + formation signals + synchronized movement
   */
  public playFleetFormation(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Coordinated engine sounds (3 ships in formation)
    const engineFreqs = [95, 110, 125];
    engineFreqs.forEach((freq, i) => {
      const engineOsc = this.audioContext.createOscillator();
      engineOsc.type = 'triangle';
      engineOsc.frequency.value = freq;
      
      const engineGain = this.audioContext.createGain();
      engineGain.gain.setValueAtTime(0.25, now + (i * 0.1));
      engineGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
      
      engineOsc.connect(engineGain);
      engineGain.connect(masterGain);
      engineOsc.start(now + (i * 0.1));
      engineOsc.stop(now + 1.0);
    });

    // Formation coordination signals
    const signalFreqs = [1600, 1400, 1200];
    signalFreqs.forEach((freq, i) => {
      const signalOsc = this.audioContext.createOscillator();
      signalOsc.type = 'square';
      signalOsc.frequency.value = freq;
      
      const signalGain = this.audioContext.createGain();
      signalGain.gain.setValueAtTime(0.3, now + 0.3 + (i * 0.15));
      signalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 + (i * 0.15));
      
      signalOsc.connect(signalGain);
      signalGain.connect(masterGain);
      signalOsc.start(now + 0.3 + (i * 0.15));
      signalOsc.stop(now + 0.35 + (i * 0.15));
    });

    // Synchronized wake (coordinated water displacement)
    const syncWakeOsc = this.audioContext.createOscillator();
    syncWakeOsc.type = 'sine';
    syncWakeOsc.frequency.setValueAtTime(200, now + 0.6);
    syncWakeOsc.frequency.exponentialRampToValueAtTime(120, now + 1.0);
    
    const syncWakeGain = this.audioContext.createGain();
    syncWakeGain.gain.setValueAtTime(0.4, now + 0.6);
    syncWakeGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    syncWakeOsc.connect(syncWakeGain);
    syncWakeGain.connect(masterGain);
    syncWakeOsc.start(now + 0.6);
    syncWakeOsc.stop(now + 1.0);
  }

  /**
   * PORT ACTIVITY - Harbor operations busy (0.6s)
   * Based on: Trade ship generation, multiple port operations
   * Layers: Harbor ambience + crane operations + ship horns
   */
  public playPortActivity(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Harbor ambience (mechanical activity)
    const ambientNoise = this.createNoiseBuffer(0.6);
    const ambientSource = this.audioContext.createBufferSource();
    ambientSource.buffer = ambientNoise;
    
    const ambientGain = this.audioContext.createGain();
    ambientGain.gain.setValueAtTime(0.2, now);
    ambientGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    const ambientFilter = this.audioContext.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.value = 300;
    
    ambientSource.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(masterGain);
    ambientSource.start(now);
    ambientSource.stop(now + 0.6);

    // Crane operations (mechanical loading/unloading)
    for (let i = 0; i < 3; i++) {
      const craneOsc = this.audioContext.createOscillator();
      craneOsc.type = 'sawtooth';
      craneOsc.frequency.value = 70 + (i * 15);
      
      const craneGain = this.audioContext.createGain();
      craneGain.gain.setValueAtTime(0.3, now + (i * 0.15));
      craneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + (i * 0.15));
      
      craneOsc.connect(craneGain);
      craneGain.connect(masterGain);
      craneOsc.start(now + (i * 0.15));
      craneOsc.stop(now + 0.1 + (i * 0.15));
    }

    // Ship horns (communication)
    const hornOsc = this.audioContext.createOscillator();
    hornOsc.type = 'triangle';
    hornOsc.frequency.setValueAtTime(150, now + 0.4);
    hornOsc.frequency.setValueAtTime(200, now + 0.45);
    hornOsc.frequency.setValueAtTime(150, now + 0.5);
    
    const hornGain = this.audioContext.createGain();
    hornGain.gain.setValueAtTime(0.4, now + 0.4);
    hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    hornOsc.connect(hornGain);
    hornGain.connect(masterGain);
    hornOsc.start(now + 0.4);
    hornOsc.stop(now + 0.6);
  }

  /**
   * NAVAL CONSTRUCTION - Warship being built (0.9s)
   * Based on: Viper/Condor construction times (2-5 seconds)
   * Layers: Heavy construction + welding + systems activation
   */
  public playNavalConstruction(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Heavy construction (metal work)
    const constructionOsc = this.audioContext.createOscillator();
    constructionOsc.type = 'square';
    constructionOsc.frequency.setValueAtTime(80, now);
    constructionOsc.frequency.linearRampToValueAtTime(120, now + 0.4);
    constructionOsc.frequency.linearRampToValueAtTime(90, now + 0.6);
    
    const constructionGain = this.audioContext.createGain();
    constructionGain.gain.setValueAtTime(0.5, now);
    constructionGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    constructionOsc.connect(constructionGain);
    constructionGain.connect(masterGain);
    constructionOsc.start(now);
    constructionOsc.stop(now + 0.6);

    // Welding operations (high frequency sparks)
    for (let i = 0; i < 5; i++) {
      const weldOsc = this.audioContext.createOscillator();
      weldOsc.type = 'sawtooth';
      weldOsc.frequency.value = 1800 + (i * 200);
      
      const weldGain = this.audioContext.createGain();
      weldGain.gain.setValueAtTime(0.3, now + 0.1 + (i * 0.08));
      weldGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15 + (i * 0.08));
      
      weldOsc.connect(weldGain);
      weldGain.connect(masterGain);
      weldOsc.start(now + 0.1 + (i * 0.08));
      weldOsc.stop(now + 0.15 + (i * 0.08));
    }

    // Systems activation (naval systems coming online)
    const systemsOsc = this.audioContext.createOscillator();
    systemsOsc.type = 'sine';
    systemsOsc.frequency.setValueAtTime(400, now + 0.6);
    systemsOsc.frequency.exponentialRampToValueAtTime(800, now + 0.75);
    systemsOsc.frequency.exponentialRampToValueAtTime(600, now + 0.9);
    
    const systemsGain = this.audioContext.createGain();
    systemsGain.gain.setValueAtTime(0.4, now + 0.6);
    systemsGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    
    systemsOsc.connect(systemsGain);
    systemsGain.connect(masterGain);
    systemsOsc.start(now + 0.6);
    systemsOsc.stop(now + 0.9);
  }

  /**
   * MISSILE DEPLOY - Nuclear weapon launch sequence (0.65s)
   * Based on: Atom bomb/Hydrogen bomb launch from missile silo
   * Layers: Mechanical release + ignition sequence + thrust noise
   * Used for both Atom Bomb and Hydrogen Bomb launches
   */
  public playMissileDeploy(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Mechanical release
    const mechOsc = this.audioContext.createOscillator();
    mechOsc.type = 'square';
    mechOsc.frequency.setValueAtTime(200, now);
    mechOsc.frequency.setValueAtTime(150, now + 0.05);
    
    const mechGain = this.audioContext.createGain();
    mechGain.gain.setValueAtTime(0.4, now);
    mechGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    mechOsc.connect(mechGain);
    mechGain.connect(masterGain);
    mechOsc.start(now);
    mechOsc.stop(now + 0.1);

    // Ignition sequence
    const igniteOsc = this.audioContext.createOscillator();
    igniteOsc.type = 'sawtooth';
    igniteOsc.frequency.setValueAtTime(100, now + 0.1);
    igniteOsc.frequency.exponentialRampToValueAtTime(800, now + 0.4);
    
    const igniteGain = this.audioContext.createGain();
    igniteGain.gain.setValueAtTime(0, now + 0.1);
    igniteGain.gain.linearRampToValueAtTime(0.6, now + 0.2);
    igniteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    const igniteFilter = this.audioContext.createBiquadFilter();
    igniteFilter.type = 'lowpass';
    igniteFilter.frequency.value = 1000;
    
    igniteOsc.connect(igniteFilter);
    igniteFilter.connect(igniteGain);
    igniteGain.connect(masterGain);
    igniteOsc.start(now + 0.1);
    igniteOsc.stop(now + 0.4);

    // Thrust noise
    const thrustNoise = this.createNoiseBuffer(0.5);
    const thrustSource = this.audioContext.createBufferSource();
    thrustSource.buffer = thrustNoise;
    
    const thrustGain = this.audioContext.createGain();
    thrustGain.gain.setValueAtTime(0, now + 0.15);
    thrustGain.gain.linearRampToValueAtTime(0.3, now + 0.25);
    thrustGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    
    const thrustFilter = this.audioContext.createBiquadFilter();
    thrustFilter.type = 'bandpass';
    thrustFilter.frequency.value = 500;
    thrustFilter.Q.value = 2;
    
    thrustSource.connect(thrustFilter);
    thrustFilter.connect(thrustGain);
    thrustGain.connect(masterGain);
    thrustSource.start(now + 0.15);
  }

  /**
   * PLASMA BURST - Warship firing sound for both Viper and Condor (0.2s)
   * Based on: 20-tick attack cycle for both ships
   * Layers: Mid-frequency ping + energy discharge + sub bass
   * Replaces previous ship firing sounds with space-themed energy weapon
   */
  public playPlasmaBurst(volume: number = 0.7): void {
    const now = this.audioContext.currentTime;
    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(this.audioContext.destination);

    // Clarity layer - mid frequency ping
    const clarityOsc = this.audioContext.createOscillator();
    clarityOsc.type = 'triangle';
    clarityOsc.frequency.setValueAtTime(800, now);
    clarityOsc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    
    const clarityGain = this.audioContext.createGain();
    clarityGain.gain.setValueAtTime(0.6, now);
    clarityGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    clarityOsc.connect(clarityGain);
    clarityGain.connect(masterGain);
    clarityOsc.start(now);
    clarityOsc.stop(now + 0.1);

    // Body layer - energy discharge
    const bodyOsc = this.audioContext.createOscillator();
    bodyOsc.type = 'sawtooth';
    bodyOsc.frequency.setValueAtTime(400, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
    
    const bodyGain = this.audioContext.createGain();
    bodyGain.gain.setValueAtTime(0.5, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    const bodyFilter = this.audioContext.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 1000;
    
    bodyOsc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(masterGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.15);

    // Weight layer - sub bass
    const subOsc = this.audioContext.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(80, now);
    subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.2);
    
    const subGain = this.audioContext.createGain();
    subGain.gain.setValueAtTime(0.3, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.2);
  }

  /**
   * Get the audio context for external use (e.g., setting up compressor)
   */
  public getContext(): AudioContext | null {
    return this.initialized ? this.audioContext : null;
  }
}