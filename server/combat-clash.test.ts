import { describe, expect, it } from "vitest";
import { entersAttackClashWindow, isAttackClashWindow } from "@/game/CombatClash";

describe("attack clash", () => {
  it("accepts the impact overlap window and rejects recovery frames", () => {
    expect(isAttackClashWindow(0.4)).toBe(true);
    expect(isAttackClashWindow(0.54)).toBe(true);
    expect(isAttackClashWindow(0.68)).toBe(true);
    expect(isAttackClashWindow(0.39)).toBe(false);
    expect(isAttackClashWindow(0.69)).toBe(false);
  });

  it("detects a clash window crossed between two slow-frame samples", () => {
    expect(entersAttackClashWindow(0.36, 0.08)).toBe(true);
    expect(entersAttackClashWindow(0.69, 0.08)).toBe(false);
    expect(entersAttackClashWindow(0.2, 0.1)).toBe(false);
  });
});
