export const MAX_FRAME_DELTA_SECONDS = 0.25;
export const MAX_SIMULATION_STEP_SECONDS = 0.05;

/**
 * Preserve real time on a slow phone by splitting a frame into stable updates.
 * Only a long background/resume jump is capped; ordinary 5 fps frames keep the
 * full 0.2 seconds instead of silently losing half of their time.
 */
export function simulationSteps(
  deltaSeconds: number,
  maxFrameSeconds = MAX_FRAME_DELTA_SECONDS,
  maxStepSeconds = MAX_SIMULATION_STEP_SECONDS,
): number[] {
  const safeFrameLimit = Number.isFinite(maxFrameSeconds) ? Math.max(0, maxFrameSeconds) : 0;
  const safeStepLimit = Number.isFinite(maxStepSeconds) ? Math.max(0.001, maxStepSeconds) : MAX_SIMULATION_STEP_SECONDS;
  let remaining = Number.isFinite(deltaSeconds)
    ? Math.min(safeFrameLimit, Math.max(0, deltaSeconds))
    : 0;
  const steps: number[] = [];
  while (remaining > 0.000_001) {
    const step = Math.min(safeStepLimit, remaining);
    steps.push(step);
    remaining -= step;
  }
  return steps;
}

export function safeRun(task: () => void, onError?: (error: unknown) => void) {
  try {
    task();
    return true;
  } catch (error) {
    onError?.(error);
    return false;
  }
}

/**
 * Resolve a non-cancellable loader within a deadline. If it finishes after the
 * deadline, immediately dispose the late value so a timed-out GLB cannot leak
 * into the scene or revive an already-selected fallback presentation.
 */
export function settleWithin<T>(
  task: Promise<T>,
  timeoutMs: number,
  onLateValue: (value: T) => void,
  label = "operation",
): Promise<T> {
  const safeTimeout = Number.isFinite(timeoutMs) ? Math.max(1, timeoutMs) : 1;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${safeTimeout}ms`));
    }, safeTimeout);

    void task.then(
      (value) => {
        if (settled) {
          safeRun(() => onLateValue(value));
          return;
        }
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

