export const LOCK_ORBIT_LIMIT = 0.78;
export const LOCK_BETA_MIN = 0.82;
export const LOCK_BETA_MAX = 1.14;

export function applyLockCameraLook(orbitOffset: number, beta: number, lookX: number, lookY: number) {
  return {
    orbitOffset: Math.max(-LOCK_ORBIT_LIMIT, Math.min(LOCK_ORBIT_LIMIT, orbitOffset - lookX * 0.004)),
    beta: Math.max(LOCK_BETA_MIN, Math.min(LOCK_BETA_MAX, beta - lookY * 0.003)),
  };
}
