/**
 * audio.js - Web Audio API procedural sound system
 * All sounds are synthesized — no audio files needed
 */
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this._init();
  }

  _init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API not available:', e);
      this.enabled = false;
    }
  }

  /** Resume context on first user interaction (browser policy) */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _createOscillator(type, freq, startTime, duration, gainVal = 0.3) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(gainVal, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration);
    return { osc, gain };
  }

  /** Ascending beep — successful transaction */
  playTransactionSuccess() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    const freqs = [440, 554, 659, 880];
    freqs.forEach((f, i) => this._createOscillator('square', f, t + i * 0.07, 0.12, 0.25));
  }

  /** Descending buzz — failed transaction */
  playTransactionFail() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    const freqs = [330, 247, 196, 147];
    freqs.forEach((f, i) => this._createOscillator('sawtooth', f, t + i * 0.08, 0.15, 0.2));
  }

  /** Low thud — being attacked */
  playAttack() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
    // Low tone
    this._createOscillator('sine', 60, t, 0.15, 0.35);
  }

  /** Coin jingle — money received */
  playMoney() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    this._createOscillator('triangle', 1047, t, 0.08, 0.3);
    this._createOscillator('triangle', 1319, t + 0.05, 0.08, 0.3);
    this._createOscillator('triangle', 1568, t + 0.1, 0.1, 0.3);
  }

  /** Fanfare — level up */
  playLevelUp() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    const melody = [523, 659, 784, 1047];
    melody.forEach((f, i) => {
      this._createOscillator('square', f, t + i * 0.1, 0.15, 0.3);
      this._createOscillator('triangle', f * 1.5, t + i * 0.1, 0.15, 0.15);
    });
  }

  /** Police siren blip — busted */
  playBusted() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const f = i % 2 === 0 ? 880 : 660;
      this._createOscillator('sawtooth', f, t + i * 0.12, 0.1, 0.4);
    }
  }

  /** Short click — UI button */
  playClick() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    this._createOscillator('square', 440, t, 0.04, 0.15);
  }

  /** Footstep — subtle tick */
  playStep() {
    if (!this.enabled || !this.ctx) return;
    this.resume();
    const t = this.ctx.currentTime;
    this._createOscillator('sine', 120, t, 0.03, 0.08);
  }

  setVolume(v) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.masterGain) this.masterGain.gain.value = this.enabled ? 0.4 : 0;
    return this.enabled;
  }
}
