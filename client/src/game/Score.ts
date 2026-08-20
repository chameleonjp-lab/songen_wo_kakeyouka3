import { DEFAULT_HIT_LOCATION_TUNING, type HitLocation } from "@/game/HitLocations";

/** Score values are intentionally explicit so a design pass can retune them in one place. */
export type ScoreConfig = Readonly<{
  /** Fallback torso hit value. */
  hitBase: number;
  /** Kept for integrations that want a damage-sensitive non-vital hit. */
  damagePoint: number;
  comboStep: number;
  comboCap: number;
  comboTimeoutSeconds: number;
  guardPoints: number;
  justGuardPoints: number;
  clashPoints: number;
  newMovePoints: number;
  headHitPoints: number;
  heartHitPoints: number;
  defeatPoints: number;
  roundMultiplier: number;
  comboPoint: number;
  dignityPoint: number;
  damageTakenPenalty: number;
  dignityLostPenalty: number;
  poopTransformationPenalty: number;
  repeatMultiplierStep: number;
  repeatMultiplierFloor: number;
  shortTimeBonusMax: number;
  shortTimeWindowSeconds: number;
}>;

export type ScoreState = Readonly<{
  total: number;
  combo: number;
  bestCombo: number;
  maxCombo: number;
  comboTimer: number;
  hits: number;
  criticalHits: number;
  defeats: number;
  lastPoints: number;
  heartHits: number;
  headHits: number;
  justGuards: number;
  clashes: number;
  uniqueMoves: number;
  damageTaken: number;
  dignityLost: number;
  poopTransformations: number;
  elapsed: number;
  roundElapsed: number;
  cleared: boolean;
  /** Internal deterministic usage map; IDs are opaque and need not be move names. */
  moveUses: Readonly<Record<string, number>>;
}>;

export type HitScoreInput = Readonly<{
  damage: number;
  location?: HitLocation;
  /** Override for a resolved hit with a custom location table. */
  scoreMultiplier?: number;
  enemyMultiplier?: number;
  dignity?: number;
  critical?: boolean;
  combo?: number;
  /** Stable attack slot ID, not a speculative animation name. */
  moveId?: string;
  /** Number of prior uses of moveId, used for repeat diminishing returns. */
  repeatCount?: number;
  /** A heart hit must be explicitly confirmed by the opening context. */
  heartConfirmed?: boolean;
}>;

export type ScoreEvent =
  | (Readonly<{ type: "hit" }> & HitScoreInput & Readonly<{ dignityDamage?: number }>)
  | Readonly<{ type: "new-move"; moveId?: string; move?: string }>
  | Readonly<{ type: "guard"; just?: boolean }>
  | Readonly<{ type: "clash" }>
  | Readonly<{ type: "defeat"; round?: number; enemyMultiplier?: number }>
  | Readonly<{ type: "damage-taken" | "take-hit"; amount: number }>
  | Readonly<{ type: "dignity-loss"; amount: number }>
  | Readonly<{ type: "poop-transform" | "poop-head" }>
  | Readonly<{ type: "miss" }>
  | Readonly<{ type: "tick"; deltaSeconds: number; roundActive?: boolean }>
  | Readonly<{ type: "clear" }>;

export const DEFAULT_SCORE_CONFIG: ScoreConfig = Object.freeze({
  hitBase: 25,
  damagePoint: 0,
  comboStep: 0.08,
  comboCap: 20,
  comboTimeoutSeconds: 2.2,
  guardPoints: 0,
  justGuardPoints: 200,
  clashPoints: 150,
  newMovePoints: 50,
  headHitPoints: 100,
  heartHitPoints: 300,
  defeatPoints: 1000,
  roundMultiplier: 0,
  comboPoint: 3,
  dignityPoint: 0,
  damageTakenPenalty: 10,
  dignityLostPenalty: 10,
  poopTransformationPenalty: 250,
  repeatMultiplierStep: 0.15,
  repeatMultiplierFloor: 0.25,
  shortTimeBonusMax: 1500,
  shortTimeWindowSeconds: 60,
});

export function createScoreConfig(overrides: Partial<ScoreConfig> = {}): ScoreConfig {
  const config = Object.freeze({ ...DEFAULT_SCORE_CONFIG, ...overrides });
  const numeric = Object.values(config).every((value) => typeof value === "number" && Number.isFinite(value));
  if (!numeric || config.repeatMultiplierFloor < 0 || config.repeatMultiplierFloor > 1 || config.shortTimeBonusMax < 0) {
    throw new Error("Invalid score config");
  }
  return config;
}

