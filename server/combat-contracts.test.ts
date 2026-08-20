import { describe, expect, it } from "vitest";
import {
  ATTACK_BY_NAME,
  BODY_PARTS,
  DEFAULT_HIT_LOCATION_TUNING,
  applyDignityEvent,
  createDignityState,
  createScoreState,
  isDignityLost,
  pointsForHit,
  resolveHit,
  selectAttackMove,
} from "../client/src/game/GameplayRules";
import { clampAttackClashPan, isAttackClashWindow } from "../client/src/game/CombatClash";
import { GameSession } from "../client/src/game/GameSession";
import {
  consumeLocalRetryRequest,
  loadPersonalBest,
  loadPlayerName,
  requestLocalRetry,
  savePersonalBest,
  savePlayerName,
} from "../client/src/game/PlayerProfile";

describe("combat location and attack integration", () => {
  it("keeps all three body zones distinct and applies the conditional heart multiplier", () => {
    expect(BODY_PARTS).toEqual(["head", "torso", "heart"]);
    expect(DEFAULT_HIT_LOCATION_TUNING.head.damageMultiplier).toBe(0.75);
    expect(DEFAULT_HIT_LOCATION_TUNING.torso.damageMultiplier).toBe(1);
    expect(DEFAULT_HIT_LOCATION_TUNING.heart.damageMultiplier).toBe(2.2);

    const head = resolveHit(10, "head");
    const torso = resolveHit(10, "torso");
    const closedHeart = resolveHit(10, "heart");
    const openHeart = resolveHit(10, "heart", DEFAULT_HIT_LOCATION_TUNING, { heartExposed: true });
    expect(head.damage).toBe(7.5);
    expect(torso.damage).toBe(10);
    expect(closedHeart.location).toBe("torso");
    expect(closedHeart.damage).toBe(10);
    expect(openHeart.location).toBe("heart");
    expect(openHeart.damage).toBe(22);
    expect(openHeart.critical).toBe(true);
  });

  it("routes just-guard, clash, dodge and rage states to distinct public moves", () => {
    const base = {
      stage: 0,
      directionX: 0,
      directionY: 1,
      afterDodge: false,
      afterJustGuard: false,
      afterClash: false,
      distance: 2.5,
      target: "torso" as const,
      targetStaggered: false,
      rageReady: false,
      sequence: 0,
    };
    expect(selectAttackMove({ ...base, kind: "counter", target: "heart" }).name).toBe("Punch_18_ChargePunch");
    expect(selectAttackMove({ ...base, kind: "heavy", afterJustGuard: true }).name).toBe("Punch_04_Uppercut");
    expect(selectAttackMove({ ...base, kind: "heavy", afterClash: true, target: "head" }).name).toBe("Kick_08_Axe");
    expect(selectAttackMove({ ...base, kind: "light", afterDodge: true, directionX: -1 }).name).toBe("Kick_07_Back");
    expect(selectAttackMove({ ...base, kind: "musou", rageReady: true }).name).toBe("Kick_20_Burst");
    expect(ATTACK_BY_NAME.get("Punch_18_ChargePunch")?.healthMultiplier.heart).toBe(1.55);
  });

  it("keeps clash bounds inclusive and pans clamped for the effect layer", () => {
    expect(isAttackClashWindow(0.4)).toBe(true);
    expect(isAttackClashWindow(0.68)).toBe(true);
    expect(isAttackClashWindow(0.3999)).toBe(false);
    expect(isAttackClashWindow(0.6801)).toBe(false);
    expect(clampAttackClashPan(-3)).toBe(-1);
    expect(clampAttackClashPan(3)).toBe(1);
  });
});

describe("dignity and score integration", () => {
  it("has an observable zero-dignity state and preserves heart confirmation in scoring", () => {
    let dignity = createDignityState();
    dignity = applyDignityEvent(dignity, { type: "hit", location: "head", amount: 100 });
    expect(dignity.value).toBe(0);
    expect(isDignityLost(dignity)).toBe(true);
    const closedHeartPoints = pointsForHit({ damage: 10, location: "heart", heartConfirmed: false });
    const openHeartPoints = pointsForHit({ damage: 10, location: "heart", heartConfirmed: true });
    expect(closedHeartPoints).toBe(25);
    expect(openHeartPoints).toBe(300);
    expect(openHeartPoints).toBeGreaterThan(closedHeartPoints);
  });

  it("carries just-guard, clash and confirmed vital-hit counters into the run result", () => {
    const session = new GameSession("TEST");
    session.recordJustGuard();
    session.recordClash();
    session.recordHit(resolveHit(4, "heart", DEFAULT_HIT_LOCATION_TUNING, { heartExposed: true }), "counter-heart");
    const result = session.finish("retired", 44, 0, 3);
    expect(result).toMatchObject({ reason: "retired", justGuards: 1, clashes: 1, heartHits: 1, remainingDignity: 0 });
    expect(session.finish("victory", 100, 100, 6)).toBe(result);
    expect(session.rankingSubmission()).toMatchObject({ gameSlug: "songen_wo_kakeyouka3", score: result.score });
    expect(createScoreState().total).toBe(0);
  });
});

type MemoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("local retry and profile persistence", () => {
  it("round-trips sanitized player names, best scores and one-shot retry requests", () => {
    const profile = memoryStorage();
    const retry = memoryStorage();
    expect(savePlayerName("  <戦士>  ", profile)).toBe("戦士");
    expect(loadPlayerName(profile)).toBe("戦士");
    expect(savePersonalBest(1234.9, profile)).toBe(1234);
    expect(savePersonalBest(999, profile)).toBe(1234);
    expect(loadPersonalBest(profile)).toBe(1234);
    expect(consumeLocalRetryRequest(retry)).toBe(false);
    requestLocalRetry(retry);
    expect(consumeLocalRetryRequest(retry)).toBe(true);
    expect(consumeLocalRetryRequest(retry)).toBe(false);
  });

  it("treats storage failures as recoverable gameplay conditions", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    } as MemoryStorage;
    expect(loadPlayerName(broken)).toBe("");
    expect(loadPersonalBest(broken)).toBe(0);
    expect(savePlayerName("PLAYER", broken)).toBe("PLAYER");
    expect(savePersonalBest(10, broken)).toBe(10);
    expect(() => requestLocalRetry(broken)).not.toThrow();
    expect(consumeLocalRetryRequest(broken)).toBe(false);
  });
});
