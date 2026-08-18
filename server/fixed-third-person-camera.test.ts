import { describe, expect, it } from "vitest";
import { FIXED_THIRD_PERSON_BETA, FIXED_THIRD_PERSON_RADIUS, fixedThirdPersonRig } from "../client/src/game/FixedThirdPersonCamera";

describe("fixed third-person camera", () => {
  it("keeps a constant elevated radius and beta behind the player yaw", () => {
    const rig = fixedThirdPersonRig(Math.PI / 2);
    expect(rig.alpha).toBeCloseTo(-Math.PI);
    expect(rig.beta).toBe(FIXED_THIRD_PERSON_BETA);
    expect(rig.radius).toBe(FIXED_THIRD_PERSON_RADIUS);
  });
});
