import { DEFAULT_HIT_LOCATION_TUNING, type HitLocation } from "@/game/HitLocations";

export type DignityTier = "broken" | "shaken" | "steady" | "proud";

export type DignityConfig = Readonly<{
  max: number;
  initial: number;
  hitPenalty: number;
  damagePenaltyScale: number;
  missPenalty: number;
  guardReward: number;
  justGuardReward: number;
  clashReward: number;
  dodgeReward: number;
  defeatReward: number;
  locationDamage: Readonly<Record<HitLocation, number>>;
}>;

export type DignityState = Readonly<{
  value: number;
  max: number;
  streak: number;
  tier: DignityTier;
}>;

export type DignityEvent =
  /** A confirmed hit removes dignity according to the target location. */
  | Readonly<{ type: "hit" | "deal-hit"; location?: HitLocation; amount?: number }>
  | Readonly<{ type: "guard"; just?: boolean }>
  | Readonly<{ type: "clash" }>
  | Readonly<{ type: "dodge" }>
  | Readonly<{ type: "take-hit"; amount?: number }>
  | Readonly<{ type: "miss" }>
  | Readonly<{ type: "defeat" }>
  | Readonly<{ type: "reset" }>;

export const DEFAULT_DIGNITY_CONFIG: DignityConfig = Object.freeze({
  max: 100,
  initial: 100,
  hitPenalty: 4,
  damagePenaltyScale: 0.2,
  missPenalty: 2,
  guardReward: 2,
  justGuardReward: 8,
  clashReward: 3,
  dodgeReward: 1,
  defeatReward: 10,
  locationDamage: Object.freeze({
    head: DEFAULT_HIT_LOCATION_TUNING.head.dignityDamage,
    torso: DEFAULT_HIT_LOCATION_TUNING.torso.dignityDamage,
    heart: DEFAULT_HIT_LOCATION_TUNING.heart.dignityDamage,
  }),
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function safeConfig(config: DignityConfig): DignityConfig {
  if (!Number.isFinite(config.max) || config.max <= 0) throw new Error("Dignity max must be greater than zero");
  if (!Number.isFinite(config.initial)) throw new Error("Dignity initial must be finite");
  if (config.initial < 0 || config.initial > config.max) throw new Error("Dignity initial must be within its range");
  return config;
}

export function dignityTier(value: number, max: number): DignityTier {
  const ratio = max > 0 ? clamp(value, 0, max) / max : 0;
  if (ratio <= 0) return "broken";
  if (ratio < 0.35) return "shaken";
  if (ratio < 0.8) return "steady";
  return "proud";
}

export function createDignityState(config: DignityConfig = DEFAULT_DIGNITY_CONFIG, initial = config.initial): DignityState {
  safeConfig(config);
  const value = clamp(Number.isFinite(initial) ? initial : config.initial, 0, config.max);
  return Object.freeze({ value, max: config.max, streak: 0, tier: dignityTier(value, config.max) });
}

export function changeDignity(state: DignityState, delta: number): DignityState {
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const value = clamp(state.value + safeDelta, 0, state.max);
  const streak = safeDelta > 0 ? state.streak + 1 : safeDelta < 0 ? 0 : state.streak;
  return Object.freeze({ value, max: state.max, streak, tier: dignityTier(value, state.max) });
}

export function applyDignityDamage(state: DignityState, amount: number): DignityState {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return changeDignity(state, -safeAmount);
}

export function isDignityLost(state: DignityState) {
  return state.value <= 0;
}

function eventDelta(event: DignityEvent, config: DignityConfig): number {
  switch (event.type) {
    case "hit":
    case "deal-hit":
      return -Math.max(0, event.amount ?? config.locationDamage[event.location ?? "torso"] ?? config.locationDamage.torso);
    case "guard":
      return event.just ? config.justGuardReward : config.guardReward;
    case "clash":
      return config.clashReward;
    case "dodge":
      return config.dodgeReward;
    case "take-hit":
      return -(config.hitPenalty + Math.max(0, event.amount ?? 0) * config.damagePenaltyScale);
    case "miss":
      return -config.missPenalty;
    case "defeat":
      return config.defeatReward;
    case "reset":
      return 0;
  }
}

export function applyDignityEvent(
  state: DignityState,
  event: DignityEvent,
  config: DignityConfig = DEFAULT_DIGNITY_CONFIG,
): DignityState {
  safeConfig(config);
  if (event.type === "reset") return createDignityState(config);
  return changeDignity(state, eventDelta(event, config));
}
