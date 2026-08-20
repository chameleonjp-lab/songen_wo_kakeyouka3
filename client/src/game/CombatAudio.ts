/**
 * Small, procedural combat sound renderer.
 *
 * The game intentionally has no external music or sound-file dependency. All
 * combat cues are short oscillator/noise voices routed through a small set of
 * buses. Keeping the graph here (instead of creating an AudioContext per cue)
 * makes audio safe to call from the game loop and keeps mobile memory use low.
 */

export type HitSoundLocation = "body" | "torso" | "head" | "heart";

/** Existing names are kept at the start of this union for call-site compatibility. */
export type CombatSound =
  | "swing"
  | "heavy"
  | "hit"
  | "guard"
  | "counter"
  | "rage"
  | "hurt"
  | "clash"
  | "whiff"
  | "miss"
  | "bodyHit"
  | "headHit"
  | "heartHit"
  | "defense"
  | "justGuard"
  | "dignityLoss"
  | "entry"
  | "victory"
  | "defeat"
  // Semantic aliases make the event boundary convenient for small callers.
  | "empty"
  | "body"
  | "torso"
  | "head"
  | "heart"
  | "blocked"
  | "just-guard"
  | "strong"
  | "strongHit"
  | "damage"
  | "takeDamage"
  | "dignity"
  | "dignity-loss"
  | "enemy-entry"
  | "win"
  | "lose";

type CanonicalCombatSound =
  | "swing"
  | "heavy"
  | "hit"
  | "guard"
  | "counter"
  | "rage"
  | "hurt"
  | "clash"
  | "whiff"
  | "miss"
  | "bodyHit"
  | "headHit"
  | "heartHit"
  | "defense"
  | "justGuard"
  | "dignityLoss"
  | "victory"
  | "defeat";

export type AudioBus = "master" | "music" | "sfx" | "ambient";

export type CombatAudioSettings = {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  muted: boolean;
};

export type CombatAudioOptions = {
  /** Optional storage override, useful for an embedded game or tests. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  storageKey?: string;
  /** Supplying a factory makes the renderer straightforward to test. */
  contextFactory?: () => AudioContext;
  /** Disable gesture listener installation for non-browser hosts. */
  listenForGestures?: boolean;
  settings?: Partial<CombatAudioSettings>;
};

export type EnemyRoar = "bear" | "crocodile" | "gorilla" | "hippopotamus" | "lion" | "rhinoceros";

