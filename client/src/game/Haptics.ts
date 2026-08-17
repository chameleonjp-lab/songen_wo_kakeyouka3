export type HapticEvent = "hit" | "heavy" | "guard" | "justGuard" | "clash" | "rage" | "hurt" | "defeat";

type VibrateNavigator = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

const PATTERNS: Record<HapticEvent, number | number[]> = {
  hit: 16,
  heavy: [22, 18, 30],
  guard: 12,
  justGuard: [18, 24, 42],
  clash: [30, 18, 30],
  rage: [35, 24, 55, 24, 85],
  hurt: [28, 18, 38],
  defeat: [20, 30, 50],
};

export class Haptics {
  private readonly enabled: boolean;
  private lastAt = 0;

  constructor(private readonly navigatorRef: VibrateNavigator | undefined = typeof navigator === "undefined" ? undefined : navigator) {
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    this.enabled = Boolean(!reduced && coarse && typeof this.navigatorRef?.vibrate === "function");
  }

  trigger(event: HapticEvent) {
    if (!this.enabled) return false;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastAt < 42) return false;
    this.lastAt = now;
    try {
      return Boolean(this.navigatorRef?.vibrate?.(PATTERNS[event]));
    } catch {
      return false;
    }
  }

  isEnabled() {
    return this.enabled;
  }
}

export { PATTERNS };
