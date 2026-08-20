import type { HitLocation } from "@/game/HitLocations";

export type AttackMove = Readonly<{
  name: string;
  family: "punch" | "kick";
  power: "light" | "medium" | "heavy";
  duration: number;
  hitStart: number;
  hitEnd: number;
  chainOpen: number;
  chainClose: number;
  dodgeCancelAt: number;
  guardCancelAt: number;
  whiffRecovery: number;
  hitRecovery: number;
  forward: number;
  rotation: number;
  healthMultiplier: Readonly<Record<HitLocation, number>>;
  dignityMultiplier: Readonly<Record<HitLocation, number>>;
}>;

export const PUNCH_ANIMATIONS = [
  "Punch_01_Jab", "Punch_02_Cross", "Punch_03_Hook", "Punch_04_Uppercut", "Punch_05_Overhand",
  "Punch_06_Backfist", "Punch_07_LongJab", "Punch_08_BodyHook", "Punch_09_StraightBody", "Punch_10_Elbow",
  "Punch_11_SpinBackfist", "Punch_12_DoubleJab", "Punch_13_CrossHook", "Punch_14_HookCross", "Punch_15_OneTwo",
  "Punch_16_RisingHook", "Punch_17_LeapingPunch", "Punch_18_ChargePunch", "Punch_19_BurstPunch", "Punch_20_HeavySmash",
] as const;

export const KICK_ANIMATIONS = [
  "Kick_01_Front", "Kick_02_Low", "Kick_03_Mid", "Kick_04_High", "Kick_05_Roundhouse",
  "Kick_06_Side", "Kick_07_Back", "Kick_08_Axe", "Kick_09_Sweep", "Kick_10_Thrust",
  "Kick_11_Spin", "Kick_12_Heel", "Kick_13_Knee", "Kick_14_JumpFront", "Kick_15_JumpRound",
  "Kick_16_Double", "Kick_17_Flying", "Kick_18_Heavy", "Kick_19_Crescent", "Kick_20_Burst",
] as const;

export const ATTACK_ANIMATION_NAMES = [...PUNCH_ANIMATIONS, ...KICK_ANIMATIONS] as const;
export type AttackAnimationName = (typeof ATTACK_ANIMATION_NAMES)[number];

/** Durations read from the currently published GLBs by tools/audit_character_glbs.py. */
export const AUDITED_ATTACK_DURATION_SECONDS: Readonly<Record<AttackAnimationName, number>> = Object.freeze({
  Punch_01_Jab: 0.485,
  Punch_02_Cross: 0.73,
  Punch_03_Hook: 0.655,
  Punch_04_Uppercut: 0.77,
  Punch_05_Overhand: 0.875,
  Punch_06_Backfist: 0.62,
  Punch_07_LongJab: 0.815,
  Punch_08_BodyHook: 0.68,
  Punch_09_StraightBody: 0.635,
  Punch_10_Elbow: 0.59,
  Punch_11_SpinBackfist: 0.935,
  Punch_12_DoubleJab: 0.635,
  Punch_13_CrossHook: 0.815,
  Punch_14_HookCross: 0.885,
  Punch_15_OneTwo: 0.74,
  Punch_16_RisingHook: 0.71,
  Punch_17_LeapingPunch: 0.775,
  Punch_18_ChargePunch: 1,
  Punch_19_BurstPunch: 0.71,
  Punch_20_HeavySmash: 1.055,
  Kick_01_Front: 0.66,
  Kick_02_Low: 0.705,
  Kick_03_Mid: 0.755,
  Kick_04_High: 0.845,
  Kick_05_Roundhouse: 0.83,
  Kick_06_Side: 0.805,
  Kick_07_Back: 0.895,
  Kick_08_Axe: 0.935,
  Kick_09_Sweep: 0.805,
  Kick_10_Thrust: 0.695,
  Kick_11_Spin: 0.96,
  Kick_12_Heel: 0.86,
  Kick_13_Knee: 0.62,
  Kick_14_JumpFront: 0.78,
  Kick_15_JumpRound: 0.92,
  Kick_16_Double: 0.87,
  Kick_17_Flying: 0.89,
  Kick_18_Heavy: 1.055,
  Kick_19_Crescent: 0.92,
  Kick_20_Burst: 0.82,
});

const HEAD_FOCUSED = new Set<AttackAnimationName>([
  "Punch_03_Hook", "Punch_04_Uppercut", "Punch_05_Overhand", "Punch_06_Backfist", "Punch_11_SpinBackfist",
  "Punch_16_RisingHook", "Punch_20_HeavySmash", "Kick_04_High", "Kick_05_Roundhouse", "Kick_08_Axe",
  "Kick_11_Spin", "Kick_12_Heel", "Kick_15_JumpRound", "Kick_19_Crescent", "Kick_20_Burst",
]);

const HEART_FOCUSED = new Set<AttackAnimationName>([
  "Punch_02_Cross", "Punch_07_LongJab", "Punch_08_BodyHook", "Punch_09_StraightBody", "Punch_10_Elbow",
  "Punch_15_OneTwo", "Punch_18_ChargePunch", "Punch_19_BurstPunch", "Kick_01_Front", "Kick_03_Mid",
  "Kick_06_Side", "Kick_10_Thrust", "Kick_13_Knee", "Kick_14_JumpFront", "Kick_17_Flying", "Kick_18_Heavy",
]);

