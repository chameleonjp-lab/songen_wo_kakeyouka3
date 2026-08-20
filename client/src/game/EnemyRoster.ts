import { type EnemyCharacterKey } from "@/game/assets";
import { DEFAULT_COMBAT_BALANCE } from "@/game/CombatBalance";

/**
 * The roster is deliberately data-only. The values are gameplay tuning, not
 * claims about real animal physiology; an integration can replace any field
 * while keeping the asset order and stable variant key.
 */
export type EnemyBehavior = "balanced" | "guard" | "power" | "tank" | "rush" | "charger";

export type EnemyProfile = Readonly<{
  order: number;
  variant: EnemyCharacterKey;
  displayName: string;
  behavior: EnemyBehavior;
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  telegraphMultiplier: number;
  scoreMultiplier: number;
  dignityPressure: number;
}>;

const profile = (
  variant: EnemyCharacterKey,
  displayName: string,
  behavior: EnemyBehavior,
  values: Omit<EnemyProfile, "order" | "variant" | "displayName" | "behavior">,
): EnemyProfile => ({ order: 0, variant, displayName, behavior, ...values });

const PROFILE_BY_VARIANT: Record<EnemyCharacterKey, EnemyProfile> = {
  bear: profile("bear", "熊", "power", {
    healthMultiplier: 1.25,
    damageMultiplier: 1.4,
    speedMultiplier: 0.72,
    telegraphMultiplier: 1.15,
    scoreMultiplier: 1.28,
    dignityPressure: 1.2,
  }),
  crocodile: profile("crocodile", "ワニ", "guard", {
    healthMultiplier: 0.9,
    damageMultiplier: 1.05,
    speedMultiplier: 1,
    telegraphMultiplier: 1.08,
    scoreMultiplier: 1.08,
    dignityPressure: 1.12,
  }),
  gorilla: profile("gorilla", "ゴリラ", "balanced", {
    healthMultiplier: 1,
    damageMultiplier: 0.92,
    speedMultiplier: 0.95,
    telegraphMultiplier: 1.05,
    scoreMultiplier: 1,
    dignityPressure: 0.9,
  }),
  hippopotamus: profile("hippopotamus", "カバ", "tank", {
    healthMultiplier: 1.48,
    damageMultiplier: 1.25,
    speedMultiplier: 0.65,
    telegraphMultiplier: 1.08,
    scoreMultiplier: 1.35,
    dignityPressure: 1.25,
  }),
  lion: profile("lion", "ライオン", "rush", {
    healthMultiplier: 0.82,
    damageMultiplier: 0.95,
    speedMultiplier: 1.3,
    telegraphMultiplier: 0.82,
    scoreMultiplier: 1.12,
    dignityPressure: 1.04,
  }),
  rhinoceros: profile("rhinoceros", "サイ", "charger", {
    healthMultiplier: 1.35,
    damageMultiplier: 1.45,
    speedMultiplier: 0.88,
    telegraphMultiplier: 1.22,
    scoreMultiplier: 1.42,
    dignityPressure: 1.35,
  }),
};

/** Formal six-fight order; asset declaration order is not the encounter order. */
export const ENEMY_ROSTER_ORDER: readonly EnemyCharacterKey[] = Object.freeze([
  "gorilla",
  "crocodile",
  "lion",
  "bear",
  "hippopotamus",
  "rhinoceros",
]);

export const DEFAULT_ENEMY_ROSTER: readonly EnemyProfile[] = Object.freeze(
  ENEMY_ROSTER_ORDER.map((variant, order) => Object.freeze({ ...PROFILE_BY_VARIANT[variant], order })),
);

const isFiniteNumber = (value: number) => Number.isFinite(value);

export function validateEnemyRoster(roster: readonly EnemyProfile[]): string[] {
  const errors: string[] = [];
  const seen = new Set<EnemyCharacterKey>();
  roster.forEach((entry, index) => {
    if (entry.order !== index) errors.push(`${entry.variant}.order must be ${index}`);
    if (seen.has(entry.variant)) errors.push(`${entry.variant} appears more than once`);
    seen.add(entry.variant);
    if (!entry.displayName.trim()) errors.push(`${entry.variant}.displayName must not be empty`);
    if (!isFiniteNumber(entry.healthMultiplier) || entry.healthMultiplier <= 0) errors.push(`${entry.variant}.healthMultiplier must be positive`);
    if (!isFiniteNumber(entry.damageMultiplier) || entry.damageMultiplier <= 0) errors.push(`${entry.variant}.damageMultiplier must be positive`);
    if (!isFiniteNumber(entry.speedMultiplier) || entry.speedMultiplier <= 0) errors.push(`${entry.variant}.speedMultiplier must be positive`);
    if (!isFiniteNumber(entry.telegraphMultiplier) || entry.telegraphMultiplier <= 0) errors.push(`${entry.variant}.telegraphMultiplier must be positive`);
    if (!isFiniteNumber(entry.scoreMultiplier) || entry.scoreMultiplier <= 0) errors.push(`${entry.variant}.scoreMultiplier must be positive`);
    if (!isFiniteNumber(entry.dignityPressure) || entry.dignityPressure <= 0) errors.push(`${entry.variant}.dignityPressure must be positive`);
  });
  if (roster.length !== ENEMY_ROSTER_ORDER.length) errors.push(`roster must contain ${ENEMY_ROSTER_ORDER.length} entries`);
  ENEMY_ROSTER_ORDER.forEach((variant) => {
    if (!seen.has(variant)) errors.push(`${variant} is missing from the roster`);
  });
  return errors;
}

function assertRoster(roster: readonly EnemyProfile[]) {
  const errors = validateEnemyRoster(roster);
  if (errors.length > 0) throw new Error(`Invalid enemy roster: ${errors.join("; ")}`);
}

/**
 * Clone and freeze a roster so a caller cannot accidentally mutate the shared
 * default while experimenting with a difficulty pass.
 */
export function createEnemyRoster(roster: readonly EnemyProfile[] = DEFAULT_ENEMY_ROSTER): readonly EnemyProfile[] {
  assertRoster(roster);
  return Object.freeze(roster.map((entry, order) => Object.freeze({ ...entry, order })));
}

export function enemyForRound(round: number, roster: readonly EnemyProfile[] = DEFAULT_ENEMY_ROSTER): EnemyProfile | null {
  if (!Number.isFinite(round) || round < 0 || roster.length === 0) return null;
  const index = Math.floor(round);
  return roster[index] ?? null;
}

export function enemyProfileFor(variant: EnemyCharacterKey, roster: readonly EnemyProfile[] = DEFAULT_ENEMY_ROSTER): EnemyProfile | null {
  return roster.find((entry) => entry.variant === variant) ?? null;
}

export function enemyRosterIndex(variant: EnemyCharacterKey, roster: readonly EnemyProfile[] = DEFAULT_ENEMY_ROSTER): number {
  return roster.findIndex((entry) => entry.variant === variant);
}

/** Resolve the actual HP from the shared baseline and this enemy's tuning. */
export function enemyHealth(
  enemy: EnemyProfile,
  baseHealth = DEFAULT_COMBAT_BALANCE.enemy.baseHealth,
): number {
  const safeBase = Number.isFinite(baseHealth) ? Math.max(0, baseHealth) : 0;
  return safeBase * enemy.healthMultiplier;
}
