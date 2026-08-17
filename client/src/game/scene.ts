// Bronze & Blood Arena scene entry — React frames the experience while GameWorld owns all rendering and combat behavior.
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { GameWorld } from "@/game/GameWorld";

export type GameHandle = {
  scene: Scene;
  start: () => void;
  dispose: () => void;
};

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  const world = new GameWorld(scene, canvas);
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
