// Bronze & Blood Arena interaction layer — semantic actions keep gameplay independent from raw keyboard and pointer events.
import { Vector2 } from "@babylonjs/core/Maths/math.vector";

export type ArenaAction = "light" | "heavy" | "dodge" | "guard" | "rage" | "pause" | "restart";

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<ArenaAction>();
  private readonly touchDirections = new Set<"up" | "down" | "left" | "right">();
  private pointerDown = false;
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

  private readonly keyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "j", "k", "l", "f", " ", "escape", "r"].includes(key)) {
      event.preventDefault();
    }
    this.keys.add(key);
    if (event.repeat) return;
    if (key === "j" || key === "1") this.pressed.add("light");
    if (key === "k" || key === "2") this.pressed.add("heavy");
    if (key === " ") this.pressed.add("dodge");
    if (key === "l") this.pressed.add("guard");
    if (key === "f") this.pressed.add("rage");
    if (key === "escape") this.pressed.add("pause");
    if (key === "r") this.pressed.add("restart");
  };

  private readonly keyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());

  private readonly pointerDownHandler = (event: PointerEvent) => {
    this.pointerDown = true;
    (event.currentTarget as HTMLCanvasElement).focus();
    if (event.button === 0) this.pressed.add("light");
    if (event.button === 2) this.pressed.add("heavy");
  };

  private readonly pointerUpHandler = () => {
    this.pointerDown = false;
  };

  private readonly pointerMoveHandler = (event: PointerEvent) => {
    if (!this.pointerDown) return;
    this.lookDelta.x += event.movementX;
    this.lookDelta.y += event.movementY;
  };

  private readonly contextMenuHandler = (event: Event) => event.preventDefault();

  private readonly touchActionHandler = (event: Event) => {
    const action = (event as CustomEvent<{ action?: ArenaAction }>).detail?.action;
    if (action) this.pressed.add(action);
  };

  private readonly touchMoveHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ direction?: "up" | "down" | "left" | "right"; active?: boolean }>).detail;
    if (!detail.direction) return;
    if (detail.active) this.touchDirections.add(detail.direction);
    else this.touchDirections.delete(detail.direction);
  };

  private readonly mouseLookAuditHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ dx?: number; dy?: number }>).detail;
    const dx = Number(detail.dx ?? 0);
    const dy = Number(detail.dy ?? 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.lookDelta.x += Math.max(-240, Math.min(240, dx));
    this.lookDelta.y += Math.max(-240, Math.min(240, dy));
    console.info(`[MouseLookAudit] pointer path dx=${dx} dy=${dy}`);
  };

  private readonly touchLookHandler = (event: Event) => {
    const detail = (event as CustomEvent<{ dx?: number; dy?: number }>).detail;
    const dx = Number(detail.dx ?? 0);
    const dy = Number(detail.dy ?? 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.lookDelta.x += Math.max(-48, Math.min(48, dx));
    this.lookDelta.y += Math.max(-48, Math.min(48, dy));
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.isDemo = new URLSearchParams(window.location.search).has("demo");
    if (this.isDemo) this.demoAttackClock = 0.23;
    window.addEventListener("keydown", this.keyDown, { passive: false });
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("arena-touch-action", this.touchActionHandler);
    window.addEventListener("arena-touch-move", this.touchMoveHandler);
    window.addEventListener("arena-touch-look", this.touchLookHandler);
    window.addEventListener("arena-mouse-look-audit", this.mouseLookAuditHandler);
    canvas.addEventListener("pointerdown", this.pointerDownHandler);
    canvas.addEventListener("pointerup", this.pointerUpHandler);
    canvas.addEventListener("pointerleave", this.pointerUpHandler);
    canvas.addEventListener("pointermove", this.pointerMoveHandler);
    canvas.addEventListener("contextmenu", this.contextMenuHandler);
  }

  update(delta: number) {
    if (!this.isDemo) return;
    this.demoClock += delta;
    this.demoAttackClock += delta;
    const nextAttack = this.demoCombo[this.demoComboStep];
    if (this.demoAttackClock > nextAttack.delay) {
      this.pressed.add(nextAttack.action);
      console.info(`[DemoInput] ${nextAttack.action} step=${this.demoComboStep + 1}`);
      this.demoComboStep = (this.demoComboStep + 1) % this.demoCombo.length;
      this.demoAttackClock = 0;
    }
    if (Math.floor(this.demoClock * 0.37) % 12 === 7 && Math.sin(this.demoClock * 4) > 0.98) {
      this.pressed.add("dodge");
    }
  }

  movement() {
    if (this.isDemo) {
      return new Vector2(Math.sin(this.demoClock * 0.72) * 0.55, Math.cos(this.demoClock * 0.5) * 0.7);
    }
    const horizontal = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0) + (this.touchDirections.has("right") ? 1 : 0) - (this.touchDirections.has("left") ? 1 : 0);
    const vertical = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0) + (this.touchDirections.has("up") ? 1 : 0) - (this.touchDirections.has("down") ? 1 : 0);
    return new Vector2(Math.max(-1, Math.min(1, horizontal)), Math.max(-1, Math.min(1, vertical)));
  }

  consume(action: ArenaAction) {
    const hasAction = this.pressed.has(action);
    this.pressed.delete(action);
    return hasAction;
  }

  consumeLook() {
    const look = this.lookDelta.clone();
    this.lookDelta.set(0, 0);
    return look;
  }

  dispose() {
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("arena-touch-action", this.touchActionHandler);
    window.removeEventListener("arena-touch-move", this.touchMoveHandler);
    window.removeEventListener("arena-touch-look", this.touchLookHandler);
    window.removeEventListener("arena-mouse-look-audit", this.mouseLookAuditHandler);
    this.canvas.removeEventListener("pointerdown", this.pointerDownHandler);
    this.canvas.removeEventListener("pointerup", this.pointerUpHandler);
    this.canvas.removeEventListener("pointerleave", this.pointerUpHandler);
    this.canvas.removeEventListener("pointermove", this.pointerMoveHandler);
    this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
  }
}
