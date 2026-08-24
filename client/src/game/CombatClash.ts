export const ATTACK_CLASH_PROGRESS_MIN = 0.4;
export const ATTACK_CLASH_PROGRESS_MAX = 0.68;

export function isAttackClashWindow(progress: number) {
  return progress >= ATTACK_CLASH_PROGRESS_MIN && progress <= ATTACK_CLASH_PROGRESS_MAX;
}

export function entersAttackClashWindow(progress: number, lookAheadProgress = 0) {
  const start = Math.min(progress, progress + Math.max(0, lookAheadProgress));
  const end = Math.max(progress, progress + Math.max(0, lookAheadProgress));
  return end >= ATTACK_CLASH_PROGRESS_MIN && start <= ATTACK_CLASH_PROGRESS_MAX;
}

export function clampAttackClashPan(value: number) {
  return Math.max(-1, Math.min(1, value));
}
