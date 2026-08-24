import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Node } from "@babylonjs/core/node";
import { Scene } from "@babylonjs/core/scene";
// These audited assets are plain glTF 2.0 with no optional extensions. Import
// only the v2 loader registration so mobile clients do not download every glTF
// 1.0 and optional-extension implementation before the first duel.
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import { characterAssets, type CharacterKey } from "@/game/assets";
import { runtimeFlags } from "@/game/RuntimeFlags";
import { safeRun, settleWithin } from "@/game/RuntimeResilience";

export type CharacterMotion = "idle" | "move" | "guard" | "light" | "heavy" | "counter" | "hurt" | "dead" | "musou";

export const ROOT_MOTION_POLICY = "code-authoritative-in-place" as const;
export const CHARACTER_LOAD_TIMEOUT_MS = 8_000;

const visualReadinessCache = new WeakMap<TransformNode, { frameId: number; ready: boolean }>();

/**
 * A loaded GLB is not necessarily drawable yet.  In particular, a skeletal
 * mesh can exist while its material/effect is still compiling on the first
 * frame.  Callers keep the procedural presentation visible until at least one
 * real character mesh has geometry, is enabled, and reports a ready material.
 */
export function isCharacterVisualRenderable(visual: TransformNode | null) {
  if (!visual || visual.isDisposed()) return false;
  if (!visual.isEnabled()) return false;
  const scene = typeof (visual as TransformNode & { getScene?: unknown }).getScene === "function" ? visual.getScene() : null;
  const frameId = scene?.getFrameId() ?? -1;
  const cached = visualReadinessCache.get(visual);
  if (cached?.frameId === frameId) return cached.ready;
  const meshes = visual.getChildMeshes(false);
  const ready = meshes.some((mesh) => {
    if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || mesh.getTotalVertices() <= 0) return false;
    try {
      const material = mesh.material;
      if (!material || !material.isReady(mesh, false)) return false;
      // `Material.isReady` can be true while the effect is still being
      // replaced after a context restore on Safari. Do not hide the
      // procedural presentation until the actual effect reports ready too.
      const effect = typeof material.getEffect === "function" ? material.getEffect() : null;
      if (effect && typeof effect.isReady === "function" && !effect.isReady()) return false;
      const bounds = mesh.getBoundingInfo?.();
      const radius = bounds?.boundingSphere?.radiusWorld;
      return radius === undefined || (Number.isFinite(radius) && radius > 0.001);
    } catch {
      return false;
    }
  });
  if (scene) visualReadinessCache.set(visual, { frameId, ready });
  return ready;
}

function cloneAnimationValue<T>(value: T): T {
  if (value && typeof value === "object" && "clone" in value && typeof value.clone === "function") {
    return value.clone() as T;
  }
  if (Array.isArray(value)) return [...value] as T;
  return value;
}

/**
 * The audited GLBs contain translation and rotation on Root_CTRL. Position is
 * already advanced by the deterministic combat simulation, so those tracks
 * are held at their first key to prevent double movement while preserving all
 * 44 animation groups and the 19-bone skeleton.
 */
