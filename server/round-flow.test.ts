import { describe, expect, it } from "vitest";
import { advanceRoundSpawn } from "../client/src/game/RoundFlow";

describe("round spawn flow", () => {
  it("does not spawn a challenger during the 1.8-second post-defeat intermission", () => {
    const firstFrameAfterDefeat = advanceRoundSpawn(0, 1.8, 1 / 30);
    expect(firstFrameAfterDefeat.shouldSpawn).toBe(false);
    expect(firstFrameAfterDefeat.spawnClock).toBeCloseTo(1.8 - 1 / 30);
  });

  it("spawns only after the intermission expires and does not duplicate an active challenger", () => {
    expect(advanceRoundSpawn(0, 0.02, 1 / 30).shouldSpawn).toBe(true);
    expect(advanceRoundSpawn(1, 0, 1 / 30)).toEqual({ spawnClock: 0, shouldSpawn: false });
  });

  it("keeps the arena clear for the full three-second opening countdown", () => {
    expect(advanceRoundSpawn(0, 3, 2.99).shouldSpawn).toBe(false);
    expect(advanceRoundSpawn(0, 0.02, 1 / 30).shouldSpawn).toBe(true);
  });
});
