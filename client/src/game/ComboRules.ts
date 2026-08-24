import type { AttackInputAction } from "@/game/InputManager";

export const MAX_WEAK_CHAIN_STAGE = 2;

export function canQueueWeakFollowup(stage: number) {
  return Number.isInteger(stage) && stage >= 1 && stage < MAX_WEAK_CHAIN_STAGE;
}

export function shouldDiscardExtraWeak(stage: number, nextAttack: AttackInputAction | undefined) {
  return stage >= MAX_WEAK_CHAIN_STAGE && nextAttack === "light";
}
