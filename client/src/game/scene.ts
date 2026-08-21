// Bronze & Blood Arena scene entry — React frames the experience while GameWorld owns all rendering and combat behavior.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { GameWorld } from "@/game/GameWorld";

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
function frameDeltaSeconds(engine: Pick<Engine, "getDeltaTime">, previousTime: number) {
  const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  const elapsed = previousTime > 0 ? Math.max(0, (now - previousTime) / 1000) : 0;
  const engineMilliseconds = engine.getDeltaTime();
  const engineDelta = Number.isFinite(engineMilliseconds) && engineMilliseconds > 0 ? engineMilliseconds / 1000 : 0;
  // A render callback can be delayed while Safari is resuming. GameWorld also
  // caps its own delta, but capping here keeps recovery deterministic before
  // the update reaches the scene.
  const selected = engineDelta > 0.001 ? engineDelta : elapsed;
  return Math.min(0.1, selected);
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement, playerName: string): Promise<GameHandle> {
  const scene = new Scene(engine);
  let world: GameWorld;
  try {
    world = new GameWorld(scene, canvas, playerName);
  } catch (error) {
    scene.dispose();
    throw error;
  }
  let updateRecoveryAttempted = false;
  let updateErrorReported = false;
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
        world.recoverFromRenderError(error);
      } else if (!updateErrorReported) {
        updateErrorReported = true;
        console.warn("Arena update still failing after render recovery", error);
      }
    }
  });
  return {
    scene,
    start: () => world.start(),
    recoverFromRenderError: (error) => world.recoverFromRenderError(error),
    dispose: () => {
      world.dispose();
      scene.dispose();
    },
  };
}
