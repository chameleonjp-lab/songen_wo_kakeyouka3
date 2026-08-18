import { describe, expect, it, vi } from "vitest";
import { nextPreloadKey, retainOnlyPrepared } from "../client/src/game/CharacterPreloadPlan";

describe("character preload plan", () => {
  it("selects the next challenger using the post-spawn roster cursor", () => {
    const roster = ["bear", "crocodile", "gorilla"] as const;
    expect(nextPreloadKey(roster, 1)).toBe("crocodile");
    expect(nextPreloadKey(roster, 3)).toBe("bear");
    expect(nextPreloadKey([], 0)).toBeNull();
  });

  it("retains only the upcoming model template and disposes obsolete templates", () => {
    const cache = new Map([["bear", { id: "bear" }], ["crocodile", { id: "crocodile" }]]);
    const dispose = vi.fn();
    retainOnlyPrepared(cache, "crocodile", dispose);
    expect([...cache.keys()]).toEqual(["crocodile"]);
    expect(dispose).toHaveBeenCalledWith({ id: "bear" });
  });
});
