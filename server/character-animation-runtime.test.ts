import { describe, expect, it, vi } from "vitest";
import { CharacterAnimator, ROOT_MOTION_POLICY } from "../client/src/game/CharacterLibrary";

type FakeGroup = {
  name: string;
  from: number;
  to: number;
  targetedAnimations: Array<{ target: { name: string }; animation: { targetProperty: string; getKeys: () => Array<{ frame: number; value: unknown }>; setKeys: ReturnType<typeof vi.fn>; enableBlending?: boolean; blendingSpeed?: number; framePerSecond?: number } }>;
  speedRatio: number;
  reset: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

function fakeGroup(name: string, targetName = "Root_CTRL"): FakeGroup {
  const baseline = { x: 1, y: 2, z: 3, clone: () => ({ x: 1, y: 2, z: 3 }) };
  const keys = [
    { frame: 0, value: baseline },
    { frame: 30, value: { x: 99, y: 99, z: 99 } },
  ];
  const animation = {
    targetProperty: "position",
    getKeys: () => keys,
    setKeys: vi.fn(),
    framePerSecond: 30,
  };
  return {
    name,
    from: 0,
    to: 30,
    targetedAnimations: [{ target: { name: targetName }, animation }],
    speedRatio: 1,
    reset: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("character animation runtime", () => {
  it("declares code-authoritative in-place root motion", () => {
    expect(ROOT_MOTION_POLICY).toBe("code-authoritative-in-place");
  });

  it("flattens Root_CTRL position keys to the first key while preserving other targets", () => {
    const root = fakeGroup("Punch_01_Jab");
    const hand = fakeGroup("HandOnly", "Hand_CTRL");
    const animator = new CharacterAnimator([root, hand] as never);
    const rootAnimation = root.targetedAnimations[0]?.animation;
    const handAnimation = hand.targetedAnimations[0]?.animation;
    expect(rootAnimation?.setKeys).toHaveBeenCalledTimes(1);
    expect(rootAnimation?.setKeys.mock.calls[0]?.[0].map((key) => key.value)).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 1, y: 2, z: 3 },
    ]);
    expect(handAnimation?.setKeys).not.toHaveBeenCalled();
    expect(rootAnimation?.enableBlending).toBe(true);
    expect(rootAnimation?.blendingSpeed).toBe(0.14);
    animator.dispose();
  });

  it("restarts a repeated non-loop animation only when explicitly requested", () => {
    const group = fakeGroup("Punch_01_Jab");
    const disposeOwned = vi.fn();
    const animator = new CharacterAnimator([group] as never, disposeOwned);

    expect(animator.playNamed("Punch_01_Jab", false, 1, true)).toBe(true);
    expect(group.reset).toHaveBeenCalledTimes(1);
    expect(group.start).toHaveBeenCalledTimes(1);
    expect(group.start).toHaveBeenLastCalledWith(false, 1);

    expect(animator.playNamed("Punch_01_Jab", false, 1.2, false)).toBe(true);
    expect(group.reset).toHaveBeenCalledTimes(1);
    expect(group.start).toHaveBeenCalledTimes(1);
    expect(group.speedRatio).toBe(1.2);

    expect(animator.playNamed("Punch_01_Jab", false, 1, true)).toBe(true);
    expect(group.stop).toHaveBeenCalledTimes(1);
    expect(group.reset).toHaveBeenCalledTimes(2);
    expect(group.start).toHaveBeenCalledTimes(2);
    expect(group.start).toHaveBeenLastCalledWith(false, 1);
    expect(animator.durationNamed("Punch_01_Jab")).toBe(1);
    expect(animator.durationNamed("missing")).toBeNull();
    animator.dispose();
    animator.dispose();
    expect(group.dispose).toHaveBeenCalledTimes(1);
    expect(disposeOwned).toHaveBeenCalledTimes(1);
  });
});
