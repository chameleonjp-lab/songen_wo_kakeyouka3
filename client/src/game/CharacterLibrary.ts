import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Node } from "@babylonjs/core/node";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import { characterAssets, type CharacterKey } from "@/game/assets";
import { retainOnlyPrepared } from "@/game/CharacterPreloadPlan";

export type CharacterMotion = "idle" | "move" | "guard" | "light" | "heavy" | "counter" | "hurt" | "dead" | "musou";

const motionAliases: Record<CharacterMotion, string[]> = {
  idle: ["Idle", "idle", "Standing", "Wait"],
  move: ["Walk", "walk", "Run", "run", "Move", "move", "Idle", "idle"],
  guard: ["Guard", "guard", "Block", "block"],
  light: ["Punch_R", "Punch", "Attack", "attack", "Hit"],
  heavy: ["Kick_L", "Kick", "Heavy", "Smash"],
  counter: ["Counter", "Punch_R", "Punch", "Attack"],
  hurt: ["Hurt", "HitReact", "Damage", "Stagger", "Guard", "Idle"],
  dead: ["Death", "Dead", "Fall", "Guard", "Idle"],
  musou: ["Musou", "Special", "Attack", "Kick_L", "Punch_R"],
};

export class CharacterAnimator {
  private current: AnimationGroup | null = null;
  private readonly groupsByName: Map<string, AnimationGroup>;

  constructor(private readonly groups: AnimationGroup[]) {
    this.groupsByName = new Map(groups.map((group) => [group.name.toLowerCase(), group]));
  }

  play(motion: CharacterMotion, loop = false, speedRatio = 1) {
    const group = this.find(motion);
    if (!group || group === this.current) {
      if (group) group.speedRatio = speedRatio;
      return Boolean(group);
    }
    this.current?.stop();
    this.current = group;
    group.speedRatio = speedRatio;
    group.reset();
    group.start(loop);
    return true;
  }

  stop() {
    this.current?.stop();
    this.current = null;
  }

  duration(motion: CharacterMotion, speedRatio = 1) {
    const group = this.find(motion);
    if (!group) return null;
    const frameRate = group.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    return Math.max(0.08, (group.to - group.from) / frameRate / Math.max(0.1, speedRatio));
  }

  private find(motion: CharacterMotion) {
    const aliases = motionAliases[motion];
    for (const alias of aliases) {
      const group = this.groupsByName.get(alias.toLowerCase());
      if (group) return group;
    }
    return this.groups.find((group) => aliases.some((alias) => group.name.toLowerCase().includes(alias.toLowerCase()))) ?? null;
  }
}

export class CharacterLibrary {
  private serial = 0;
  private readonly textureAnisotropy: number;
  private readonly prepared = new Map<CharacterKey, AssetContainer>();
  private readonly preparing = new Map<CharacterKey, Promise<boolean>>();
  private readonly failedPreloads = new Set<CharacterKey>();
  private disposed = false;

  constructor(private readonly scene: Scene) {
    const isTouchMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 680px) and (pointer: coarse)").matches;
    this.textureAnisotropy = isTouchMobile ? 2 : 8;
  }

  preload(key: CharacterKey) {
    if (this.disposed) return Promise.resolve(false);
    if (this.prepared.has(key)) return Promise.resolve(true);
    const pending = this.preparing.get(key);
    if (pending) return pending;
    this.tracePreload("requested", key);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("preloadFailureAudit")) {
      const task = Promise.resolve(false).then((ready) => {
        this.failedPreloads.add(key);
        this.tracePreload("failed", key);
        return ready;
      }).finally(() => this.preparing.delete(key));
      this.preparing.set(key, task);
      return task;
    }
    const task = SceneLoader.LoadAssetContainerAsync("", characterAssets[key], this.scene)
      .then((container) => {
        if (this.disposed) {
          container.dispose();
          return false;
        }
        this.evictPreparedExcept(key);
        this.prepared.set(key, container);
        this.tracePreload("ready", key);
        return true;
      })
      .catch((error) => {
        console.warn(`Unable to preload ${key} character asset`, error);
        this.failedPreloads.add(key);
        this.tracePreload("failed", key);
        return false;
      })
      .finally(() => this.preparing.delete(key));
    this.preparing.set(key, task);
    return task;
  }

  attach(key: CharacterKey, anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void) {
    const prepared = this.prepared.get(key);
    if (prepared) {
      this.attachPrepared(key, prepared, anchor, scale, onReady);
      return;
    }
    const pending = this.preparing.get(key);
    if (pending) {
      void pending.then((ready) => {
        const cached = this.prepared.get(key);
        if (ready && cached) this.attachPrepared(key, cached, anchor, scale, onReady);
        else this.attachImported(key, anchor, scale, onReady);
      });
      return;
    }
    const shouldFallback = this.failedPreloads.delete(key);
    this.attachImported(key, anchor, scale, onReady, shouldFallback);
  }

  dispose() {
    this.disposed = true;
    this.prepared.forEach((container) => container.dispose());
    this.prepared.clear();
    this.preparing.clear();
    this.failedPreloads.clear();
  }

  private attachPrepared(key: CharacterKey, container: AssetContainer, anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void) {
    const entries = container.instantiateModelsToScene((name) => `character-${key}-${this.serial}-${name}`);
    this.attachVisual(key, entries.rootNodes, entries.animationGroups, anchor, scale, onReady);
    this.tracePreload("consumed", key);
  }

  private attachImported(key: CharacterKey, anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void, isFallback = false) {
    if (isFallback) this.tracePreload("fallback", key);
    void SceneLoader.ImportMeshAsync("", "", characterAssets[key], this.scene)
      .then((result) => {
        this.attachVisual(key, result.meshes, result.animationGroups, anchor, scale, onReady);
      })
      .catch((error) => console.warn(`Unable to load ${key} character asset`, error));
  }

  private attachVisual(key: CharacterKey, roots: Node[], animationGroups: AnimationGroup[], anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void) {
    if (this.disposed || anchor.isDisposed()) return;
    const instance = new TransformNode(`character-${key}-${this.serial++}`, this.scene);
    roots.filter((node) => !node.parent).forEach((node) => { node.parent = instance; });
    instance.parent = anchor;
    instance.setEnabled(true);
    instance.position.set(0, 0, 0);
    instance.rotation.set(0, 0, 0);
    instance.scaling.setAll(scale);
    instance.getChildMeshes(false).forEach((mesh) => {
      mesh.isVisible = true;
      mesh.receiveShadows = true;
      mesh.material?.getActiveTextures().forEach((texture) => {
        texture.anisotropicFilteringLevel = this.textureAnisotropy;
      });
    });
    const animator = new CharacterAnimator(animationGroups);
    animator.play("idle", true);
    onReady(instance, animator);
  }

  private tracePreload(state: "requested" | "ready" | "consumed" | "failed" | "fallback", key: CharacterKey) {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("preloadAudit")) {
      console.info(`[PreloadAudit] ${state} ${key}`);
    }
  }

  private evictPreparedExcept(key: CharacterKey) {
    retainOnlyPrepared(this.prepared, key, (container) => container.dispose());
  }
}
