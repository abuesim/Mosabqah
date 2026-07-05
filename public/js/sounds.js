// Web Audio API Synthesizer for Mosabqah Game Sound Effects
// No external assets required! Runs natively in the browser.

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.heartbeatTimer = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume context if suspended (browser security policy)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTick() {
    if (this.muted) return;
    this.init();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playCorrect() {
    if (this.muted) return;
    this.init();

    const now = this.ctx.currentTime;
    
    // Quick double chime (C5 -> E5 -> G5)
    this.playTone(523.25, 0.1, 0.15, 'sine'); // C5
    setTimeout(() => {
      this.playTone(659.25, 0.1, 0.15, 'sine'); // E5
    }, 120);
    setTimeout(() => {
      this.playTone(783.99, 0.15, 0.3, 'sine'); // G5
    }, 240);
  }

  playIncorrect() {
    if (this.muted) return;
    this.init();
    
    const now = this.ctx.currentTime;
    
    // Low buzzer (F2 -> D2)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.4);
    
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
    
    osc.start();
    osc.stop(now + 0.4);
  }

  playSuccess() {
    if (this.muted) return;
    this.init();
    
    // Ascending celebratory notes
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 0.08, 0.2, 'triangle');
      }, idx * 100);
    });
  }

  // Heartbeat: two low thumps ("lub-dub") - creates suspenseful pulse feeling
  playHeartbeat() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;

    // First thump ("lub") — deeper, louder
    this.playThump(now, 55, 0.18, 0.16);
    // Second thump ("dub") — slightly higher, softer, right after
    this.playThump(now + 0.18, 75, 0.12, 0.14);
  }

  playThump(startTime, freq, volume, duration) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.6, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq, startTime + 0.04);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  // Start a repeating heartbeat loop while the question is displayed
  startHeartbeat(intervalMs = 900) {
    this.stopHeartbeat();
    if (this.muted) return;
    this.playHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.playHeartbeat();
    }, intervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  playTone(freq, volume, duration, type = 'sine') {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
}

export const sounds = new SoundManager();