const safeNonNegative = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, value as number) : 0);
const safeMultiplier = (value: number | undefined) => (Number.isFinite(value) ? Math.max(0, value as number) : 1);

export function createScoreState(): ScoreState {
  return Object.freeze({
    total: 0,
    combo: 0,
    bestCombo: 0,
    maxCombo: 0,
    comboTimer: 0,
    hits: 0,
    criticalHits: 0,
    defeats: 0,
    lastPoints: 0,
    heartHits: 0,
    headHits: 0,
    justGuards: 0,
    clashes: 0,
    uniqueMoves: 0,
    damageTaken: 0,
    dignityLost: 0,
    poopTransformations: 0,
    elapsed: 0,
    roundElapsed: 0,
    cleared: false,
    moveUses: Object.freeze({}),
  });
}

function clampTotal(total: number) {
  return Math.max(0, total);
}

function repeatMultiplier(repeatCount: number, config: ScoreConfig): number {
  const count = Number.isFinite(repeatCount) ? Math.max(0, repeatCount) : 0;
  return Math.max(config.repeatMultiplierFloor, 1 - count * config.repeatMultiplierStep);
}

function locationBasePoints(location: HitLocation, heartConfirmed: boolean, config: ScoreConfig): number {
  if (location === "heart" && heartConfirmed) return config.heartHitPoints;
  if (location === "head") return config.headHitPoints;
  return config.hitBase;
}

/** Score a single hit before combo bookkeeping or a new-move bonus. */
export function pointsForHit(input: HitScoreInput, config: ScoreConfig = DEFAULT_SCORE_CONFIG): number {
  const location = input.location ?? "torso";
  const heartConfirmed = input.heartConfirmed !== false;
  const base = locationBasePoints(location, heartConfirmed, config);
  const customMultiplier = input.scoreMultiplier ?? 1;
  const dignityBonus = safeNonNegative(input.dignity) * config.dignityPoint;
  const damageBonus = safeNonNegative(input.damage) * config.damagePoint;
  const repeated = repeatMultiplier(input.repeatCount ?? 0, config);
  const comboMultiplier = 1 + Math.min(config.comboCap, Math.max(0, input.combo ?? 0)) * config.comboStep;
  return Math.max(0, Math.round((base + damageBonus + dignityBonus) * safeMultiplier(customMultiplier) * safeMultiplier(input.enemyMultiplier) * repeated * comboMultiplier));
}

export function pointsForDefeat(
  round = 0,
  enemyMultiplier = 1,
  combo = 0,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): number {
  const safeRound = Number.isFinite(round) ? Math.max(0, Math.floor(round)) : 0;
  const base = config.defeatPoints * (1 + safeRound * config.roundMultiplier) * safeMultiplier(enemyMultiplier);
  return Math.max(0, Math.round(base + Math.max(0, combo) * config.comboPoint));
}

function withPoints(state: ScoreState, points: number, next: Partial<ScoreState>): ScoreState {
  const safePoints = Number.isFinite(points) ? points : 0;
  return Object.freeze({
    ...state,
    ...next,
    total: clampTotal(state.total + safePoints),
    lastPoints: safePoints,
  });
}

function nextCombo(state: ScoreState, config: ScoreConfig, increment = 1) {
  const combo = Math.max(0, state.combo + increment);
  return {
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    maxCombo: Math.max(state.maxCombo, combo),
    comboTimer: combo > 0 ? config.comboTimeoutSeconds : 0,
  };
}

function normalizeMoveId(moveId: string | undefined): string | null {
  const value = moveId?.trim();
  return value ? value : null;
}

function applyMoveUse(state: ScoreState, moveId: string): { uses: number; moveUses: Readonly<Record<string, number>>; unique: boolean } {
  const uses = state.moveUses[moveId] ?? 0;
  const moveUses = Object.freeze({ ...state.moveUses, [moveId]: uses + 1 });
  return { uses, moveUses, unique: uses === 0 };
}

function shortTimePoints(roundElapsed: number, config: ScoreConfig): number {
  if (config.shortTimeWindowSeconds <= 0) return 0;
  const ratio = Math.max(0, 1 - roundElapsed / config.shortTimeWindowSeconds);
  return Math.round(config.shortTimeBonusMax * ratio);
}

