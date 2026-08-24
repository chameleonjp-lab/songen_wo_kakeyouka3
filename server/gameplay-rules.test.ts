import { describe, expect, it } from "vitest";
import {
  ATTACK_ANIMATION_NAMES,
  ATTACK_BY_NAME,
  ATTACK_CATALOG,
  DEFAULT_COMBAT_BALANCE,
  DEFAULT_DIGNITY_CONFIG,
  DEFAULT_ENEMY_ROSTER,
  DEFAULT_HIT_LOCATION_TUNING,
  COUNTER_WINDOW_SECONDS,
  TARGET_VOLUME_RADIUS,
  ENEMY_ROSTER_ORDER,
  ENEMY_ATTACK_SETS,
  applyDignityDamage,
  applyDignityEvent,
  applyScoreEvent,
  canQueueWeakFollowup,
  classifyHitLocation,
  createCombatBalance,
  createDignityState,
  createScoreState,
  enemyForRound,
  enemyHealth,
  enemyRosterIndex,
  isDignityLost,
  JUST_GUARD_WINDOW_SECONDS,
  pointsForHit,
  resolveHit,
  selectAttackMove,
  PUNCH_ANIMATIONS,
  KICK_ANIMATIONS,
  ShortInputQueue,
  shouldDiscardExtraWeak,
  tickScore,
} from "../client/src/game/GameplayRules";

describe("formal weak combo route", () => {
  it("accepts one weak follow-up and discards a third weak tap", () => {
    expect(canQueueWeakFollowup(1)).toBe(true);
    expect(canQueueWeakFollowup(2)).toBe(false);
    expect(shouldDiscardExtraWeak(2, "light")).toBe(true);
    expect(shouldDiscardExtraWeak(2, "heavy")).toBe(false);
  });
});

describe("formal defensive timing", () => {
  it("keeps the documented just-guard and counter windows", () => {
    expect(JUST_GUARD_WINDOW_SECONDS).toBe(0.16);
    expect(COUNTER_WINDOW_SECONDS).toBe(0.72);
  });
});

describe("pure combat balance", () => {
  it("keeps the current combat shape while making enemy health a deliberate tune", () => {
    expect(DEFAULT_COMBAT_BALANCE.player.maxHealth).toBe(100);
    expect(DEFAULT_COMBAT_BALANCE.attacks.light.damage).toBeCloseTo(1.25);
    expect(DEFAULT_COMBAT_BALANCE.enemy.baseHealth).toBeGreaterThan(3.5);
    expect(DEFAULT_COMBAT_BALANCE.enemy.targetFightSeconds).toEqual({ min: 25, max: 60 });

    const tuned = createCombatBalance({
      attacks: { light: { damage: 2.25 } },
      inputBuffer: { capacity: 2, windowSeconds: 0.42 },
    });
    expect(tuned.attacks.light.damage).toBe(2.25);
    expect(tuned.attacks.heavy.damage).toBe(DEFAULT_COMBAT_BALANCE.attacks.heavy.damage);
    expect(tuned.inputBuffer).toEqual({ capacity: 2, windowSeconds: 0.42 });
    expect(() => createCombatBalance({ attacks: { light: { hitAtFraction: 1.1 } } })).toThrow("Invalid combat balance");
  });
});

