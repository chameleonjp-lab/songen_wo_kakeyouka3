// Bronze & Blood Arena scene entry — React frames the experience while GameWorld owns all rendering and combat behavior.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { GameWorld } from "@/game/GameWorld";

export type GameHandle = {
  scene: Scene;
  start: () => void;
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
  scene.onBeforeRenderObservable.add(() => world.update(scene.getEngine().getDeltaTime() / 1000));
  return {
    scene,
    start: () => world.start(),
    dispose: () => {
      world.dispose();
      scene.dispose();
    },
  };
}