export function applyScoreEvent(
  state: ScoreState,
  event: ScoreEvent,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
): ScoreState {
  switch (event.type) {
    case "hit": {
      const moveId = normalizeMoveId(event.moveId);
      const moveUse = moveId ? applyMoveUse(state, moveId) : null;
      const points = pointsForHit({ ...event, combo: state.combo, repeatCount: moveUse?.uses ?? event.repeatCount }, config);
      const moveBonus = moveUse?.unique ? config.newMovePoints : 0;
      const combo = nextCombo(state, config);
      const heart = event.location === "heart" && event.heartConfirmed !== false;
      const head = event.location === "head";
      return withPoints(state, points + moveBonus, {
        ...combo,
        hits: state.hits + 1,
        criticalHits: state.criticalHits + ((event.critical ?? (heart || head)) ? 1 : 0),
        heartHits: state.heartHits + (heart ? 1 : 0),
        headHits: state.headHits + (head ? 1 : 0),
        uniqueMoves: state.uniqueMoves + (moveUse?.unique ? 1 : 0),
        moveUses: moveUse?.moveUses ?? state.moveUses,
        dignityLost: state.dignityLost + safeNonNegative(event.dignityDamage),
      });
    }
    case "new-move": {
      const moveId = normalizeMoveId(event.moveId ?? event.move);
      if (!moveId) return state;
      const moveUse = applyMoveUse(state, moveId);
      if (!moveUse.unique) return withPoints(state, 0, { moveUses: moveUse.moveUses });
      return withPoints(state, config.newMovePoints, { uniqueMoves: state.uniqueMoves + 1, moveUses: moveUse.moveUses });
    }
    case "guard": {
      const points = event.just ? config.justGuardPoints : config.guardPoints;
      const combo = event.just ? nextCombo(state, config) : { combo: state.combo, bestCombo: state.bestCombo, maxCombo: state.maxCombo, comboTimer: state.comboTimer };
      return withPoints(state, points, { ...combo, justGuards: state.justGuards + (event.just ? 1 : 0) });
    }
    case "clash": {
      const combo = nextCombo(state, config);
      return withPoints(state, config.clashPoints, { ...combo, clashes: state.clashes + 1 });
    }
    case "defeat": {
      const points = pointsForDefeat(event.round, event.enemyMultiplier, state.combo, config) + shortTimePoints(state.roundElapsed, config);
      const combo = nextCombo(state, config);
      return withPoints(state, points, { ...combo, defeats: state.defeats + 1, roundElapsed: 0 });
    }
    case "damage-taken":
    case "take-hit": {
      const amount = safeNonNegative(event.amount);
      return withPoints(state, -amount * config.damageTakenPenalty, { combo: 0, comboTimer: 0, damageTaken: state.damageTaken + amount });
    }
    case "dignity-loss": {
      const amount = safeNonNegative(event.amount);
      return withPoints(state, -amount * config.dignityLostPenalty, { combo: 0, comboTimer: 0, dignityLost: state.dignityLost + amount });
    }
    case "poop-transform":
    case "poop-head":
      return withPoints(state, -config.poopTransformationPenalty, { poopTransformations: state.poopTransformations + 1, combo: 0, comboTimer: 0 });
    case "miss":
      return withPoints(state, 0, { combo: 0, comboTimer: 0 });
    case "tick":
      return tickScore(state, event.deltaSeconds, config, event.roundActive ?? true);
    case "clear": {
      if (state.cleared) return state;
      return withPoints(state, 0, { cleared: true });
    }
  }
}

export function tickScore(
  state: ScoreState,
  deltaSeconds: number,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG,
  roundActive = true,
): ScoreState {
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const elapsed = state.elapsed + delta;
  const roundElapsed = state.roundElapsed + (roundActive ? delta : 0);
  if (state.combo <= 0) return Object.freeze({ ...state, elapsed, roundElapsed });
  const comboTimer = Math.max(0, state.comboTimer - delta);
  if (comboTimer > 0) return Object.freeze({ ...state, elapsed, roundElapsed, comboTimer });
  return Object.freeze({ ...state, elapsed, roundElapsed, combo: 0, comboTimer: 0, lastPoints: 0 });
}