function createMove(name: AttackAnimationName, index: number): AttackMove {
  const family = name.startsWith("Punch") ? "punch" : "kick";
  const familyIndex = index % 20;
  const heavy = familyIndex >= 16 || /Heavy|Smash|Burst|Charge|Flying/.test(name);
  const medium = !heavy && (familyIndex >= 8 || /Spin|Double|Jump|Uppercut|Roundhouse/.test(name));
  const power = heavy ? "heavy" : medium ? "medium" : "light";
  const duration = AUDITED_ATTACK_DURATION_SECONDS[name];
  const hitStart = duration * (power === "heavy" ? 0.46 : 0.38);
  const hitEnd = hitStart + Math.min(0.14, duration * 0.18);
  return Object.freeze({
    name,
    family,
    power,
    duration,
    hitStart,
    hitEnd,
    chainOpen: duration * 0.34,
    chainClose: duration * 0.82,
    dodgeCancelAt: duration * (power === "heavy" ? 0.76 : 0.58),
    guardCancelAt: duration * (power === "heavy" ? 0.84 : 0.65),
    whiffRecovery: power === "heavy" ? 0.38 : power === "medium" ? 0.25 : 0.16,
    hitRecovery: power === "heavy" ? 0.22 : power === "medium" ? 0.15 : 0.1,
    forward: family === "kick" ? 1.15 + familyIndex * 0.035 : 0.72 + familyIndex * 0.04,
    rotation: /Spin|Round|Crescent|Backfist/.test(name) ? Math.PI * 0.72 : 0,
    healthMultiplier: Object.freeze({
      torso: 1,
      head: HEAD_FOCUSED.has(name) ? 0.78 : 0.62,
      heart: HEART_FOCUSED.has(name) ? 1.55 : 1.25,
    }),
    dignityMultiplier: Object.freeze({
      torso: 1,
      head: HEAD_FOCUSED.has(name) ? 1.55 : 1.2,
      heart: 0.45,
    }),
  });
}

export const ATTACK_CATALOG: readonly AttackMove[] = Object.freeze(ATTACK_ANIMATION_NAMES.map(createMove));
export const ATTACK_BY_NAME = new Map<AttackAnimationName, AttackMove>(ATTACK_CATALOG.map((move) => [move.name as AttackAnimationName, move]));

export type AttackSelectionContext = Readonly<{
  kind: "light" | "heavy" | "counter" | "musou";
  stage: number;
  directionX: number;
  directionY: number;
  afterDodge: boolean;
  afterJustGuard: boolean;
  afterClash: boolean;
  distance: number;
  target: HitLocation;
  targetStaggered: boolean;
  rageReady: boolean;
  sequence: number;
}>;

export function selectAttackMove(context: AttackSelectionContext): AttackMove {
  if (context.afterJustGuard || context.kind === "counter") return ATTACK_BY_NAME.get(context.target === "heart" ? "Punch_18_ChargePunch" : "Punch_04_Uppercut")!;
  if (context.afterClash) return ATTACK_BY_NAME.get(context.target === "head" ? "Kick_08_Axe" : "Punch_20_HeavySmash")!;
  if (context.afterDodge) return ATTACK_BY_NAME.get(context.directionX < 0 ? "Kick_07_Back" : "Kick_06_Side")!;
  if (context.rageReady && context.kind === "musou") return ATTACK_BY_NAME.get("Kick_20_Burst")!;
  if (context.target === "heart" && context.targetStaggered) {
    const heartMoves = ["Punch_09_StraightBody", "Kick_13_Knee", "Kick_17_Flying", "Punch_19_BurstPunch"] as const;
    return ATTACK_BY_NAME.get(heartMoves[context.sequence % heartMoves.length])!;
  }
  if (context.target === "head") {
    const headMoves = ["Punch_03_Hook", "Kick_04_High", "Punch_11_SpinBackfist", "Kick_19_Crescent", "Punch_20_HeavySmash"] as const;
    return ATTACK_BY_NAME.get(headMoves[(context.sequence + context.stage) % headMoves.length])!;
  }
  const pool = context.kind === "light" ? PUNCH_ANIMATIONS : KICK_ANIMATIONS;
  const directionBias = Math.abs(context.directionX) > 0.45 ? 5 : context.directionY < -0.45 ? 8 : context.distance > 4 ? 6 : 0;
  return ATTACK_BY_NAME.get(pool[(context.sequence + context.stage * 3 + directionBias) % pool.length])!;
}

export const ENEMY_ATTACK_SETS: Readonly<Record<string, readonly AttackAnimationName[]>> = Object.freeze({
  gorilla: ["Punch_01_Jab", "Punch_02_Cross", "Punch_12_DoubleJab", "Punch_20_HeavySmash"],
  crocodile: ["Punch_07_LongJab", "Kick_10_Thrust", "Punch_18_ChargePunch"],
  lion: ["Punch_06_Backfist", "Kick_05_Roundhouse", "Kick_15_JumpRound", "Punch_19_BurstPunch"],
  bear: ["Punch_05_Overhand", "Punch_20_HeavySmash", "Kick_08_Axe"],
  hippopotamus: ["Kick_09_Sweep", "Kick_11_Spin", "Punch_20_HeavySmash"],
  rhinoceros: ["Punch_18_ChargePunch", "Kick_10_Thrust", "Kick_17_Flying"],
});
