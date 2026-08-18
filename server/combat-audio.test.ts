import { describe, expect, it } from "vitest";
import { CombatAudio } from "../client/src/game/CombatAudio";
import { createEntryRoarTelemetry, entryPanForSide } from "../client/src/game/EntryRoarTelemetry";

describe("CombatAudio", () => {
  it("is safe to trigger before a browser audio context exists", () => {
    const audio = new CombatAudio();
    expect(() => audio.play("hit")).not.toThrow();
    expect(() => audio.play("rage", 1.4)).not.toThrow();
    expect(() => audio.play("clash", 1.15)).not.toThrow();
  });

  it("preserves the entry event payload used by the GameWorld spawn path", () => {
    const variants = ["bear", "crocodile", "gorilla", "hippopotamus", "lion", "rhinoceros"] as const;
    const sides = ["left", "center", "right", "left", "center", "right"] as const;
    const events = variants.map((variant, index) => createEntryRoarTelemetry(variant, 1, entryPanForSide(sides[index]), true));
    expect(events).toHaveLength(6);
    expect(events.every((event) => event.count === 1 && event.reverb)).toBe(true);
    expect(events.map((event) => event.pan)).toEqual([-1, 0, 1, -1, 0, 1]);
  });

  it("supports every enemy entry roar without a browser audio context", () => {
    const audio = new CombatAudio();
    for (const variant of ["bear", "crocodile", "gorilla", "hippopotamus", "lion", "rhinoceros"] as const) {
      expect(() => audio.playEnemyEntry(variant, 1, -1)).not.toThrow();
      expect(audio.entryRoarCount(variant)).toBe(1);
      expect(audio.spatialRoarTrace(variant).pan).toBe(-1);
    }
    expect(() => audio.playEnemyEntry("lion", 1, 1)).not.toThrow();
    expect(audio.entryRoarCount("lion")).toBe(2);
    expect(audio.spatialRoarTrace("lion").pan).toBe(1);
  });
});
