export const LOCK_ORBIT_LIMIT = 0.78;
export const LOCK_BETA_MIN = 0.82;
export const LOCK_BETA_MAX = 1.14;

export function lockCameraRadius(fighterDistance: number, aspect: number) {
  const portraitFraming = aspect < 0.9;
  const radius = 8.8 + Math.max(0, fighterDistance) * (portraitFraming ? 0.42 : 0.28);
  return Math.max(9.2, Math.min(portraitFraming ? 18 : 14.5, radius));
}

export function applyLockCameraLook(orbitOffset: number, beta: number, lookX: number, lookY: number) {
  return {
    orbitOffset: Math.max(-LOCK_ORBIT_LIMIT, Math.min(LOCK_ORBIT_LIMIT, orbitOffset - lookX * 0.004)),
    beta: Math.max(LOCK_BETA_MIN, Math.min(LOCK_BETA_MAX, beta - lookY * 0.003)),
  };
}