function makeRootMotionInPlace(groups: AnimationGroup[]) {
  for (const group of groups) {
    for (const targeted of group.targetedAnimations) {
      const targetName = String((targeted.target as { name?: string } | null)?.name ?? "");
      const property = targeted.animation.targetProperty.toLowerCase();
      if (!/root(?:_ctrl)?/i.test(targetName) || (!property.includes("position") && !property.includes("rotation"))) continue;
      const keys = targeted.animation.getKeys();
      const baseline = keys[0]?.value;
      if (baseline === undefined) continue;
      targeted.animation.setKeys(keys.map((key) => ({ ...key, value: cloneAnimationValue(baseline) })));
    }
  }
}

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
  private disposed = false;

  constructor(private readonly groups: AnimationGroup[], private readonly disposeOwnedNodes?: () => void) {
    makeRootMotionInPlace(groups);
    this.groupsByName = new Map(groups.map((group) => [group.name.toLowerCase(), group]));
    for (const group of groups) {
      for (const targeted of group.targetedAnimations) {
        targeted.animation.enableBlending = true;
        targeted.animation.blendingSpeed = 0.14;
      }
    }
  }

  play(motion: CharacterMotion, loop = false, speedRatio = 1) {
    const group = this.find(motion);
    return group ? this.playGroup(group, loop, speedRatio, false) : false;
  }

  playNamed(name: string, loop = false, speedRatio = 1, restart = !loop) {
    const group = this.groupsByName.get(name.toLowerCase());
    return group ? this.playGroup(group, loop, speedRatio, restart) : false;
  }

  has(name: string) {
    return this.groupsByName.has(name.toLowerCase());
  }

  names() {
    return this.groups.map((group) => group.name);
  }

  stop() {
    safeRun(() => this.current?.stop());
    this.current = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.groups.forEach((group) => safeRun(() => group.dispose()));
    safeRun(() => this.disposeOwnedNodes?.());
  }

  duration(motion: CharacterMotion, speedRatio = 1) {
    const group = this.find(motion);
    if (!group) return null;
    const frameRate = group.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    return Math.max(0.08, (group.to - group.from) / frameRate / Math.max(0.1, speedRatio));
  }

  durationNamed(name: string, speedRatio = 1) {
    const group = this.groupsByName.get(name.toLowerCase());
    if (!group) return null;
    const frameRate = group.targetedAnimations[0]?.animation.framePerSecond ?? 30;
    return Math.max(0.08, (group.to - group.from) / frameRate / Math.max(0.1, speedRatio));
  }

  private playGroup(group: AnimationGroup, loop: boolean, speedRatio: number, restart: boolean) {
    const previous = this.current;
    try {
      if (group === this.current && !restart) {
        group.speedRatio = speedRatio;
        return true;
      }
      this.current?.stop();
      this.current = group;
      group.speedRatio = speedRatio;
      group.reset();
      group.start(loop, speedRatio);
      return true;
    } catch {
      safeRun(() => previous?.stop());
      if (group !== previous) safeRun(() => group.stop());
      this.current = null;
      return false;
    }
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
  private fallbackOnly = false;

  constructor(private readonly scene: Scene) {
    const isTouchMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 680px) and (pointer: coarse)").matches;
    this.textureAnisotropy = isTouchMobile ? 2 : 8;
  }

  preload(key: CharacterKey) {
    if (this.disposed || this.fallbackOnly) return Promise.resolve(false);
    if (this.prepared.has(key)) return Promise.resolve(true);
    const pending = this.preparing.get(key);
    if (pending) return pending;
    this.tracePreload("requested", key);
    if (runtimeFlags.preloadFailureAudit) {
      const task = Promise.resolve(false).then((ready) => {
        this.failedPreloads.add(key);
        this.tracePreload("failed", key);
        return ready;
      }).finally(() => this.preparing.delete(key));
      this.preparing.set(key, task);
      return task;
    }
    const task = settleWithin(
      this.loadContainerWithRetry(key),
      CHARACTER_LOAD_TIMEOUT_MS,
      (container) => safeRun(() => container.dispose()),
      `${key} character load`,
    )
      .then((container) => {
        if (this.disposed || this.fallbackOnly) {
          safeRun(() => container.dispose());
          return false;
        }
        this.prepared.set(key, container);
        this.evictPreparedCache(key);
        this.tracePreload("ready", key);
        return true;
      })
      .catch((error) => {
        console.warn(`Unable to preload ${key} character asset`, error);
        this.failedPreloads.add(key);
        this.tracePreload("failed", key);
        this.reportLoadFailure(key);
        return false;
      })
      .finally(() => this.preparing.delete(key));
    this.preparing.set(key, task);
    return task;
  }

  attach(key: CharacterKey, anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void) {
    if (this.disposed || this.fallbackOnly || anchor.isDisposed()) return;
    const prepared = this.prepared.get(key);
    if (prepared) {
      this.attachPrepared(key, prepared, anchor, scale, onReady);
      return;
    }
    const pending = this.preparing.get(key);
    if (pending) {
      void pending.then((ready) => {
        if (this.disposed || this.fallbackOnly || anchor.isDisposed()) return;
        const cached = this.prepared.get(key);
        if (ready && cached) this.attachPrepared(key, cached, anchor, scale, onReady);
        else this.attachImported(key, anchor, scale, onReady);
      }).catch((error) => {
        console.warn(`Unable to attach pending ${key} character asset`, error);
        this.reportLoadFailure(key);
      });
      return;
    }
    const shouldFallback = this.failedPreloads.delete(key);
    this.attachImported(key, anchor, scale, onReady, shouldFallback);
  }

  dispose() {
    this.disposed = true;
    this.fallbackOnly = true;
    this.prepared.forEach((container) => safeRun(() => container.dispose()));
    this.prepared.clear();
    this.preparing.clear();
    this.failedPreloads.clear();
  }

  forceProceduralFallback() {
    if (this.fallbackOnly) return;
    this.fallbackOnly = true;
    this.prepared.forEach((container) => safeRun(() => container.dispose()));
    this.prepared.clear();
    this.failedPreloads.clear();
  }

  private attachPrepared(key: CharacterKey, container: AssetContainer, anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void) {
    if (this.disposed || this.fallbackOnly || anchor.isDisposed()) return;
    const snapshot = this.sceneSnapshot();
    try {
      // Cached templates must not share materials with a live fighter. An
      // evicted AssetContainer disposes its own materials; cloned materials
      // keep the already-visible character valid.
      const entries = container.instantiateModelsToScene(
        (name) => `character-${key}-${this.serial}-${name}`,
        true,
        { doNotInstantiate: true },
      );
      const attached = this.attachVisual(
        key,
        entries.rootNodes,
        entries.animationGroups,
        anchor,
        scale,
        onReady,
        () => entries.skeletons.forEach((skeleton) => safeRun(() => skeleton.dispose())),
        true,
      );
      if (attached) {
        this.tracePreload("consumed", key);
        return;
      }
    } catch (error) {
      console.warn(`Unable to instantiate prepared ${key} character asset`, error);
    }
    this.rollbackSceneSnapshot(snapshot);
    this.attachImported(key, anchor, scale, onReady, true);
  }

  private attachImported(key: CharacterKey, anchor: TransformNode, scale: number, onReady: (instance: TransformNode, animator: CharacterAnimator) => void, isFallback = false) {
    if (this.disposed || this.fallbackOnly || anchor.isDisposed()) return;
    if (isFallback) this.tracePreload("fallback", key);
    void settleWithin(
      SceneLoader.ImportMeshAsync("", "", characterAssets[key], this.scene),
      CHARACTER_LOAD_TIMEOUT_MS,
      (result) => this.disposeImportedResult(result.meshes, result.animationGroups, result.skeletons, true),
      `${key} character import`,
    )
      .then((result) => {
        const attached = this.attachVisual(
          key,
          result.meshes,
          result.animationGroups,
          anchor,
          scale,
          onReady,
          () => result.skeletons.forEach((skeleton) => safeRun(() => skeleton.dispose())),
          true,
        );
        if (!attached) this.reportLoadFailure(key);
      })
      .catch((error) => {
        console.warn(`Unable to load ${key} character asset`, error);
        this.reportLoadFailure(key);
      });
  }

  private attachVisual(
    key: CharacterKey,
    roots: Node[],
    animationGroups: AnimationGroup[],
    anchor: TransformNode,
    scale: number,
    onReady: (instance: TransformNode, animator: CharacterAnimator) => void,
    disposeSkeletons: () => void,
    disposeMaterials: boolean,
  ) {
    let instance: TransformNode | null = null;
    let animator: CharacterAnimator | null = null;
    const disposeUnowned = () => {
      animationGroups.forEach((group) => safeRun(() => group.dispose()));
      safeRun(disposeSkeletons);
      if (instance && !instance.isDisposed()) {
        safeRun(() => instance?.dispose(false, disposeMaterials));
      } else {
        roots.filter((node) => !node.parent).forEach((node) => safeRun(() => node.dispose(false, disposeMaterials)));
      }
    };
    try {
      if (this.disposed || this.fallbackOnly || anchor.isDisposed()) {
        disposeUnowned();
        return false;
      }
      instance = new TransformNode(`character-${key}-${this.serial++}`, this.scene);
      roots.filter((node) => !node.parent).forEach((node) => { node.parent = instance; });
      instance.parent = anchor;
      instance.setEnabled(true);
      instance.position.set(0, 0, 0);
      instance.rotation.set(0, 0, 0);
      instance.scaling.setAll(scale);
      instance.getChildMeshes(false).forEach((mesh) => {
        mesh.isVisible = true;
        mesh.receiveShadows = true;
        // Prefer the bone texture path on mobile/WebGL where the uniform path
        // can exceed the vertex-uniform limit and silently drop a skinned mesh.
        if (mesh.skeleton) mesh.skeleton.useTextureToStoreBoneMatrices = true;
        mesh.material?.getActiveTextures().forEach((texture) => {
          texture.anisotropicFilteringLevel = this.textureAnisotropy;
        });
      });
      animator = new CharacterAnimator(animationGroups, () => {
        safeRun(disposeSkeletons);
        if (instance && !instance.isDisposed()) safeRun(() => instance?.dispose(false, disposeMaterials));
      });
      animator.play("idle", true);
      onReady(instance, animator);
      return true;
    } catch (error) {
      console.warn(`Unable to prepare ${key} character presentation`, error);
      if (animator) animator.dispose();
      else disposeUnowned();
      return false;
    }
  }

  private tracePreload(state: "requested" | "ready" | "consumed" | "failed" | "fallback", key: CharacterKey) {
    if (runtimeFlags.preloadAudit) {
      console.info(`[PreloadAudit] ${state} ${key}`);
    }
  }

  private reportLoadFailure(key: CharacterKey) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("arena-asset-error", {
      detail: { key, recoverable: true, message: `${key} の3D素材を読み込めませんでした。代替表示で続行します。` },
    }));
  }

  private async loadContainerWithRetry(key: CharacterKey) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await SceneLoader.LoadAssetContainerAsync("", characterAssets[key], this.scene);
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 220));
      }
    }
    throw lastError;
  }

  private evictPreparedCache(current: CharacterKey) {
    const pinned = new Set<CharacterKey>(["goose", "poop", current]);
    if (this.prepared.size <= 4) return;
    for (const [key, container] of this.prepared) {
      if (this.prepared.size <= 4) break;
      if (pinned.has(key)) continue;
      safeRun(() => container.dispose());
      this.prepared.delete(key);
    }
  }

  private disposeImportedResult(
    roots: Node[],
    animationGroups: AnimationGroup[],
    skeletons: Array<{ dispose: () => void }>,
    disposeMaterials: boolean,
  ) {
    animationGroups.forEach((group) => safeRun(() => group.dispose()));
    skeletons.forEach((skeleton) => safeRun(() => skeleton.dispose()));
    roots.filter((node) => !node.parent).forEach((node) => safeRun(() => node.dispose(false, disposeMaterials)));
  }

  private sceneSnapshot() {
    return {
      nodes: new Set<Node>([...this.scene.meshes, ...this.scene.transformNodes]),
      skeletons: new Set(this.scene.skeletons),
      animationGroups: new Set(this.scene.animationGroups),
      materials: new Set(this.scene.materials),
      multiMaterials: new Set(this.scene.multiMaterials),
    };
  }

  private rollbackSceneSnapshot(snapshot: ReturnType<CharacterLibrary["sceneSnapshot"]>) {
    const newNodes = [...this.scene.meshes, ...this.scene.transformNodes]
      .filter((node) => !snapshot.nodes.has(node));
    const newNodeSet = new Set<Node>(newNodes);
    newNodes
      .filter((node) => !node.parent || !newNodeSet.has(node.parent))
      .forEach((node) => safeRun(() => node.dispose(false, true)));
    this.scene.animationGroups
      .filter((group) => !snapshot.animationGroups.has(group))
      .forEach((group) => safeRun(() => group.dispose()));
    this.scene.skeletons
      .filter((skeleton) => !snapshot.skeletons.has(skeleton))
      .forEach((skeleton) => safeRun(() => skeleton.dispose()));
    this.scene.multiMaterials
      .filter((material) => !snapshot.multiMaterials.has(material))
      .forEach((material) => safeRun(() => material.dispose(true, true)));
    this.scene.materials
      .filter((material) => !snapshot.materials.has(material))
      .forEach((material) => safeRun(() => material.dispose(true, true)));
  }
}
