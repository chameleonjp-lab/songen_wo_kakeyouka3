import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_FRAME_DELTA_SECONDS,
  MAX_SIMULATION_STEP_SECONDS,
  safeRun,
  settleWithin,
  simulationSteps,
} from "../client/src/game/RuntimeResilience";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runtime resilience", () => {
  it("preserves a complete 5 fps frame as stable simulation steps", () => {
    const steps = simulationSteps(0.2);
    expect(steps.reduce((total, step) => total + step, 0)).toBeCloseTo(0.2);
    expect(steps.every((step) => step <= MAX_SIMULATION_STEP_SECONDS)).toBe(true);
    expect(steps).toHaveLength(4);
  });

  it("caps a long background-resume jump without dropping ordinary slow frames", () => {
    const steps = simulationSteps(2);
    expect(steps.reduce((total, step) => total + step, 0)).toBeCloseTo(MAX_FRAME_DELTA_SECONDS);
    expect(simulationSteps(Number.NaN)).toEqual([]);
    expect(simulationSteps(-1)).toEqual([]);
  });

  it("reports best-effort cleanup failures without throwing", () => {
    const onError = vi.fn();
    expect(safeRun(() => { throw new Error("dispose failed"); }, onError)).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(safeRun(() => undefined)).toBe(true);
  });

  it("resolves a loader that completes before its deadline", async () => {
    await expect(settleWithin(Promise.resolve("ready"), 100, vi.fn(), "fighter")).resolves.toBe("ready");
  });

  it("times out a stalled loader and disposes its eventual late value", async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const loader = new Promise<string>((resolve) => { finish = resolve; });
    const disposeLate = vi.fn();
    const pending = settleWithin(loader, 100, disposeLate, "fighter");

    const rejected = expect(pending).rejects.toThrow("fighter timed out after 100ms");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    finish("late visual");
    await Promise.resolve();
    expect(disposeLate).toHaveBeenCalledWith("late visual");
  });

  it("does not let a late rejection replace the original timeout", async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const loader = new Promise<string>((_resolve, reject) => { fail = reject; });
    const pending = settleWithin(loader, 20, vi.fn(), "asset");
    const rejected = expect(pending).rejects.toThrow("asset timed out after 20ms");
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    fail(new Error("late network failure"));
    await Promise.resolve();
  });
});
