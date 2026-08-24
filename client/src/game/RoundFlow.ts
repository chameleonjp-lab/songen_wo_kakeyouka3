export function advanceRoundSpawn(
  activeEnemyCount: number,
  spawnClock: number,
  delta: number,
  transitionStartedThisStep = false,
) {
  if (activeEnemyCount > 0 || transitionStartedThisStep) return { spawnClock, shouldSpawn: false };
  const nextSpawnClock = spawnClock - delta;
  return { spawnClock: nextSpawnClock, shouldSpawn: nextSpawnClock <= 0 };
}
