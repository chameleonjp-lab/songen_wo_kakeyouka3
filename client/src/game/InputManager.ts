// Semantic input layer shared by keyboard, mouse and multi-touch controls.
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { runtimeFlags } from "@/game/RuntimeFlags";

export type ArenaAction = "light" | "heavy" | "dodge" | "guard" | "rage" | "aim" | "pause" | "restart";
export type AttackInputAction = Extract<ArenaAction, "light" | "heavy">;
export type TimedArenaAction = Readonly<{ action: ArenaAction; at: number }>;

const INPUT_QUEUE_CAPACITY = 8;
const INPUT_QUEUE_WINDOW_MS = 620;

type TouchDirection = "up" | "down" | "left" | "right";
type ActivePointer = { id: number; button: number; moved: boolean; distance: number };

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly held = new Set<ArenaAction>();
  private readonly queue: TimedArenaAction[] = [];
  private readonly touchDirections = new Set<TouchDirection>();
  private activePointer: ActivePointer | null = null;
  private lookDelta = new Vector2(0, 0);
  private demoClock = 0;
  private demoAttackClock = 0;
  private demoComboStep = 0;
  readonly isDemo: boolean;

  private readonly demoCombo: Array<{ action: ArenaAction; delay: number }> = [
    { action: "light", delay: 0.24 },
    { action: "light", delay: 0.28 },
    { action: "heavy", delay: 0.28 },
    { action: "light", delay: 1.02 },
    { action: "heavy", delay: 0.28 },
    { action: "light", delay: 1.02 },
  ];

  private now() {
    return typeof performance === "undefined" ? Date.now() : performance.now();
  }

  private enqueue(action: ArenaAction) {
    const at = this.now();
    this.prune(at);
    if (["pause", "restart", "rage", "aim"].includes(action) && this.queue.some((entry) => entry.action === action)) return;
    this.queue.push({ action, at });
    while (this.queue.length > INPUT_QUEUE_CAPACITY) this.queue.shift();
  }

  private prune(now = this.now()) {
    while (this.queue[0] && now - this.queue[0].at > INPUT_QUEUE_WINDOW_MS) this.queue.shift();
  }

  private readonly keyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "j", "k", "l", "f", "q", "tab", " ", "escape", "r"].includes(key)) event.preventDefault();
    this.keys.add(key);
    if (key === "l") this.held.add("guard");
    if (event.repeat) return;
    if (key === "j" || key === "1") this.enqueue("light");
    if (key === "k" || key === "2") this.enqueue("heavy");
    if (key === " ") this.enqueue("dodge");
    if (key === "l") this.enqueue("guard");
    if (key === "f") this.enqueue("rage");
    if (key === "q" || key === "tab") this.enqueue("aim");
    if (key === "escape") this.enqueue("pause");
    if (key === "r") this.enqueue("restart");
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    this.keys.delete(key);
    if (key === "l") this.held.delete("guard");
  };

  private readonly pointerDownHandler = (event: PointerEvent) => {
    this.activePointer = {
      id: Number.isFinite(event.pointerId) ? event.pointerId : 0,
      button: Number.isFinite(event.button) ? event.button : 0,
      moved: false,
      distance: 0,
    };
    (event.currentTarget as HTMLCanvasElement).focus?.();
    (event.currentTarget as HTMLCanvasElement).setPointerCapture?.(event.pointerId);
  };

  private readonly pointerUpHandler = (event: PointerEvent) => {
    const pointer = this.activePointer;
    if (!pointer || (Number.isFinite(event.pointerId) && event.pointerId !== pointer.id)) return;
    if (!pointer.moved && pointer.button === 0) this.enqueue("light");
    if (!pointer.moved && pointer.button === 2) this.enqueue("heavy");
    this.activePointer = null;
  };

  private readonly pointerCancelHandler = () => {
    this.activePointer = null;
  };

  private readonly pointerMoveHandler = (event: PointerEvent) => {
    if (!this.activePointer) return;
    const dx = Number(event.movementX ?? 0);
    const dy = Number(event.movementY ?? 0);
    this.activePointer.distance += Math.abs(dx) + Math.abs(dy);
    if (this.activePointer.distance > 4) this.activePointer.moved = true;
    this.lookDelta.x += dx;
    this.lookDelta.y += dy;
  };

  private readonly contextMenuHandler = (event: Event) => event.preventDefault();

  private readonly touchActionHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ action?: ArenaAction; active?: boolean }>).detail;
    if (!detail?.action) return;
    const active = detail.active !== false;
    if (detail.action === "guard") {
      if (active) this.held.add("guard");
      else this.held.delete("guard");
    }
    if (active) this.enqueue(detail.action);
  };

  private readonly touchMoveHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ direction?: TouchDirection; active?: boolean }>).detail;
    if (!detail?.direction) return;
    if (detail.active) this.touchDirections.add(detail.direction);
    else this.touchDirections.delete(detail.direction);
  };

  private readonly mouseLookAuditHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ dx?: number; dy?: number }>).detail;
    const dx = Number(detail?.dx ?? 0);
    const dy = Number(detail?.dy ?? 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.lookDelta.x += Math.max(-240, Math.min(240, dx));
    this.lookDelta.y += Math.max(-240, Math.min(240, dy));
  };

  private readonly touchLookHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ dx?: number; dy?: number }>).detail;
    const dx = Number(detail?.dx ?? 0);
    const dy = Number(detail?.dy ?? 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.lookDelta.x += Math.max(-48, Math.min(48, dx));
    this.lookDelta.y += Math.max(-48, Math.min(48, dy));
  };

  private readonly resetHandler = () => this.resetHeldInput();

  private readonly visibilityHandler = () => {
    if (typeof document !== "undefined" && document.hidden) {
      this.resetHeldInput();
      window.dispatchEvent(new CustomEvent("arena-auto-pause"));
    }
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.isDemo = runtimeFlags.demo;
    if (this.isDemo) this.demoAttackClock = 0.23;
    window.addEventListener("keydown", this.keyDown, { passive: false });
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.resetHandler);
    window.addEventListener("orientationchange", this.resetHandler);
    window.addEventListener("arena-touch-action", this.touchActionHandler);
    window.addEventListener("arena-touch-move", this.touchMoveHandler);
    window.addEventListener("arena-touch-look", this.touchLookHandler);
    window.addEventListener("arena-mouse-look-audit", this.mouseLookAuditHandler);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibilityHandler);
    canvas.addEventListener("pointerdown", this.pointerDownHandler);
    canvas.addEventListener("pointerup", this.pointerUpHandler);
    canvas.addEventListener("pointercancel", this.pointerCancelHandler);
    canvas.addEventListener("pointerleave", this.pointerCancelHandler);
    canvas.addEventListener("lostpointercapture", this.pointerCancelHandler);
    canvas.addEventListener("pointermove", this.pointerMoveHandler);
    canvas.addEventListener("contextmenu", this.contextMenuHandler);
  }

  update(delta: number) {
    this.prune();
    if (!this.isDemo) return;
    this.demoClock += delta;
    this.demoAttackClock += delta;
    const nextAttack = this.demoCombo[this.demoComboStep];
    if (this.demoAttackClock > nextAttack.delay) {
      this.enqueue(nextAttack.action);
      this.demoComboStep = (this.demoComboStep + 1) % this.demoCombo.length;
      this.demoAttackClock = 0;
    }
    if (Math.floor(this.demoClock * 0.37) % 12 === 7 && Math.sin(this.demoClock * 4) > 0.98) this.enqueue("dodge");
  }

  movement() {
    if (this.isDemo) return new Vector2(Math.sin(this.demoClock * 0.72) * 0.55, Math.cos(this.demoClock * 0.5) * 0.7);
    const horizontal = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0) + (this.touchDirections.has("right") ? 1 : 0) - (this.touchDirections.has("left") ? 1 : 0);
    const vertical = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0) + (this.touchDirections.has("up") ? 1 : 0) - (this.touchDirections.has("down") ? 1 : 0);
    return new Vector2(Math.max(-1, Math.min(1, horizontal)), Math.max(-1, Math.min(1, vertical)));
  }

  consume(action: ArenaAction) {
    this.prune();
    const index = this.queue.findIndex((entry) => entry.action === action);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    return true;
  }

  /**
   * Combat chains must preserve the order in which weak/strong taps arrived.
   * Non-attack actions remain independently consumable for defensive cancels.
   */
  peekAttack() {
    this.prune();
    return this.queue.find((entry) => entry.action === "light" || entry.action === "heavy")?.action as AttackInputAction | undefined;
  }

  consumeAttack(action: AttackInputAction) {
    this.prune();
    const index = this.queue.findIndex((entry) => entry.action === "light" || entry.action === "heavy");
    if (index < 0 || this.queue[index]?.action !== action) return false;
    this.queue.splice(index, 1);
    return true;
  }

  isHeld(action: ArenaAction) {
    return this.held.has(action);
  }

  queuedActions() {
    this.prune();
    return [...this.queue];
  }

  consumeLook() {
    const look = this.lookDelta.clone();
    this.lookDelta.set(0, 0);
    return look;
  }

  resetHeldInput() {
    this.keys.clear();
    this.held.clear();
    this.touchDirections.clear();
    this.activePointer = null;
    this.lookDelta.set(0, 0);
  }

  dispose() {
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.resetHandler);
    window.removeEventListener("orientationchange", this.resetHandler);
    window.removeEventListener("arena-touch-action", this.touchActionHandler);
    window.removeEventListener("arena-touch-move", this.touchMoveHandler);
    window.removeEventListener("arena-touch-look", this.touchLookHandler);
    window.removeEventListener("arena-mouse-look-audit", this.mouseLookAuditHandler);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.canvas.removeEventListener("pointerdown", this.pointerDownHandler);
    this.canvas.removeEventListener("pointerup", this.pointerUpHandler);
    this.canvas.removeEventListener("pointercancel", this.pointerCancelHandler);
    this.canvas.removeEventListener("pointerleave", this.pointerCancelHandler);
    this.canvas.removeEventListener("lostpointercapture", this.pointerCancelHandler);
    this.canvas.removeEventListener("pointermove", this.pointerMoveHandler);
    this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
  }
}

export const inputQueueSettings = { capacity: INPUT_QUEUE_CAPACITY, windowMs: INPUT_QUEUE_WINDOW_MS } as const;