describe("formal six-enemy roster", () => {
  it("uses the specified encounter order rather than asset declaration order", () => {
    expect(ENEMY_ROSTER_ORDER).toEqual(["gorilla", "crocodile", "lion", "bear", "hippopotamus", "rhinoceros"]);
    expect(DEFAULT_ENEMY_ROSTER.map((enemy) => enemy.variant)).toEqual([...ENEMY_ROSTER_ORDER]);
    expect(DEFAULT_ENEMY_ROSTER.map((enemy) => enemy.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(enemyForRound(0)?.variant).toBe("gorilla");
    expect(enemyForRound(5)?.variant).toBe("rhinoceros");
    expect(enemyForRound(6)).toBeNull();
    expect(enemyRosterIndex("lion")).toBe(2);
  });

  it("exposes distinct tuning for health, pressure, speed and reward", () => {
    const health = DEFAULT_ENEMY_ROSTER.map((enemy) => enemyHealth(enemy));
    expect(new Set(health).size).toBe(6);
    expect(health[2]).toBeLessThan(health[5]);
    expect(new Set(DEFAULT_ENEMY_ROSTER.map((enemy) => enemy.behavior)).size).toBe(6);
    expect(DEFAULT_ENEMY_ROSTER.every((enemy) => enemy.scoreMultiplier > 0 && enemy.dignityPressure > 0)).toBe(true);
  });
});

describe("head, torso and conditional heart hit locations", () => {
  it("uses explicit mesh evidence and never guesses heart from an unlabeled height", () => {
    expect(classifyHitLocation("HeartBody")).toBe("heart");
    expect(classifyHitLocation({ boneName: "animalHead" })).toBe("head");
    expect(classifyHitLocation({ normalizedHeight: 0.9 })).toBe("head");
    expect(classifyHitLocation({ normalizedHeight: 0.2 })).toBe("torso");
    expect(classifyHitLocation({ normalizedHeight: 0.65 })).toBe("torso");
  });

  it("keeps head damage below torso while applying larger dignity pressure", () => {
    const torso = resolveHit(10, "torso");
    const head = resolveHit(10, "head");
    const closedHeart = resolveHit(10, "heart");
    const openHeart = resolveHit(10, "heart", DEFAULT_HIT_LOCATION_TUNING, { heartExposed: true });
    expect(head.damage).toBeLessThan(torso.damage);
    expect(head.dignityDamage).toBeGreaterThan(torso.dignityDamage);
    expect(closedHeart.location).toBe("torso");
    expect(closedHeart.heartConfirmed).toBe(false);
    expect(openHeart.location).toBe("heart");
    expect(openHeart.damage).toBeGreaterThan(torso.damage);
    expect(openHeart.scoreMultiplier).toBeGreaterThan(torso.scoreMultiplier);
    expect(TARGET_VOLUME_RADIUS.heart).toBeLessThan(TARGET_VOLUME_RADIUS.head);
    expect(TARGET_VOLUME_RADIUS.head).toBeLessThan(TARGET_VOLUME_RADIUS.torso);
  });
});

describe("dignity meter", () => {
  it("applies location damage, clamps at zero, and preserves immutable snapshots", () => {
    const initial = createDignityState();
    const headHit = applyDignityEvent(initial, { type: "hit", location: "head" });
    expect(initial.value).toBe(DEFAULT_DIGNITY_CONFIG.initial);
    expect(headHit.value).toBe(initial.value - DEFAULT_DIGNITY_CONFIG.locationDamage.head);
    expect(headHit.streak).toBe(0);
    const broken = applyDignityDamage(headHit, 999);
    expect(broken.value).toBe(0);
    expect(broken.tier).toBe("broken");
    expect(isDignityLost(broken)).toBe(true);
    const guard = applyDignityEvent(broken, { type: "guard", just: true });
    expect(guard.value).toBe(DEFAULT_DIGNITY_CONFIG.justGuardReward);
    expect(guard.streak).toBe(1);
  });
});

describe("score ledger", () => {
  it("rewards precision and combo without mutating the prior state", () => {
    const initial = createScoreState();
    const torsoPoints = pointsForHit({ damage: 5, location: "torso" });
    const headPoints = pointsForHit({ damage: 5, location: "head" });
    expect(headPoints).toBeGreaterThan(torsoPoints);
    const first = applyScoreEvent(initial, { type: "hit", damage: 5, location: "head", critical: true });
    const second = applyScoreEvent(first, { type: "hit", damage: 5, location: "torso" });
    expect(initial.total).toBe(0);
    expect(first.combo).toBe(1);
    expect(second.combo).toBe(2);
    expect(second.bestCombo).toBe(2);
    expect(second.criticalHits).toBe(1);
    expect(second.total).toBeGreaterThan(first.total);
  });

  it("expires a short combo and scores a round-scaled defeat", () => {
    const hit = applyScoreEvent(createScoreState(), { type: "hit", damage: 1, location: "torso" });
    const expired = tickScore(hit, 2.21);
    expect(expired.combo).toBe(0);
    expect(expired.comboTimer).toBe(0);
    const defeat = applyScoreEvent(expired, { type: "defeat", round: 5, enemyMultiplier: 1.4 });
    expect(defeat.defeats).toBe(1);
    expect(defeat.total).toBeGreaterThan(100);
  });

  it("keeps the formal score breakdown and diminishing same-move returns", () => {
    let state = createScoreState();
    state = applyScoreEvent(state, { type: "hit", damage: 1, location: "heart", heartConfirmed: true, moveId: "attack-01" });
    expect(state.total).toBe(350); // 300 heart + 50 first-use bonus
    expect(state.heartHits).toBe(1);
    state = applyScoreEvent(state, { type: "hit", damage: 1, location: "heart", heartConfirmed: true, moveId: "attack-01" });
    expect(state.total).toBeGreaterThan(350);
    expect(state.total - 350).toBeLessThan(300); // repeated move is diminished
    state = applyScoreEvent(state, { type: "hit", damage: 1, location: "head", moveId: "attack-02" });
    expect(state.headHits).toBe(1);
    expect(state.uniqueMoves).toBe(2);
    state = applyScoreEvent(state, { type: "guard", just: true });
    state = applyScoreEvent(state, { type: "clash" });
    expect(state.justGuards).toBe(1);
    expect(state.clashes).toBe(1);
    const positive = state.total;
    state = applyScoreEvent(state, { type: "damage-taken", amount: 2 });
    state = applyScoreEvent(state, { type: "dignity-loss", amount: 3 });
    state = applyScoreEvent(state, { type: "poop-transform" });
    expect(state.damageTaken).toBe(2);
    expect(state.dignityLost).toBe(3);
    expect(state.poopTransformations).toBe(1);
    expect(state.total).toBe(positive - 20 - 30 - 250);
    state = applyScoreEvent(state, { type: "miss" });
    expect(state.misses).toBe(1);
  });

  it("records player dignity loss only through its dedicated event", () => {
    const hit = applyScoreEvent(createScoreState(), { type: "hit", damage: 4, location: "head" });
    expect(hit.dignityLost).toBe(0);
    const playerLoss = applyScoreEvent(hit, { type: "dignity-loss", amount: 7 });
    expect(playerLoss.dignityLost).toBe(7);
  });

  it("awards up to 1500 for each short round and records total elapsed separately", () => {
    const fast = applyScoreEvent(createScoreState(), { type: "defeat" });
    expect(fast.total).toBe(2500); // 1000 defeat + 1500 immediate-round bonus
    expect(fast.roundElapsed).toBe(0);
    const late = applyScoreEvent(tickScore(createScoreState(), 60), { type: "defeat" });
    expect(late.total).toBe(1000);
    expect(late.elapsed).toBe(60);
    const cleared = applyScoreEvent(late, { type: "clear" });
    expect(cleared.total).toBe(late.total);
    expect(cleared.cleared).toBe(true);
  });
});

describe("short input queue", () => {
  it("keeps order, drops the oldest entry at capacity, and expires entries", () => {
    const queue = new ShortInputQueue<"light" | "heavy" | "guard">({ capacity: 2, windowSeconds: 0.5 });
    expect(queue.push("light")).toBe(true);
    expect(queue.push("heavy")).toBe(true);
    expect(queue.push("guard")).toBe(true);
    expect(queue.snapshot().map((entry) => entry.action)).toEqual(["heavy", "guard"]);
    expect(queue.peek()).toBe("heavy");
    expect(queue.consume("heavy")).toBe("heavy");
    expect(queue.peek()).toBe("guard");
    expect(queue.advance(0.51)).toBe(1);
    expect(queue.isEmpty).toBe(true);
  });

  it("can coalesce a held action without losing its place", () => {
    const queue = new ShortInputQueue<"light" | "heavy">({ capacity: 3, windowSeconds: 0.5, coalesce: true });
    queue.push("light", 0.2);
    queue.push("heavy");
    queue.push("light", 0.7);
    expect(queue.size).toBe(2);
    expect(queue.snapshot().map((entry) => entry.action)).toEqual(["light", "heavy"]);
    expect(queue.snapshot()[0]?.remainingSeconds).toBeCloseTo(0.7);
  });
});

describe("audited forty-attack catalog", () => {
  it("keeps twenty punches and twenty kicks with measured timing data", () => {
    expect(PUNCH_ANIMATIONS).toHaveLength(20);
    expect(KICK_ANIMATIONS).toHaveLength(20);
    expect(ATTACK_ANIMATION_NAMES).toHaveLength(40);
    expect(ATTACK_CATALOG).toHaveLength(40);
    expect(ATTACK_CATALOG.every((move) => move.duration > 0 && move.hitStart < move.hitEnd)).toBe(true);
    expect(ATTACK_BY_NAME.get("Punch_01_Jab")?.family).toBe("punch");
    expect(ATTACK_BY_NAME.get("Kick_20_Burst")?.family).toBe("kick");
  });

  it("selects an audited move using target and combat context", () => {
    const context = {
      kind: "light" as const,
      stage: 1,
      directionX: 0,
      directionY: 0,
      afterDodge: false,
      afterJustGuard: false,
      afterClash: false,
      distance: 2,
      target: "heart" as const,
      targetStaggered: true,
      rageReady: false,
      sequence: 2,
    };
    const selected = selectAttackMove(context);
    expect(ATTACK_BY_NAME.get(selected.name as (typeof ATTACK_ANIMATION_NAMES)[number])).toBe(selected);
    expect(selected.healthMultiplier.heart).toBeGreaterThan(1);
    expect(selected.dignityMultiplier.heart).toBeLessThan(selected.dignityMultiplier.head);
    expect(Object.keys(ENEMY_ATTACK_SETS)).toEqual(["gorilla", "crocodile", "lion", "bear", "hippopotamus", "rhinoceros"]);
  });

  it("makes all forty attacks reachable through live selection contexts", () => {
    const selected = new Set<string>();
    for (const kind of ["light", "heavy"] as const) {
      for (let sequence = 0; sequence < 20; sequence += 1) {
        selected.add(selectAttackMove({
          kind,
          stage: 0,
          directionX: 0,
          directionY: 0,
          afterDodge: false,
          afterJustGuard: false,
          afterClash: false,
          distance: 2,
          target: "torso",
          targetStaggered: false,
          rageReady: false,
          sequence,
        }).name);
      }
    }
    expect(selected).toEqual(new Set(ATTACK_ANIMATION_NAMES));
  });
});
