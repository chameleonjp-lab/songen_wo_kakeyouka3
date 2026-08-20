/**
 * Small, optional vibration layer for touch devices.
 *
 * The browser API is intentionally treated as a best-effort enhancement:
 * unsupported devices, permission failures and reduced-motion preferences all
 * result in a quiet no-op rather than a gameplay error.
 */

export type HapticEvent =
  | "hit"
  | "bodyHit"
  | "headHit"
  | "heartHit"
  | "body"
  | "torso"
  | "head"
  | "heart"
  | "heavy"
  | "strong"
  | "guard"
  | "justGuard"
  | "just-guard"
  | "clash"
  | "rage"
  | "hurt"
  | "damage"
  | "dignityLoss"
  | "dignity-loss"
  | "dignity"
  | "defeat"
  | "victory"
  | "win";

type VibrateNavigator = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

export type HapticsOptions = {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  storageKey?: string;
  /** Override media-query detection for an embedded host or a deterministic test. */
  reducedMotion?: boolean;
  coarsePointer?: boolean;
  /** A persisted `false` still wins over this default. */
  enabled?: boolean;
  throttleMs?: number;
};

const HAPTICS_SETTINGS_KEY = "barbarian-arena.haptics-enabled.v1";

export function loadHapticsPreference(
  storage?: Pick<Storage, "getItem"> | null,
  storageKey = HAPTICS_SETTINGS_KEY,
) {
  let source = storage;
  if (source === undefined) {
    try {
      source = typeof window === "undefined" ? null : window.localStorage;
    } catch {
      source = null;
    }
  }
  try {
    const value = source?.getItem(storageKey);
    if (value === "true") return true;
    if (value === "false") return false;
  } catch {
    // Storage access is optional.
  }
  return null;
}

// Existing values are preserved for regression compatibility. New events use
// clearly different rhythms so body/head/heart and result feedback can be told
// apart without looking at the HUD.
const PATTERNS: Record<HapticEvent, number | number[]> = {
  hit: 16,
  bodyHit: 16,
  headHit: [14, 10, 28],
  heartHit: [24, 12, 54],
  body: 16,
  torso: 16,
  head: [14, 10, 28],
  heart: [24, 12, 54],
  heavy: [22, 18, 30],
  strong: [30, 14, 44],
  guard: 12,
  justGuard: [18, 24, 42],
  "just-guard": [18, 24, 42],
  clash: [30, 18, 30],
  rage: [35, 24, 55, 24, 85],
  hurt: [28, 18, 38],
  damage: [28, 18, 38],
  dignityLoss: [55, 24, 100, 34, 145],
  "dignity-loss": [55, 24, 100, 34, 145],
  dignity: [55, 24, 100, 34, 145],
  defeat: [20, 30, 50],
  victory: [16, 24, 20, 24, 48],
  win: [16, 24, 20, 24, 48],
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class Haptics {
  private enabled: boolean;
  private readonly supported: boolean;
  private readonly reducedMotion: boolean;
  private readonly coarsePointer: boolean;
  private readonly navigatorRef: VibrateNavigator | undefined;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  private readonly storageKey: string;
  private readonly throttleMs: number;
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(
    navigatorRefOrOptions: VibrateNavigator | HapticsOptions | undefined = typeof navigator === "undefined" ? undefined : (navigator as VibrateNavigator),
    options: HapticsOptions = {},
  ) {
    const maybeOptions = navigatorRefOrOptions as HapticsOptions | undefined;
    const isOptionsObject = Boolean(
      maybeOptions &&
        typeof (navigatorRefOrOptions as VibrateNavigator).vibrate !== "function" &&
        ["storage", "storageKey", "reducedMotion", "coarsePointer", "enabled", "throttleMs"].some((key) => key in maybeOptions),
    );
    const resolvedOptions = isOptionsObject ? maybeOptions ?? {} : options;
    this.navigatorRef = isOptionsObject
      ? typeof navigator === "undefined"
        ? undefined
        : (navigator as VibrateNavigator)
      : (navigatorRefOrOptions as VibrateNavigator | undefined);
    this.storageKey = resolvedOptions.storageKey ?? HAPTICS_SETTINGS_KEY;
    this.storage = resolvedOptions.storage !== undefined ? resolvedOptions.storage : this.browserStorage();
    this.reducedMotion = resolvedOptions.reducedMotion ?? this.mediaMatches("(prefers-reduced-motion: reduce)");
    this.coarsePointer = resolvedOptions.coarsePointer ?? this.mediaMatches("(pointer: coarse)");
    this.supported = Boolean(typeof this.navigatorRef?.vibrate === "function");
    const persisted = this.readPersistedEnabled();
    const requested = resolvedOptions.enabled ?? persisted ?? true;
    this.enabled = Boolean(requested && this.supported && this.coarsePointer && !this.reducedMotion);
    this.throttleMs = clamp(typeof resolvedOptions.throttleMs === "number" && Number.isFinite(resolvedOptions.throttleMs) ? resolvedOptions.throttleMs : 42, 0, 1000);
  }

  trigger(event: HapticEvent) {
    if (!this.enabled) return false;
    const pattern = PATTERNS[event];
    if (!pattern) return false;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastAt < this.throttleMs) return false;
    this.lastAt = now;
    try {
      return Boolean(this.navigatorRef?.vibrate?.(pattern));
    } catch {
      return false;
    }
  }

  /** Semantic helpers keep call sites readable while `trigger` stays compatible. */
  triggerHit(location: "body" | "torso" | "head" | "heart" = "body") {
    return this.trigger(location === "head" ? "headHit" : location === "heart" ? "heartHit" : "bodyHit");
  }

  triggerStrong() {
    return this.trigger("strong");
  }

  triggerDamage() {
    return this.trigger("damage");
  }

  triggerDignityLoss() {
    return this.trigger("dignityLoss");
  }

  enable() {
    if (!this.supported || this.reducedMotion || !this.coarsePointer) return false;
    this.enabled = true;
    this.persist(true);
    return true;
  }

  disable() {
    this.enabled = false;
    this.persist(false);
  }

  setEnabled(enabled: boolean) {
    if (enabled) return this.enable();
    this.disable();
    return false;
  }

  isEnabled() {
    return this.enabled;
  }

  isSupported() {
    return this.supported;
  }

  /** Indicates why haptics may be unavailable without exposing the navigator. */
  availability() {
    return {
      supported: this.supported,
      coarsePointer: this.coarsePointer,
      reducedMotion: this.reducedMotion,
      enabled: this.enabled,
    };
  }

  private mediaMatches(query: string) {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    try {
      return Boolean(window.matchMedia(query).matches);
    } catch {
      return false;
    }
  }

  private browserStorage() {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private readPersistedEnabled() {
    return loadHapticsPreference(this.storage, this.storageKey);
  }

  private persist(enabled: boolean) {
    try {
      this.storage?.setItem(this.storageKey, String(enabled));
    } catch {
      // Storage must never make a touch action fail.
    }
  }
}

export { PATTERNS };
