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
  scene.onBeforeRenderObservable.add(() => {
    try {
      world.update(scene.getEngine().getDeltaTime() / 1000);
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