const AUDIO_SETTINGS_KEY = "barbarian-arena.audio-settings.v1";
const DEFAULT_AUDIO_SETTINGS: CombatAudioSettings = {
  // Keep the level used by the original prototype. Individual event gains are
  // deliberately conservative so several voices can overlap safely.
  master: 0.18,
  music: 0.7,
  sfx: 1,
  ambient: 0.72,
  muted: false,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finiteOr = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

export function loadCombatAudioSettings(
  storage?: Pick<Storage, "getItem"> | null,
  storageKey = AUDIO_SETTINGS_KEY,
  overrides: Partial<CombatAudioSettings> = {},
): CombatAudioSettings {
  let source = storage;
  if (source === undefined) {
    try {
      source = typeof window === "undefined" ? null : window.localStorage;
    } catch {
      source = null;
    }
  }
  let persisted: Partial<CombatAudioSettings> = {};
  try {
    const raw = source?.getItem(storageKey);
    if (raw) persisted = JSON.parse(raw) as Partial<CombatAudioSettings>;
  } catch {
    persisted = {};
  }
  return {
    master: clamp(finiteOr(overrides.master ?? persisted.master, DEFAULT_AUDIO_SETTINGS.master), 0, 1),
    music: clamp(finiteOr(overrides.music ?? persisted.music, DEFAULT_AUDIO_SETTINGS.music), 0, 1),
    sfx: clamp(finiteOr(overrides.sfx ?? persisted.sfx, DEFAULT_AUDIO_SETTINGS.sfx), 0, 1),
    ambient: clamp(finiteOr(overrides.ambient ?? persisted.ambient, DEFAULT_AUDIO_SETTINGS.ambient), 0, 1),
    muted: typeof (overrides.muted ?? persisted.muted) === "boolean" ? Boolean(overrides.muted ?? persisted.muted) : DEFAULT_AUDIO_SETTINGS.muted,
  };
}

type ToneSpec = {
  start: number;
  end: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  attack?: number;
  release?: number;
  detune?: number;
  /** A second tone makes guard, heart and result cues easier to tell apart. */
  harmonic?: { ratio: number; gain: number; type?: OscillatorType; offset?: number };
  noise?: { gain: number; duration?: number; highpass?: number; lowpass?: number; offset?: number };
};

type RoarSpec = ToneSpec & { noise: { gain: number; duration?: number; highpass?: number; lowpass?: number; offset?: number } };

const SOUND_PRESETS: Record<CanonicalCombatSound, ToneSpec> = {
  // A high, quick sweep and a little high-passed air read as an empty swing.
  swing: { start: 180, end: 72, duration: 0.12, type: "sawtooth", gain: 0.18, noise: { gain: 0.1, duration: 0.1, highpass: 850 } },
  whiff: { start: 310, end: 760, duration: 0.115, type: "sine", gain: 0.12, noise: { gain: 0.13, duration: 0.105, highpass: 1100 } },
  miss: { start: 310, end: 760, duration: 0.115, type: "sine", gain: 0.12, noise: { gain: 0.13, duration: 0.105, highpass: 1100 } },
  heavy: { start: 110, end: 42, duration: 0.22, type: "sawtooth", gain: 0.3, noise: { gain: 0.2, duration: 0.16, lowpass: 520 } },

  // Body impact: short low thump with a soft broadband transient.
  hit: { start: 155, end: 48, duration: 0.16, type: "square", gain: 0.28, noise: { gain: 0.2, duration: 0.12, lowpass: 1000 } },
  bodyHit: { start: 155, end: 48, duration: 0.16, type: "square", gain: 0.28, noise: { gain: 0.2, duration: 0.12, lowpass: 1000 } },
  // Head: bright, metallic transient.
  headHit: {
    start: 620,
    end: 190,
    duration: 0.2,
    type: "triangle",
    gain: 0.27,
    harmonic: { ratio: 1.62, gain: 0.22, type: "sine", offset: 0.004 },
    noise: { gain: 0.25, duration: 0.1, highpass: 1700 },
  },
  // Heart: a low resonant thump followed by a chest-like second harmonic.
  heartHit: {
    start: 94,
    end: 38,
    duration: 0.32,
    type: "sine",
    gain: 0.37,
    harmonic: { ratio: 2, gain: 0.18, type: "triangle", offset: 0.03 },
    noise: { gain: 0.28, duration: 0.18, lowpass: 260 },
  },

  guard: { start: 420, end: 130, duration: 0.2, type: "triangle", gain: 0.26, noise: { gain: 0.16, duration: 0.14, highpass: 1500 } },
  defense: { start: 420, end: 130, duration: 0.2, type: "triangle", gain: 0.26, noise: { gain: 0.16, duration: 0.14, highpass: 1500 } },
  justGuard: {
    start: 960,
    end: 260,
    duration: 0.31,
    type: "sine",
    gain: 0.34,
    harmonic: { ratio: 1.5, gain: 0.24, type: "triangle", offset: 0.012 },
    noise: { gain: 0.25, duration: 0.15, highpass: 2200 },
  },
  counter: {
    start: 560,
    end: 72,
    duration: 0.34,
    type: "sawtooth",
    gain: 0.34,
    harmonic: { ratio: 0.5, gain: 0.19, type: "triangle", offset: 0.02 },
    noise: { gain: 0.22, duration: 0.16, highpass: 850 },
  },
  clash: {
    start: 680,
    end: 92,
    duration: 0.28,
    type: "triangle",
    gain: 0.4,
    harmonic: { ratio: 1.42, gain: 0.28, type: "square", offset: 0.006 },
    noise: { gain: 0.3, duration: 0.16, highpass: 1200 },
  },
  rage: {
    start: 72,
    end: 24,
    duration: 0.85,
    type: "sawtooth",
    gain: 0.42,
    harmonic: { ratio: 2, gain: 0.23, type: "square", offset: 0.04 },
    noise: { gain: 0.28, duration: 0.48, lowpass: 480 },
  },
  hurt: { start: 100, end: 36, duration: 0.18, type: "square", gain: 0.22, noise: { gain: 0.16, duration: 0.13, lowpass: 750 } },
  dignityLoss: {
    start: 260,
    end: 34,
    duration: 0.68,
    type: "sawtooth",
    gain: 0.34,
    harmonic: { ratio: 0.5, gain: 0.24, type: "triangle", offset: 0.07 },
    noise: { gain: 0.22, duration: 0.36, lowpass: 550 },
  },
  victory: {
    start: 392,
    end: 784,
    duration: 0.38,
    type: "triangle",
    gain: 0.27,
    harmonic: { ratio: 1.25, gain: 0.2, type: "sine", offset: 0.07 },
    noise: { gain: 0.06, duration: 0.2, highpass: 1800 },
  },
  defeat: {
    start: 196,
    end: 42,
    duration: 0.72,
    type: "triangle",
    gain: 0.31,
    harmonic: { ratio: 0.75, gain: 0.2, type: "sine", offset: 0.04 },
    noise: { gain: 0.13, duration: 0.32, lowpass: 380 },
  },
};

const ROAR_PRESETS: Record<EnemyRoar, RoarSpec> = {
  bear: { start: 92, end: 28, duration: 0.72, type: "sawtooth", gain: 0.46, noise: { gain: 0.2, lowpass: 560 } },
  crocodile: { start: 64, end: 20, duration: 0.54, type: "square", gain: 0.32, noise: { gain: 0.28, lowpass: 800 } },
  gorilla: { start: 118, end: 36, duration: 0.48, type: "sawtooth", gain: 0.4, noise: { gain: 0.18, lowpass: 720 } },
  hippopotamus: { start: 58, end: 18, duration: 0.86, type: "triangle", gain: 0.5, noise: { gain: 0.16, lowpass: 450 } },
  lion: { start: 174, end: 52, duration: 0.64, type: "sawtooth", gain: 0.36, noise: { gain: 0.12, highpass: 580 } },
  rhinoceros: { start: 78, end: 24, duration: 0.42, type: "square", gain: 0.44, noise: { gain: 0.24, lowpass: 680 } },
};

type AudioVoice = {
  source: AudioScheduledSourceNode;
  nodes: AudioNode[];
  timer: ReturnType<typeof setTimeout> | null;
  cleaned: boolean;
};

type TraceEvent = {
  kind: CombatSound;
  intensity: number;
  pan: number;
};

type AudioContextFactory = () => AudioContext;

export class CombatAudio {
  private context: AudioContext | null = null;
  /** Kept as `master` for compatibility with the original implementation. */
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambient: GainNode | null = null;
  private readonly entryRoarCounts = new Map<EnemyRoar, number>();
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private readonly spatialRoarTraces = new Map<EnemyRoar, { pan: number; reverb: boolean }>();
  private readonly activeVoices = new Set<AudioVoice>();
  private readonly noiseBuffers = new Map<number, AudioBuffer>();
  private readonly contextFactory?: AudioContextFactory;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  private readonly storageKey: string;
  private readonly listenForGestures: boolean;
  private settingsState: CombatAudioSettings;
  private gestureWindow: Window | null = null;
  private _lastEvent: TraceEvent | null = null;

  private readonly onUserGesture = () => {
    this.resume();
    if (this.context?.state !== "suspended") this.removeGestureListeners();
  };

  constructor(options: CombatAudioOptions = {}) {
    this.contextFactory = options.contextFactory;
    this.storageKey = options.storageKey ?? AUDIO_SETTINGS_KEY;
    this.storage = options.storage !== undefined ? options.storage : this.browserStorage();
    this.listenForGestures = options.listenForGestures ?? true;
    this.settingsState = this.readSettings(options.settings);
  }

  /**
   * Creates the one shared context and resumes it when possible. Browsers may
   * keep a newly created context suspended until a pointer/key gesture; the
   * small listener below retries resume at that first gesture.
   */
  unlock() {
    if (!this.context) {
      const factory = this.contextFactory ?? this.browserContextFactory();
      if (!factory) return;
      try {
        this.context = factory();
        this.createGraph();
      } catch {
        this.context = null;
        this.clearGraphReferences();
        return;
      }
    }
    this.resume();
    if (this.context?.state === "suspended") this.installGestureListeners();
  }

  /** Re-attempts resume; safe to call from a user input handler. */
  resume() {
    const context = this.context;
    if (!context || context.state !== "suspended" || typeof context.resume !== "function") return;
    try {
      const pending = context.resume();
      if (pending && typeof pending.then === "function") {
        void pending.then(
          () => {
            if (this.context?.state !== "suspended") this.removeGestureListeners();
          },
          () => undefined,
        );
      }
    } catch {
      // Some embedded webviews throw instead of returning a rejected promise.
    }
  }

  isUnlocked() {
    return Boolean(this.context && this.context.state !== "closed");
  }

  contextState() {
    return this.context?.state ?? "unavailable";
  }

  /**
   * Plays an existing or extended combat cue. The third argument is optional
   * stereo pan and does not alter the original two-argument API.
   */
  play(kind: CombatSound, intensity = 1, pan = 0) {
    const canonical = this.normalizeSound(kind);
    const amount = clamp(finiteOr(intensity, 1), 0.35, 1.5);
    const safePan = clamp(finiteOr(pan, 0), -1, 1);
    this._lastEvent = { kind: canonical, intensity: amount, pan: safePan };
    this.unlock();
    if (!this.context || !this.sfx || !this.isAudible("sfx")) return;
    const preset = SOUND_PRESETS[canonical];
    if (!preset) return;
    this.scheduleTone(preset, amount, safePan, this.sfx);
    if (preset.harmonic) {
      const harmonic = preset.harmonic;
      this.scheduleTone(
        {
          start: preset.start * harmonic.ratio,
          end: preset.end * harmonic.ratio,
          duration: preset.duration * 0.94,
          type: harmonic.type ?? "sine",
          gain: harmonic.gain,
          attack: preset.attack,
          release: preset.release,
        },
        amount,
        safePan,
        this.sfx,
        harmonic.offset ?? 0,
      );
    }
    if (preset.noise) this.scheduleNoise(preset.noise, amount, safePan, this.sfx);
  }

  /** Explicit semantic helpers make it possible to add location-aware cues without changing GameWorld. */
  playWhiff(intensity = 1, pan = 0) {
    this.play("whiff", intensity, pan);
  }

  playHit(location: HitSoundLocation = "body", intensity = 1, pan = 0) {
    const kind: CombatSound = location === "head" ? "headHit" : location === "heart" ? "heartHit" : "bodyHit";
    this.play(kind, intensity, pan);
  }

  playBodyHit(intensity = 1, pan = 0) {
    this.play("bodyHit", intensity, pan);
  }

  playHeadHit(intensity = 1, pan = 0) {
    this.play("headHit", intensity, pan);
  }

  playHeartHit(intensity = 1, pan = 0) {
    this.play("heartHit", intensity, pan);
  }

  playDamage(intensity = 1, pan = 0) {
    this.play("takeDamage", intensity, pan);
  }

  playDefense(intensity = 1, pan = 0) {
    this.play("defense", intensity, pan);
  }

  playJustGuard(intensity = 1, pan = 0) {
    this.play("justGuard", intensity, pan);
  }

  playClash(intensity = 1, pan = 0) {
    this.play("clash", intensity, pan);
  }

  playRage(intensity = 1, pan = 0) {
    this.play("rage", intensity, pan);
  }

  playDignityLoss(intensity = 1, pan = 0) {
    this.play("dignityLoss", intensity, pan);
  }

  playVictory(intensity = 1) {
    this.play("victory", intensity);
  }

  playDefeat(intensity = 1) {
    this.play("defeat", intensity);
  }

  /** Result cue alias useful for callers that already have a run-result union. */
  playResult(result: "victory" | "defeat" | "retired", intensity = 1) {
    this.play(result === "victory" ? "victory" : "defeat", intensity);
  }

  /**
   * There is deliberately no generated music track. Keeping this boundary
   * lets a future track use the same music bus without mixing it into SFX.
   */
  playMusic(_track?: string) {
    return false;
  }

  stopMusic() {
    // No music source is allocated by the procedural renderer.
  }

  playEnemyEntry(variant: EnemyRoar, intensity = 1, pan = 0) {
    this.entryRoarCounts.set(variant, (this.entryRoarCounts.get(variant) ?? 0) + 1);
    const safePan = clamp(finiteOr(pan, 0), -1, 1);
    this.unlock();
    this.spatialRoarTraces.set(variant, { pan: safePan, reverb: Boolean(this.reverb) });
    this._lastEvent = { kind: "entry", intensity: clamp(finiteOr(intensity, 1), 0.35, 1.35), pan: safePan };
    if (!this.context || !this.ambient || !this.isAudible("ambient")) return;
    const preset = ROAR_PRESETS[variant];
    if (!preset) return;
    const amount = clamp(finiteOr(intensity, 1), 0.35, 1.35);
    this.scheduleTone(preset, amount, safePan, this.ambient, 0, true);
    this.scheduleNoise(preset.noise, amount, safePan * 0.92, this.ambient, true);
  }

  private normalizeSound(kind: CombatSound): CanonicalCombatSound {
    switch (kind) {
      case "miss":
      case "empty":
        return "whiff";
      case "body":
      case "torso":
      case "bodyHit":
        return "bodyHit";
      case "head":
        return "headHit";
      case "heart":
        return "heartHit";
      case "blocked":
      case "defense":
        return "defense";
      case "just-guard":
        return "justGuard";
      case "strong":
      case "strongHit":
        return "heavy";
      case "damage":
      case "takeDamage":
        return "hurt";
      case "dignity":
      case "dignity-loss":
        return "dignityLoss";
      case "entry":
      case "enemy-entry":
        return "clash";
      case "win":
        return "victory";
      case "lose":
        return "defeat";
      default:
        return kind as CanonicalCombatSound;
    }
  }

  private scheduleTone(spec: ToneSpec, amount: number, pan: number, bus: GainNode, offset = 0, sendReverb = false) {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime + Math.max(0, offset);
    const duration = Math.max(0.035, spec.duration);
    let oscillator: OscillatorNode;
    let gain: GainNode;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
    } catch {
      return;
    }
    const nodes: AudioNode[] = [oscillator, gain];
    const panner = this.createPanner(pan);
    if (panner) nodes.push(panner);

    oscillator.type = spec.type;
    this.setParam(oscillator.frequency, Math.max(18, spec.start * amount), now);
    this.rampParam(oscillator.frequency, Math.max(18, spec.end * amount), now + duration, true);
    if (typeof spec.detune === "number") this.setParam(oscillator.detune, spec.detune, now);

    const attack = clamp(spec.attack ?? 0.009, 0.002, duration * 0.45);
    const release = clamp(spec.release ?? Math.min(0.08, duration * 0.4), 0.01, duration * 0.7);
    this.setParam(gain.gain, 0.0001, now);
    this.rampParam(gain.gain, Math.max(0.0001, spec.gain * amount), now + attack, false);
    this.rampParam(gain.gain, 0.0001, now + duration, false);

    try {
      oscillator.connect(gain);
      let output: AudioNode = gain;
      if (panner) {
        output.connect(panner);
        output = panner;
      }
      output.connect(bus);
      if (sendReverb && this.reverb) output.connect(this.reverb);
      oscillator.start(now);
      oscillator.stop(now + duration + release);
      this.trackVoice(oscillator, nodes, duration + release + Math.max(0, offset));
    } catch {
      this.disconnectNodes(nodes);
    }
  }

  private scheduleNoise(
    spec: NonNullable<ToneSpec["noise"]>,
    amount: number,
    pan: number,
    bus: GainNode,
    sendReverb = false,
  ) {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime + Math.max(0, spec.offset ?? 0);
    const duration = Math.max(0.025, spec.duration ?? 0.12);
    let source: AudioBufferSourceNode;
    let gain: GainNode;
    try {
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = this.getNoiseBuffer(duration);
    } catch {
      return;
    }
    const nodes: AudioNode[] = [source, gain];
    const panner = this.createPanner(pan);
    if (panner) nodes.push(panner);
    const filter = this.createFilter(spec.highpass ? "highpass" : spec.lowpass ? "lowpass" : undefined, spec.highpass ?? spec.lowpass ?? 0);
    if (filter) nodes.push(filter);
    this.setParam(gain.gain, Math.max(0.0001, spec.gain * amount), now);
    this.rampParam(gain.gain, 0.0001, now + duration, false);
    try {
      source.connect(gain);
      let output: AudioNode = gain;
      if (filter) {
        gain.connect(filter);
        output = filter;
      }
      if (panner) {
        output.connect(panner);
        output = panner;
      }
      output.connect(bus);
      if (sendReverb && this.reverb) output.connect(this.reverb);
      source.start(now);
      source.stop(now + duration + 0.015);
      this.trackVoice(source, nodes, duration + 0.03 + Math.max(0, spec.offset ?? 0));
    } catch {
      this.disconnectNodes(nodes);
    }
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[], lifetime: number) {
    const voice: AudioVoice = { source, nodes, timer: null, cleaned: false };
    const cleanup = () => {
      if (voice.cleaned) return;
      voice.cleaned = true;
      if (voice.timer !== null) clearTimeout(voice.timer);
      this.activeVoices.delete(voice);
      this.disconnectNodes(nodes);
    };
    try {
      source.onended = cleanup;
    } catch {
      // A very small test double may not expose onended; the timer still cleans it up.
    }
    voice.timer = setTimeout(cleanup, Math.max(60, Math.ceil(lifetime * 1000) + 80));
    const maybeUnref = voice.timer as unknown as { unref?: () => void };
    maybeUnref.unref?.();
    this.activeVoices.add(voice);
  }

  private createGraph() {
    const context = this.context;
    if (!context) return;
    try {
      this.master = context.createGain();
      this.music = context.createGain();
      this.sfx = context.createGain();
      this.ambient = context.createGain();
      this.setParam(this.master.gain, this.settingsState.muted ? 0 : this.settingsState.master, context.currentTime);
      this.setParam(this.music.gain, this.settingsState.music, context.currentTime);
      this.setParam(this.sfx.gain, this.settingsState.sfx, context.currentTime);
      this.setParam(this.ambient.gain, this.settingsState.ambient, context.currentTime);
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.ambient.connect(this.master);
      this.master.connect(context.destination);
      try {
        this.reverb = context.createConvolver();
        this.reverb.buffer = this.createReverbImpulse(1.25, 2.4);
        this.reverbGain = context.createGain();
        this.setParam(this.reverbGain.gain, 0.22, context.currentTime);
        this.reverb.connect(this.reverbGain);
        this.reverbGain.connect(this.ambient);
      } catch {
        this.reverb = null;
        this.reverbGain = null;
      }
    } catch {
      this.clearGraphReferences();
    }
  }

  private createPanner(pan: number): StereoPannerNode | null {
    const context = this.context;
    if (!context || typeof context.createStereoPanner !== "function") return null;
    try {
      const panner = context.createStereoPanner();
      this.setParam(panner.pan, clamp(pan, -1, 1), context.currentTime);
      return panner;
    } catch {
      return null;
    }
  }

  private createFilter(type: BiquadFilterType | undefined, frequency: number) {
    const context = this.context;
    if (!context || !type || typeof context.createBiquadFilter !== "function" || frequency <= 0) return null;
    try {
      const filter = context.createBiquadFilter();
      filter.type = type;
      this.setParam(filter.frequency, clamp(frequency, 40, (context.sampleRate || 44100) * 0.45), context.currentTime);
      filter.Q.value = 0.7;
      return filter;
    } catch {
      return null;
    }
  }

  private getNoiseBuffer(duration: number) {
    const context = this.context;
    if (!context) throw new Error("Audio context is not ready");
    const key = Math.ceil(duration * 100) / 100;
    const cached = this.noiseBuffers.get(key);
    if (cached) return cached;
    const sampleRate = Math.max(8000, context.sampleRate || 44100);
    const length = Math.max(1, Math.floor(sampleRate * key));
    const buffer = context.createBuffer(1, length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const fade = Math.pow(1 - index / channel.length, 1.45);
      channel[index] = (Math.random() * 2 - 1) * fade;
    }
    this.noiseBuffers.set(key, buffer);
    return buffer;
  }

  private createReverbImpulse(duration: number, decay: number) {
    if (!this.context) throw new Error("Audio context is not ready");
    const sampleRate = Math.max(8000, this.context.sampleRate || 44100);
    const length = Math.floor(sampleRate * duration);
    const impulse = this.context.createBuffer(2, length, sampleRate);
    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);
      for (let index = 0; index < length; index += 1) {
        channel[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
      }
    }
    return impulse;
  }

  private setParam(param: AudioParam, value: number, at: number) {
    try {
      param.setValueAtTime(value, at);
    } catch {
      try {
        param.value = value;
      } catch {
        // Ignore incomplete WebAudio implementations in embedded browsers.
      }
    }
  }

  private rampParam(param: AudioParam, value: number, at: number, _exponential: boolean) {
    try {
      // Exponential ramps keep the small attack/release envelope from clicking.
      param.exponentialRampToValueAtTime(Math.max(0.0001, value), at);
    } catch {
      try {
        param.linearRampToValueAtTime(value, at);
      } catch {
        try {
          param.value = value;
        } catch {
          // Ignore incomplete WebAudio implementations in embedded browsers.
        }
      }
    }
  }

  private disconnectNodes(nodes: AudioNode[]) {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Nodes may already be disconnected by an onended callback.
      }
    }
  }

  private isAudible(bus: Exclude<AudioBus, "master" | "music">) {
    return !this.settingsState.muted && this.settingsState.master > 0 && this.settingsState[bus] > 0;
  }

  private browserContextFactory(): AudioContextFactory | undefined {
    if (typeof window === "undefined") return undefined;
    const candidate = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const Context = (candidate.AudioContext ?? candidate.webkitAudioContext) as typeof AudioContext | undefined;
    return typeof Context === "function" ? () => new Context() : undefined;
  }

  private browserStorage() {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private readSettings(overrides?: Partial<CombatAudioSettings>) {
    return loadCombatAudioSettings(this.storage, this.storageKey, overrides);
  }

  private persistSettings() {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.settingsState));
    } catch {
      // Private browsing and storage quotas should never break combat.
    }
  }

  getSettings(): CombatAudioSettings {
    return { ...this.settingsState };
  }

  settings(): CombatAudioSettings {
    return this.getSettings();
  }

  getVolume(bus: AudioBus) {
    return bus === "master" ? this.settingsState.master : bus === "music" ? this.settingsState.music : bus === "sfx" ? this.settingsState.sfx : this.settingsState.ambient;
  }

  getBusVolume(bus: AudioBus) {
    return this.getVolume(bus);
  }

  setVolume(bus: AudioBus, value: number) {
    const next = clamp(finiteOr(value, 0), 0, 1);
    if (bus === "master") this.settingsState.master = next;
    else if (bus === "music") this.settingsState.music = next;
    else if (bus === "sfx") this.settingsState.sfx = next;
    else this.settingsState.ambient = next;
    this.updateBusGains();
    this.persistSettings();
    return next;
  }

  setBusVolume(bus: AudioBus, value: number) {
    return this.setVolume(bus, value);
  }

  setMasterVolume(value: number) {
    return this.setVolume("master", value);
  }

  setMusicVolume(value: number) {
    return this.setVolume("music", value);
  }

  setSfxVolume(value: number) {
    return this.setVolume("sfx", value);
  }

  setAmbientVolume(value: number) {
    return this.setVolume("ambient", value);
  }

  setMuted(muted: boolean) {
    this.settingsState.muted = Boolean(muted);
    this.updateBusGains();
    this.persistSettings();
    return this.settingsState.muted;
  }

  setMute(muted: boolean) {
    return this.setMuted(muted);
  }

  isMuted() {
    return this.settingsState.muted;
  }

  isMute() {
    return this.isMuted();
  }

  toggleMute() {
    return this.setMuted(!this.settingsState.muted);
  }

  updateSettings(settings: Partial<CombatAudioSettings>) {
    if (settings.master !== undefined) this.settingsState.master = clamp(finiteOr(settings.master, this.settingsState.master), 0, 1);
    if (settings.music !== undefined) this.settingsState.music = clamp(finiteOr(settings.music, this.settingsState.music), 0, 1);
    if (settings.sfx !== undefined) this.settingsState.sfx = clamp(finiteOr(settings.sfx, this.settingsState.sfx), 0, 1);
    if (settings.ambient !== undefined) this.settingsState.ambient = clamp(finiteOr(settings.ambient, this.settingsState.ambient), 0, 1);
    if (settings.muted !== undefined) this.settingsState.muted = Boolean(settings.muted);
    this.updateBusGains();
    this.persistSettings();
    return this.getSettings();
  }

  resetSettings() {
    this.settingsState = { ...DEFAULT_AUDIO_SETTINGS };
    this.updateBusGains();
    this.persistSettings();
    return this.getSettings();
  }

  private updateBusGains() {
    const now = this.context?.currentTime ?? 0;
    if (this.master) this.setParam(this.master.gain, this.settingsState.muted ? 0 : this.settingsState.master, now);
    if (this.music) this.setParam(this.music.gain, this.settingsState.music, now);
    if (this.sfx) this.setParam(this.sfx.gain, this.settingsState.sfx, now);
    if (this.ambient) this.setParam(this.ambient.gain, this.settingsState.ambient, now);
  }

  private installGestureListeners() {
    if (!this.listenForGestures || typeof window === "undefined" || this.gestureWindow) return;
    const target = window;
    if (typeof target.addEventListener !== "function") return;
    this.gestureWindow = target;
    for (const event of ["pointerdown", "touchstart", "keydown", "mousedown"] as const) target.addEventListener(event, this.onUserGesture, { passive: true });
  }

  private removeGestureListeners() {
    const target = this.gestureWindow;
    if (!target) return;
    for (const event of ["pointerdown", "touchstart", "keydown", "mousedown"] as const) target.removeEventListener(event, this.onUserGesture);
    this.gestureWindow = null;
  }

  /** Stops scheduled voices and closes the shared context. */
  dispose() {
    this.removeGestureListeners();
    for (const voice of [...this.activeVoices]) {
      try {
        voice.source.stop();
      } catch {
        // Already stopped voices are still disconnected below.
      }
      if (voice.timer !== null) clearTimeout(voice.timer);
      this.disconnectNodes(voice.nodes);
      voice.cleaned = true;
    }
    this.activeVoices.clear();
    for (const node of [this.reverbGain, this.reverb, this.ambient, this.sfx, this.music, this.master]) {
      if (node) {
        try {
          node.disconnect();
        } catch {
          // Ignore nodes that are already detached.
        }
      }
    }
    const context = this.context;
    this.clearGraphReferences();
    this.noiseBuffers.clear();
    if (context && typeof context.close === "function") {
      try {
        const pending = context.close();
        if (pending && typeof pending.catch === "function") void pending.catch(() => undefined);
      } catch {
        // Closing is best-effort in older WebViews.
      }
    }
  }

  private clearGraphReferences() {
    this.context = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.ambient = null;
    this.reverb = null;
    this.reverbGain = null;
  }

  lastEvent() {
    return this._lastEvent ? { ...this._lastEvent } : null;
  }

  activeVoiceCount() {
    return this.activeVoices.size;
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

export { DEFAULT_AUDIO_SETTINGS, SOUND_PRESETS, ROAR_PRESETS };
