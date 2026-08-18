import { describe, expect, it } from "vitest";
import { CombatAudio } from "./CombatAudio";

describe("CombatAudio", () => {
  it("is safe to trigger before a browser audio context exists", () => {
    const audio = new CombatAudio();
    expect(() => audio.play("hit")).not.toThrow();
    expect(() => audio.play("rage", 1.4)).not.toThrow();
  });
});
