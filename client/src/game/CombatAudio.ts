export type CombatSound = "swing" | "heavy" | "hit" | "guard" | "counter" | "rage" | "hurt" | "clash";
export type EnemyRoar = "bear" | "crocodile" | "gorilla" | "hippopotamus" | "lion" | "rhinoceros";

export class CombatAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly entryRoarCounts = new Map<EnemyRoar, number>();
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private readonly spatialRoarTraces = new Map<EnemyRoar, { pan: number; reverb: boolean }>();

  unlock() {
    if (typeof window === "undefined") return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
      this.reverb = this.context.createConvolver();
      this.reverb.buffer = this.createReverbImpulse(1.25, 2.4);
      this.reverbGain = this.context.createGain();
      this.reverbGain.gain.value = 0.22;
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.master);
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(kind: CombatSound, intensity = 1) {
    this.unlock();
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const amount = Math.max(0.35, Math.min(1.5, intensity));
    const presets: Record<CombatSound, { start: number; end: number; duration: number; type: OscillatorType; gain: number }> = {
      swing: { start: 180, end: 72, duration: 0.12, type: "sawtooth", gain: 0.18 },
      heavy: { start: 110, end: 42, duration: 0.22, type: "sawtooth", gain: 0.3 },
      hit: { start: 155, end: 48, duration: 0.16, type: "square", gain: 0.28 },
      guard: { start: 420, end: 130, duration: 0.2, type: "triangle", gain: 0.26 },
      counter: { start: 560, end: 72, duration: 0.34, type: "sawtooth", gain: 0.34 },
      rage: { start: 72, end: 24, duration: 0.85, type: "sawtooth", gain: 0.42 },
      hurt: { start: 100, end: 36, duration: 0.18, type: "square", gain: 0.22 },
      clash: { start: 680, end: 92, duration: 0.28, type: "triangle", gain: 0.4 },
    };
    const preset = presets[kind];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.start * amount, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(18, preset.end * amount), now + preset.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(preset.gain * amount, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.02);

    if (kind === "hit" || kind === "counter" || kind === "rage" || kind === "clash") {
      const noise = this.context.createBufferSource();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.12, this.context.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < channel.length; index += 1) channel[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / channel.length, 2);
      noise.buffer = buffer;
      const noiseGain = this.context.createGain();
      noiseGain.gain.setValueAtTime(0.14 * amount, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      noise.connect(noiseGain);
      noiseGain.connect(this.master);
      noise.start(now);
    }
  }

  playEnemyEntry(variant: EnemyRoar, intensity = 1, pan = 0) {
    this.entryRoarCounts.set(variant, (this.entryRoarCounts.get(variant) ?? 0) + 1);
    this.unlock();
    this.spatialRoarTraces.set(variant, { pan: Math.max(-1, Math.min(1, pan)), reverb: Boolean(this.reverb) });
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const amount = Math.max(0.35, Math.min(1.35, intensity));
    const presets: Record<EnemyRoar, { start: number; end: number; duration: number; type: OscillatorType; gain: number; noise: number }> = {
      bear: { start: 92, end: 28, duration: 0.72, type: "sawtooth", gain: 0.46, noise: 0.2 },
      crocodile: { start: 64, end: 20, duration: 0.54, type: "square", gain: 0.32, noise: 0.28 },
      gorilla: { start: 118, end: 36, duration: 0.48, type: "sawtooth", gain: 0.4, noise: 0.18 },
      hippopotamus: { start: 58, end: 18, duration: 0.86, type: "triangle", gain: 0.5, noise: 0.16 },
      lion: { start: 174, end: 52, duration: 0.64, type: "sawtooth", gain: 0.36, noise: 0.12 },
      rhinoceros: { start: 78, end: 24, duration: 0.42, type: "square", gain: 0.44, noise: 0.24 },
    };
    const preset = presets[variant];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.start * amount, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(16, preset.end * amount), now + preset.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(preset.gain * amount, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    oscillator.connect(panner);
    panner.connect(gain);
    gain.connect(this.master);
    if (this.reverb) gain.connect(this.reverb);
    oscillator.start(now);
    oscillator.stop(now + preset.duration + 0.03);

    const noise = this.context.createBufferSource();
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * preset.duration), this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const fade = Math.pow(1 - index / channel.length, 1.35);
      channel[index] = (Math.random() * 2 - 1) * fade;
    }
    noise.buffer = buffer;
    const noisePanner = this.context.createStereoPanner();
    noisePanner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan * 0.92)), now);
    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(preset.noise * amount, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    noise.connect(noisePanner);
    noisePanner.connect(noiseGain);
    noiseGain.connect(this.master);
    if (this.reverb) noiseGain.connect(this.reverb);
    noise.start(now);
  }

  private createReverbImpulse(duration: number, decay: number) {
    if (!this.context) throw new Error("Audio context is not ready");
    const length = Math.floor(this.context.sampleRate * duration);
    const impulse = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);
      for (let index = 0; index < length; index += 1) {
        channel[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
      }
    }
    return impulse;
  }

  entryRoarCount(variant: EnemyRoar) {
    return this.entryRoarCounts.get(variant) ?? 0;
  }

  spatialRoarTrace(variant: EnemyRoar) {
    return this.spatialRoarTraces.get(variant) ?? { pan: 0, reverb: false };
  }

  reverbEnabled() {
    return Boolean(this.reverb);
  }
}
