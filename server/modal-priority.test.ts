import { describe, expect, it } from "vitest";
import { activeArenaModal } from "../client/src/game/ModalPriority";

describe("arena modal priority", () => {
  it("shows no modal during normal combat", () => {
    expect(activeArenaModal({ sceneError: false, contextLost: false, hasResult: false, paused: false })).toBeNull();
  });

  it("shows pause only when no higher-priority state exists", () => {
    expect(activeArenaModal({ sceneError: false, contextLost: false, hasResult: false, paused: true })).toBe("pause");
  });

  it("keeps a result above an obsolete paused state", () => {
    expect(activeArenaModal({ sceneError: false, contextLost: false, hasResult: true, paused: true })).toBe("result");
  });

  it("keeps graphics recovery above result and pause", () => {
    expect(activeArenaModal({ sceneError: false, contextLost: true, hasResult: true, paused: true })).toBe("graphics-recovery");
  });

  it("keeps a fatal scene error above every other overlay", () => {
    expect(activeArenaModal({ sceneError: true, contextLost: true, hasResult: true, paused: true })).toBe("scene-error");
  });
});
