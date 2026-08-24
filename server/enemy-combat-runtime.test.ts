import { describe, expect, it } from "vitest";
import {
  appliedDamage,
  crocodileGuardBreaks,
  crocodileGuardsHit,
  enemyAttackContinuesThroughHit,
  enemyEngageDistance,
  enemyHitRange,
} from "../client/src/game/EnemyCombat";
import { ENEMY_ROSTER_ORDER } from "../client/src/game/EnemyRoster";

describe("live enemy combat contracts", () => {
  it("keeps every formal enemy's engagement point reachable by its hit rule", () => {
    for (const variant of ENEMY_ROSTER_ORDER) {
      expect(enemyEngageDistance(variant), variant).toBeLessThanOrEqual(enemyHitRange(variant));
    }
  });

  it("gives all six formal enemies explicit positive live ranges", () => {
    expect(ENEMY_ROSTER_ORDER).toHaveLength(6);
    expect(ENEMY_ROSTER_ORDER.map(enemyEngageDistance).every((range) => range > 0)).toBe(true);
    expect(new Set(ENEMY_ROSTER_ORDER.map(enemyHitRange)).size).toBeGreaterThan(1);
  });

  it("lets the bear continue only a weak active attack after being hit", () => {
    expect(enemyAttackContinuesThroughHit("bear", "strike", { power: "light" })).toBe(true);
    expect(enemyAttackContinuesThroughHit("bear", "strike", { power: "heavy" })).toBe(false);
    expect(enemyAttackContinuesThroughHit("bear", "approach", { power: "light" })).toBe(false);
    expect(enemyAttackContinuesThroughHit("lion", "strike", { power: "light" })).toBe(false);
  });

  it("guards a crocodile's front only during active guarded phases", () => {
    expect(crocodileGuardsHit("crocodile", "approach", true, false)).toBe(true);
    expect(crocodileGuardsHit("crocodile", "strike", false, false)).toBe(false);
    expect(crocodileGuardsHit("crocodile", "recover", true, false)).toBe(false);
    expect(crocodileGuardsHit("crocodile", "strike", true, true)).toBe(false);
    expect(crocodileGuardsHit("gorilla", "strike", true, false)).toBe(false);
  });

  it("breaks crocodile guard with heavy or confirmed-heart attacks", () => {
    expect(crocodileGuardBreaks({ power: "heavy" }, false)).toBe(true);
    expect(crocodileGuardBreaks({ power: "light" }, true)).toBe(true);
    expect(crocodileGuardBreaks({ power: "light" }, false)).toBe(false);
  });

  it("records only damage that can actually be taken", () => {
    expect(appliedDamage(4, 99)).toBe(4);
    expect(appliedDamage(100, 12.5)).toBe(12.5);
    expect(appliedDamage(-1, 5)).toBe(0);
    expect(appliedDamage(10, Number.NaN)).toBe(0);
  });
});
