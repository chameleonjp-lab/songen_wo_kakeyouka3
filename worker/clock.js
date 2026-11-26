const TICKS_PER_SECOND = 60;
const MAX_CATCH_UP = 5;

export function createMatchClock({ nowMs, onTick, onLag = () => {} }) {
  let tick = 0;
  let activeSince = null;
  let previousActiveMs = 0;

  return {
    start(at = nowMs()) {
      tick = 0;
      previousActiveMs = 0;
      activeSince = at;
    },
    pause(at = nowMs()) {
      if (activeSince === null) return;
      previousActiveMs += Math.max(0, at - activeSince);
      activeSince = null;
    },
    resume(at = nowMs()) {
      activeSince ??= at;
    },
    stop() {
      activeSince = null;
    },
    update(at = nowMs()) {
      if (activeSince === null) return 0;
      const activeMs = previousActiveMs + Math.max(0, at - activeSince);
      const due = Math.floor(activeMs * TICKS_PER_SECOND / 1000);
      let processed = 0;
      while (tick < due && processed < MAX_CATCH_UP && activeSince !== null) {
        processed += 1;
        onTick(++tick);
      }
      if (activeSince !== null && tick < due) onLag(due - tick);
      return processed;
    },
  };
}
