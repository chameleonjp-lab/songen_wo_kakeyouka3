export function nextPreloadKey<T>(keys: readonly T[], cursor: number) {
  if (keys.length === 0) return null;
  return keys[cursor % keys.length] ?? null;
}

export function retainOnlyPrepared<T, TValue>(cache: Map<T, TValue>, keep: T, dispose: (value: TValue) => void) {
  for (const [key, value] of Array.from(cache.entries())) {
    if (key === keep) continue;
    dispose(value);
    cache.delete(key);
  }
}
