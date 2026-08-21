import { describe, expect, it } from "vitest";
import { lockCameraRadius } from "../client/src/game/CameraRig";
import { FIXED_THIRD_PERSON_BETA, FIXED_THIRD_PERSON_RADIUS, fixedThirdPersonRig } from "../client/src/game/FixedThirdPersonCamera";

describe("fixed third-person camera", () => {
  it("keeps a constant elevated radius and beta behind the player yaw", () => {
    const rig = fixedThirdPersonRig(Math.PI / 2);
    expect(rig.alpha).toBeCloseTo(-Math.PI);
    expect(rig.beta).toBe(FIXED_THIRD_PERSON_BETA);
    expect(rig.radius).toBe(FIXED_THIRD_PERSON_RADIUS);
  });

  it("widens the lock frame for a portrait viewport without exceeding the camera limit", () => {
    expect(lockCameraRadius(10, 0.55)).toBeCloseTo(13);
    expect(lockCameraRadius(30, 0.55)).toBe(18);
    expect(lockCameraRadius(30, 1.78)).toBe(14.5);
  });
});
