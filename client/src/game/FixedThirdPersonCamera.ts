export const FIXED_THIRD_PERSON_RADIUS = 10.5;
export const FIXED_THIRD_PERSON_BETA = 1.05;

export function fixedThirdPersonRig(playerYaw: number) {
  return {
    alpha: -playerYaw - Math.PI / 2,
    beta: FIXED_THIRD_PERSON_BETA,
    radius: FIXED_THIRD_PERSON_RADIUS,
  };
}
