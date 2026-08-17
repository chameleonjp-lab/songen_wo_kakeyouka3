export function advanceRoundSpawn(activeEnemyCount: number, spawnClock: number, delta: number) {
  if (activeEnemyCount > 0) return { spawnClock, shouldSpawn: false };
  const nextSpawnClock = spawnClock - delta;
  return { spawnClock: nextSpawnClock, shouldSpawn: nextSpawnClock <= 0 };
}
