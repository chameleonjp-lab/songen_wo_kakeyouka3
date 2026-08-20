// Framework-free short input queue. The DOM InputManager can push semantic
// actions here, while the combat state machine consumes them at a safe frame.

export type CombatInputAction = "light" | "heavy" | "guard" | "dodge" | "rage" | "pause" | "restart";

export type InputBufferOptions = Readonly<{
  capacity?: number;
  windowSeconds?: number;
  /** When true, a repeated action refreshes its existing entry instead of adding another one. */
  coalesce?: boolean;
}>;

export type BufferedInput<Action extends string> = Readonly<{
  action: Action;
  remainingSeconds: number;
  sequence: number;
}>;

export const DEFAULT_INPUT_BUFFER_OPTIONS = Object.freeze({
  capacity: 3,
  windowSeconds: 0.48,
  coalesce: false,
});

const safeDelta = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

export class ShortInputQueue<Action extends string = CombatInputAction> {
  private readonly entries: Array<BufferedInput<Action>> = [];
  private readonly capacity: number;
  private readonly windowSeconds: number;
  private readonly coalesce: boolean;
  private sequence = 0;

  constructor(options: InputBufferOptions = {}) {
    const capacity = options.capacity ?? DEFAULT_INPUT_BUFFER_OPTIONS.capacity;
    const windowSeconds = options.windowSeconds ?? DEFAULT_INPUT_BUFFER_OPTIONS.windowSeconds;
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Input buffer capacity must be a positive integer");
    if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new Error("Input buffer window must be greater than zero");
    this.capacity = capacity;
    this.windowSeconds = windowSeconds;
    this.coalesce = options.coalesce ?? DEFAULT_INPUT_BUFFER_OPTIONS.coalesce;
  }

  get size() {
    return this.entries.length;
  }

  get isEmpty() {
    return this.entries.length === 0;
  }

  push(action: Action, lifetimeSeconds = this.windowSeconds): boolean {
    return this.enqueue(action, lifetimeSeconds);
  }

  enqueue(action: Action, lifetimeSeconds = this.windowSeconds): boolean {
    if (typeof action !== "string" || action.length === 0) return false;
    if (!Number.isFinite(lifetimeSeconds) || lifetimeSeconds <= 0) return false;
    if (this.coalesce) {
      const index = this.entries.findIndex((entry) => entry.action === action);
      if (index >= 0) {
        this.entries[index] = Object.freeze({ ...this.entries[index], remainingSeconds: lifetimeSeconds });
        return true;
      }
    }
    if (this.entries.length >= this.capacity) this.entries.shift();
    this.entries.push(Object.freeze({ action, remainingSeconds: lifetimeSeconds, sequence: this.sequence++ }));
    return true;
  }

  /** Expire old actions; returns the number removed. */
  advance(deltaSeconds: number): number {
    const delta = safeDelta(deltaSeconds);
    if (delta > 0) {
      for (let index = 0; index < this.entries.length; index += 1) {
        const entry = this.entries[index];
        this.entries[index] = Object.freeze({ ...entry, remainingSeconds: entry.remainingSeconds - delta });
      }
    }
    const before = this.entries.length;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index].remainingSeconds <= 0) this.entries.splice(index, 1);
    }
    return before - this.entries.length;
  }

  peek(): Action | null {
    return this.entries[0]?.action ?? null;
  }

  /** Consume the oldest action, or the oldest matching action when specified. */
  consume(action?: Action): Action | null {
    const index = action === undefined ? 0 : this.entries.findIndex((entry) => entry.action === action);
    if (index < 0) return null;
    return this.entries.splice(index, 1)[0]?.action ?? null;
  }

  has(action: Action): boolean {
    return this.entries.some((entry) => entry.action === action);
  }

  snapshot(): readonly BufferedInput<Action>[] {
    return Object.freeze(this.entries.slice());
  }

  clear() {
    this.entries.length = 0;
  }
}

/** Alias for integrations that use the shorter name. */
export class InputBuffer<Action extends string = CombatInputAction> extends ShortInputQueue<Action> {}

