// Audio starts only after a real pointer/key gesture. All cues are optional.
export class Sound {
  constructor() { this.ctx = null; }
  unlock() {
    try { this.ctx ??= new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume().catch(() => {}); } catch {}
  }
  catch() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(50, now + .09);
    gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + .12);
    oscillator.connect(gain); gain.connect(this.ctx.destination);
    oscillator.start(); oscillator.stop(now + .13);
  }
  condition(type) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, now = ctx.currentTime;
    const duration = type === 'WIND' ? 1.6 : type === 'ROCKFALL' ? 1.1 : .42;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = type === 'ICE' ? 'bandpass' : 'lowpass';
    filter.frequency.value = type === 'ICE' ? 2600 : type === 'WIND' ? 650 : 240;
    gain.gain.setValueAtTime(.001, now);
    gain.gain.linearRampToValueAtTime(type === 'ICE' ? .025 : .055, now + .06);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.start(); source.stop(now + duration);
  }
}
