import { afterEach, describe, expect, it } from "vitest";
import { InputManager } from "../client/src/game/InputManager";
import { Haptics } from "../client/src/game/Haptics";
import { TouchLookController } from "../client/src/game/TouchLookController";
import { applyLockCameraLook, LOCK_BETA_MAX, LOCK_BETA_MIN, LOCK_ORBIT_LIMIT } from "../client/src/game/CameraRig";

const originalWindow = globalThis.window;

function installFakeWindow() {
  const listeners = new Map<string, EventListener>();
  const fakeWindow = {
    location: { search: "" },
    addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
    removeEventListener(type: string) { listeners.delete(type); },
    dispatchEvent(event: Event) { listeners.get(event.type)?.(event); return true; },
  } as unknown as Window & typeof globalThis;
  globalThis.window = fakeWindow;
  return fakeWindow;
}

function fakeCanvas() {
  const listeners = new Map<string, EventListener>();
  const canvas = {
    addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
    removeEventListener(type: string) { listeners.delete(type); },
    focus() {},
    emit(type: string, detail: Record<string, unknown> = {}) {
      const event = { ...detail, currentTarget: canvas } as unknown as Event;
      listeners.get(type)?.(event);
    },
  };
  return canvas as unknown as HTMLCanvasElement & { emit(type: string, detail?: Record<string, unknown>): void };
}

afterEach(() => {
  globalThis.window = originalWindow;
});

describe("mobile touch input", () => {
  it("keeps a long-held direction active and supports diagonal movement", () => {
    const window = installFakeWindow();
    const input = new InputManager(fakeCanvas());
    window.dispatchEvent(new CustomEvent("arena-touch-move", { detail: { direction: "up", active: true } }));
    window.dispatchEvent(new CustomEvent("arena-touch-move", { detail: { direction: "right", active: true } }));
    expect(input.movement().x).toBe(1);
    expect(input.movement().y).toBe(1);
    expect(input.consumeLook().length()).toBe(0);
    window.dispatchEvent(new CustomEvent("arena-touch-move", { detail: { direction: "up", active: false } }));
    expect(input.movement().y).toBe(0);
    input.dispose();
  });

  it("resets touch camera tracking after pointer cancel and accepts the next gesture", () => {
    const look = new TouchLookController();
    look.pointerDown({ id: 4, x: 10, y: 20 });
    expect(look.pointerMove({ id: 4, x: 18, y: 13 })).toEqual({ dx: 8, dy: -7 });
    look.pointerCancel(4);
    expect(look.isActive()).toBe(false);
    expect(look.pointerMove({ id: 4, x: 30, y: 30 })).toBeNull();
    look.pointerDown({ id: 5, x: 30, y: 30 });
    expect(look.pointerMove({ id: 5, x: 34, y: 36 })).toEqual({ dx: 4, dy: 6 });
  });

  it("tracks PC mouse look through the canvas pointer path and keeps vertical input bounded by the camera layer", () => {
    const window = installFakeWindow();
    const canvas = fakeCanvas();
    const input = new InputManager(canvas);
    canvas.emit("pointerdown", { button: 0 });
    canvas.emit("pointermove", { movementX: 36, movementY: -18 });
    const look = input.consumeLook();
    expect(look.x).toBe(36);
    expect(look.y).toBe(-18);
    canvas.emit("pointerup");
    canvas.emit("pointermove", { movementX: 20, movementY: 20 });
    expect(input.consumeLook().length()).toBe(0);
    input.dispose();
  });

  it("accumulates touch camera deltas and clears them after consumption", () => {
    const window = installFakeWindow();
    const input = new InputManager(fakeCanvas());
    window.dispatchEvent(new CustomEvent("arena-touch-look", { detail: { dx: 22, dy: -11 } }));
    const look = input.consumeLook();
    expect(look.x).toBe(22);
    expect(look.y).toBe(-11);
    expect(input.consumeLook().length()).toBe(0);
    input.dispose();
  });

  it("clamps lock-on camera orbit and beta for large mouse look deltas", () => {
    const upper = applyLockCameraLook(0, 1, -240, -240);
    expect(upper.orbitOffset).toBe(LOCK_ORBIT_LIMIT);
    expect(upper.beta).toBe(LOCK_BETA_MAX);
    const lower = applyLockCameraLook(0, 1, 240, 240);
    expect(lower.orbitOffset).toBe(-LOCK_ORBIT_LIMIT);
    expect(lower.beta).toBe(LOCK_BETA_MIN);
  });

  it("triggers coarse-pointer haptics and safely disables unsupported devices", () => {
    globalThis.window = {
      matchMedia: (query: string) => ({ matches: query === "(pointer: coarse)", media: query }) as MediaQueryList,
    } as unknown as Window & typeof globalThis;
    const calls: Array<number | number[]> = [];
    const haptics = new Haptics({ vibrate: (pattern: number | number[]) => { calls.push(pattern); return true; } } as Navigator);
    expect(haptics.isEnabled()).toBe(true);
    expect(haptics.trigger("justGuard")).toBe(true);
    expect(calls).toEqual([[18, 24, 42]]);
    const unsupported = new Haptics({} as Navigator);
    expect(unsupported.isEnabled()).toBe(false);
    expect(unsupported.trigger("hit")).toBe(false);
    globalThis.window = {
      matchMedia: () => ({ matches: true }) as MediaQueryList,
    } as unknown as Window & typeof globalThis;
    const reduced = new Haptics({ vibrate: () => true } as Navigator);
    expect(reduced.isEnabled()).toBe(false);
    globalThis.window = {
      matchMedia: (query: string) => ({ matches: query === "(pointer: coarse)" }) as MediaQueryList,
    } as unknown as Window & typeof globalThis;
    const rejected = new Haptics({ vibrate: () => false } as Navigator);
    expect(rejected.isEnabled()).toBe(true);
    expect(rejected.trigger("hit")).toBe(false);
    const thrown = new Haptics({ vibrate: () => { throw new Error("denied"); } } as Navigator);
    expect(thrown.trigger("hit")).toBe(false);
  });

  it("keeps attack taps queued in order while guard remains an independent held action", () => {
    const window = installFakeWindow();
    const input = new InputManager(fakeCanvas());
    window.dispatchEvent(new CustomEvent("arena-touch-action", { detail: { action: "light" } }));
    window.dispatchEvent(new CustomEvent("arena-touch-action", { detail: { action: "light" } }));
    window.dispatchEvent(new CustomEvent("arena-touch-action", { detail: { action: "guard" } }));
    expect(input.consume("light")).toBe(true);
    expect(input.consume("light")).toBe(true);
    expect(input.consume("guard")).toBe(true);
    input.dispose();
  });
});
