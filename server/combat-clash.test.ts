import { describe, expect, it } from "vitest";
import { isAttackClashWindow } from "@/game/CombatClash";

describe("attack clash", () => {
  it("accepts the impact overlap window and rejects recovery frames", () => {
    expect(isAttackClashWindow(0.4)).toBe(true);
    expect(isAttackClashWindow(0.54)).toBe(true);
    expect(isAttackClashWindow(0.68)).toBe(true);
    expect(isAttackClashWindow(0.39)).toBe(false);
    expect(isAttackClashWindow(0.69)).toBe(false);
  });
});
