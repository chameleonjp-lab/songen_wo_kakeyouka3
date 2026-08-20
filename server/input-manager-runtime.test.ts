import { afterEach, describe, expect, it, vi } from "vitest";
import { InputManager, inputQueueSettings } from "../client/src/game/InputManager";

type Listener = EventListener;

function listenerTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener(type: string, listener: Listener) {
      const entries = listeners.get(type) ?? new Set<Listener>();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function installFakeDom() {
  const windowTarget = listenerTarget();
  const documentTarget = listenerTarget();
  const fakeDocument = { ...documentTarget, hidden: false } as unknown as Document & { hidden: boolean };
  const fakeWindow = {
    ...windowTarget,
    location: { search: "" },
  } as unknown as Window & typeof globalThis;
  const canvasTarget = listenerTarget();
  const canvas = {
    ...canvasTarget,
    focus() {},
    setPointerCapture() {},
    emit(type: string, detail: Record<string, unknown> = {}) {
      const event = { pointerId: 0, button: 0, movementX: 0, movementY: 0, currentTarget: canvas, ...detail } as unknown as Event;
      canvasTarget.dispatchEvent(event);
    },
  } as unknown as HTMLCanvasElement & { emit(type: string, detail?: Record<string, unknown>): void };
  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);
  return { window: fakeWindow, document: fakeDocument, canvas, windowTarget, documentTarget, canvasTarget };
}

function touch(window: Window, action: string, active = true) {
  window.dispatchEvent(new CustomEvent("arena-touch-action", { detail: { action, active } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InputManager runtime queue", () => {
  it("publishes timestamped entries and expires them only after the queue window", () => {
    const dom = installFakeDom();
    let now = 100;
    vi.stubGlobal("performance", { now: () => now });
    const input = new InputManager(dom.canvas);

    touch(dom.window, "light");
    now = 110;
    touch(dom.window, "heavy");
    expect(input.queuedActions()).toEqual([
      { action: "light", at: 100 },
      { action: "heavy", at: 110 },
    ]);
    expect(inputQueueSettings).toEqual({ capacity: 8, windowMs: 620 });

    now = 730;
    expect(input.queuedActions()).toEqual([]);
    input.dispose();
  });

  it("keeps every tap in order while guard is held independently", () => {
    const dom = installFakeDom();
    vi.stubGlobal("performance", { now: () => 100 });
    const input = new InputManager(dom.canvas);

    touch(dom.window, "light");
    touch(dom.window, "light");
    touch(dom.window, "heavy");
    touch(dom.window, "guard", true);
    expect(input.isHeld("guard")).toBe(true);
    expect(input.queuedActions().map((entry) => entry.action)).toEqual(["light", "light", "heavy", "guard"]);
    expect(input.consume("light")).toBe(true);
    expect(input.consume("light")).toBe(true);
    expect(input.consume("heavy")).toBe(true);

    touch(dom.window, "guard", false);
    expect(input.isHeld("guard")).toBe(false);
    expect(input.consume("guard")).toBe(true);
    input.dispose();
  });

  it("does not turn a dragged pointer into an attack and leaves the next tap usable", () => {
    const dom = installFakeDom();
    vi.stubGlobal("performance", { now: () => 100 });
    const input = new InputManager(dom.canvas);

    dom.canvas.emit("pointerdown", { pointerId: 4, button: 0 });
    dom.canvas.emit("pointermove", { pointerId: 4, movementX: 6, movementY: 0 });
    dom.canvas.emit("pointerup", { pointerId: 4, button: 0 });
    expect(input.consume("light")).toBe(false);

    dom.canvas.emit("pointerdown", { pointerId: 5, button: 2 });
    dom.canvas.emit("pointerup", { pointerId: 5, button: 2 });
    expect(input.consume("heavy")).toBe(true);
    input.dispose();
  });

  it("resets held input on visibility loss and emits the world auto-pause signal", () => {
    const dom = installFakeDom();
    vi.stubGlobal("performance", { now: () => 100 });
    const input = new InputManager(dom.canvas);
    const pauses: Event[] = [];
    dom.window.addEventListener("arena-auto-pause", (event) => pauses.push(event));
    touch(dom.window, "guard", true);
    dom.window.dispatchEvent(new CustomEvent("arena-touch-move", { detail: { direction: "left", active: true } }));
    expect(input.isHeld("guard")).toBe(true);
    expect(input.movement().x).toBe(-1);

    dom.document.hidden = true;
    dom.document.dispatchEvent(new Event("visibilitychange"));
    expect(input.isHeld("guard")).toBe(false);
    expect(input.movement().length()).toBe(0);
    expect(pauses).toHaveLength(1);
    input.dispose();
  });

  it("removes global listeners on dispose", () => {
    const dom = installFakeDom();
    const input = new InputManager(dom.canvas);
    expect(dom.windowTarget.listenerCount("keydown")).toBe(1);
    expect(dom.documentTarget.listenerCount("visibilitychange")).toBe(1);
    input.dispose();
    expect(dom.windowTarget.listenerCount("keydown")).toBe(0);
    expect(dom.documentTarget.listenerCount("visibilitychange")).toBe(0);
    expect(dom.canvasTarget.listenerCount("pointerdown")).toBe(0);
  });
});
