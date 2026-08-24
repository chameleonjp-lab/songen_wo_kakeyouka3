import { describe, expect, it } from "vitest";
import { selectFrameDeltaSeconds } from "../client/src/game/scene";
import { MAX_FRAME_DELTA_SECONDS } from "../client/src/game/RuntimeResilience";

describe("render frame delta selection", () => {
  it("uses Babylon's ordinary positive delta", () => {
    expect(selectFrameDeltaSeconds(16.67, 0.016)).toBeCloseTo(0.01667);
  });

  it("falls back to monotonic elapsed time when Safari reports zero", () => {
    expect(selectFrameDeltaSeconds(0, 0.2)).toBeCloseTo(0.2);
  });

  it("preserves a 5 fps frame and caps only long resume jumps", () => {
    expect(selectFrameDeltaSeconds(200, 0.2)).toBeCloseTo(0.2);
    expect(selectFrameDeltaSeconds(16.67, 0.2)).toBeCloseTo(0.2);
    expect(selectFrameDeltaSeconds(4_000, 4)).toBe(MAX_FRAME_DELTA_SECONDS);
  });

  it("rejects invalid and negative clock input", () => {
    expect(selectFrameDeltaSeconds(Number.NaN, Number.NaN)).toBe(0);
    expect(selectFrameDeltaSeconds(-1, -1)).toBe(0);
  });
});
