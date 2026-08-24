import type { EnemyCharacterKey } from "@/game/assets";
import type { AttackMove } from "@/game/AttackCatalog";
import { DEFAULT_COMBAT_BALANCE } from "@/game/CombatBalance";

export type LiveEnemyPhase = "spawn" | "approach" | "telegraph" | "strike" | "charge" | "recover" | "stagger" | "dead";

const ENGAGE_DISTANCE: Readonly<Record<EnemyCharacterKey, number>> = Object.freeze({
  gorilla: 2.75,
  crocodile: 3.9,
  lion: 2.75,
  bear: 2.75,
  hippopotamus: 3.35,
  rhinoceros: 10.5,
});

const HIT_RANGE: Readonly<Record<EnemyCharacterKey, number>> = Object.freeze({
  gorilla: DEFAULT_COMBAT_BALANCE.enemy.attackRange,
  crocodile: 4.25,
  lion: 3.15,
  bear: 3.35,
  hippopotamus: 3.75,
  // The charge begins at long range and resolves by contact, rather than by
  // the ordinary strike distance check.
  rhinoceros: 10.5,
});

export function enemyEngageDistance(variant: EnemyCharacterKey) {
  return ENGAGE_DISTANCE[variant];
}

export function enemyHitRange(variant: EnemyCharacterKey) {
  return HIT_RANGE[variant];
}

export function enemyAttackContinuesThroughHit(
  variant: EnemyCharacterKey,
  phase: LiveEnemyPhase,
  move: Pick<AttackMove, "power"> | undefined,
) {
  return variant === "bear"
    && (phase === "telegraph" || phase === "strike")
    && move?.power === "light";
}

export function crocodileGuardsHit(
  variant: EnemyCharacterKey,
  phase: LiveEnemyPhase,
  struckFromFront: boolean,
  heartOpen: boolean,
) {
  return variant === "crocodile"
    && struckFromFront
    && !heartOpen
    && (phase === "approach" || phase === "telegraph" || phase === "strike");
}

export function crocodileGuardBreaks(move: Pick<AttackMove, "power"> | undefined, heartConfirmed: boolean) {
  return heartConfirmed || move?.power === "heavy";
}

export function appliedDamage(remaining: number, incoming: number) {
  const safeRemaining = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const safeIncoming = Number.isFinite(incoming) ? Math.max(0, incoming) : 0;
  return Math.min(safeRemaining, safeIncoming);
}

