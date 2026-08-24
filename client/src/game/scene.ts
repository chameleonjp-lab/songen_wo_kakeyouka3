// Bronze & Blood Arena scene entry — React frames the experience while GameWorld owns all rendering and combat behavior.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { GameWorld } from "@/game/GameWorld";
import { MAX_FRAME_DELTA_SECONDS, safeRun } from "@/game/RuntimeResilience";

export type GameHandle = {
  scene: Scene;
  start: () => void;
  recoverFromRenderError: (error: unknown) => void;
  dispose: () => void;
};

/**
 * Babylon normally supplies a frame delta from its render-loop clock. Safari
 * can report 0 for that value after a tab is restored (and on the first
 * frame), which would leave every real-time timer at its preload value. Keep a
 * monotonic browser clock beside Babylon's value so the simulation still
 * advances while the engine clock catches up.
 */
export function selectFrameDeltaSeconds(engineMilliseconds: number, elapsedSeconds: number) {
  const engineDelta = Number.isFinite(engineMilliseconds) && engineMilliseconds > 0 ? engineMilliseconds / 1000 : 0;
  const safeElapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  // The monotonic callback interval is authoritative when a throttled mobile
  // engine under-reports a positive delta. Taking the larger clock keeps a
  // 5 fps frame worth 0.2 seconds while the resume cap below still prevents a
  // backgrounded tab from simulating an unbounded jump.
  const selected = Math.max(engineDelta, safeElapsed);
  return Math.min(MAX_FRAME_DELTA_SECONDS, Math.max(0, selected));
}

function frameDeltaSeconds(engine: Pick<Engine, "getDeltaTime">, previousTime: number) {
  const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  const elapsed = previousTime > 0 ? Math.max(0, (now - previousTime) / 1000) : 0;
  return selectFrameDeltaSeconds(engine.getDeltaTime(), elapsed);
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement, playerName: string): Promise<GameHandle> {
  const scene = new Scene(engine);
  let world: GameWorld;
  try {
    world = new GameWorld(scene, canvas, playerName);
  } catch (error) {
    safeRun(() => scene.dispose());
    throw error;
  }
  let updateRecoveryAttempted = false;
  let updateErrorReported = false;
  const reportRuntimeFatal = (error: unknown) => {
    if (updateErrorReported) return;
    updateErrorReported = true;
    console.error("Arena update still failing after render recovery", error);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("arena-runtime-fatal", {
        detail: { message: "ゲームの更新を続けられませんでした。再読み込みしてもう一度お試しください。" },
      }));
    }
  };
  let previousFrameTime = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  scene.onBeforeRenderObservable.add(() => {
    try {
      const delta = frameDeltaSeconds(scene.getEngine(), previousFrameTime);
      previousFrameTime = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      world.update(delta);
    } catch (error) {
      // A failed animation/material callback must not kill the render loop and
      // freeze the opening countdown at 3.0s. Disable imported visuals once,
      // then allow the deterministic procedural presentation to continue.
      if (!updateRecoveryAttempted) {
        updateRecoveryAttempted = true;
        if (!safeRun(() => world.recoverFromRenderError(error))) reportRuntimeFatal(error);
      } else reportRuntimeFatal(error);
    }
  });
  return {
    scene,
    start: () => world.start(),
    recoverFromRenderError: (error) => world.recoverFromRenderError(error),
    dispose: () => {
      safeRun(() => world.dispose());
      safeRun(() => scene.dispose());
    },
  };
}
