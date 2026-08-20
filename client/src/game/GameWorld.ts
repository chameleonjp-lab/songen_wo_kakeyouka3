// 尊厳を賭けようか3 — deterministic third-person six-duel combat runtime.
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";
import "@babylonjs/core/Shaders/rgbdEncode.fragment";
import "@babylonjs/core/Shaders/postprocess.vertex";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { arenaAssets, enemyCharacterKeys, type EnemyCharacterKey } from "@/game/assets";
import { CharacterAnimator, CharacterLibrary, type CharacterMotion } from "@/game/CharacterLibrary";
import { InputManager } from "@/game/InputManager";
import { CombatAudio } from "@/game/CombatAudio";
import { createEntryRoarTelemetry } from "@/game/EntryRoarTelemetry";
import { isAttackClashWindow } from "@/game/CombatClash";
import { Haptics } from "@/game/Haptics";
import { applyLockCameraLook } from "@/game/CameraRig";
import { fixedThirdPersonRig } from "@/game/FixedThirdPersonCamera";
import { advanceRoundSpawn } from "@/game/RoundFlow";
import { selectAttackMove, ENEMY_ATTACK_SETS, ATTACK_BY_NAME, type AttackMove } from "@/game/AttackCatalog";
import { DEFAULT_COMBAT_BALANCE } from "@/game/CombatBalance";
import { applyDignityDamage, createDignityState, isDignityLost, type DignityState } from "@/game/Dignity";
import { DEFAULT_ENEMY_ROSTER, enemyProfileFor, type EnemyProfile } from "@/game/EnemyRoster";
import { resolveHit, TARGET_VOLUME_RADIUS, type HitLocation } from "@/game/HitLocations";
import { GameSession, targetLabel, type RunResult } from "@/game/GameSession";
import { runtimeFlags } from "@/game/RuntimeFlags";
import { requestLocalRetry } from "@/game/PlayerProfile";

type PlayerMode = "idle" | "move" | "light" | "heavy" | "guard" | "counter" | "musou" | "dodge" | "fallen";
type EnemyMode = "spawn" | "approach" | "telegraph" | "strike" | "charge" | "recover" | "stagger" | "dead";

type Attack = {
  kind: "light" | "heavy" | "counter" | "musou";
  stage: number;
  time: number;
  duration: number;
  hitAt: number;
  hitEndAt: number;
  didHit: boolean;
  connected: boolean;
  queued: "light" | "heavy" | null;
  pulse: number;
  move: AttackMove;
  target: HitLocation;
};

type EnemyPresentation = {
  name: string;
  taunt: string;
  entryMotion: CharacterMotion;
  entryLean: number;
  roarIntensity: number;
};

type HudPayload = {
  health: number;
  playerHealth: number;
  playerMaxHealth: number;
  rage: number;
  kills: number;
  combo: number;
  enemies: number;
  route: string;
  started: boolean;
  paused: boolean;
  fallen: boolean;
  challengeVisible: boolean;
  challenger: string;
  taunt: string;
  challengeProgress: number;
  lockOn: boolean;
  playerName: string;
  dignity: number;
  playerDignity: number;
  playerMaxDignity: number;
  enemyCount: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  enemyDignity: number;
  enemyMaxDignity: number;
  enemyName: string;
  round: number;
  totalRounds: number;
  roundTotal: number;
  score: number;
  elapsed: number;
  elapsedSeconds: number;
  dodgeCooldown: number;
  dodgeReady: boolean;
  aimTarget: HitLocation;
  heartOpen: boolean;
  lockTarget: string | null;
  notice: string;
  guardBreak: number;
  counterReady: boolean;
  loadState: "loading" | "ready";
  intermission: boolean;
  intermissionRemaining: number;
  result: RunResult | null;
};

const ARENA_RADIUS = 21.5;
const UP = new Vector3(0, 1, 0);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrapAngle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const lerpAngle = (from: number, to: number, amount: number) => from + wrapAngle(to - from) * amount;
const forwardFromYaw = (yaw: number) => new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
const enemyPresentations: Record<EnemyCharacterKey, EnemyPresentation> = {
  bear: { name: "熊", taunt: "その翼、へし折る。", entryMotion: "heavy", entryLean: 0.12, roarIntensity: 1.08 },
  crocodile: { name: "ワニ", taunt: "噛み砕いてやる。", entryMotion: "guard", entryLean: -0.08, roarIntensity: 0.9 },
  gorilla: { name: "ゴリラ", taunt: "拳で語れ。", entryMotion: "counter", entryLean: 0.16, roarIntensity: 1.02 },
  hippopotamus: { name: "カバ", taunt: "踏み潰して進む。", entryMotion: "heavy", entryLean: -0.14, roarIntensity: 1.18 },
  lion: { name: "ライオン", taunt: "王の前に跪け。", entryMotion: "light", entryLean: 0.1, roarIntensity: 0.96 },
  rhinoceros: { name: "サイ", taunt: "正面から来い。", entryMotion: "heavy", entryLean: -0.18, roarIntensity: 1.1 },
};

const challengerNames: Record<EnemyCharacterKey, string> = Object.fromEntries(
  Object.entries(enemyPresentations).map(([key, profile]) => [key, profile.name]),
) as Record<EnemyCharacterKey, string>;

export class GameWorld {
  readonly scene: Scene;
  readonly input: InputManager;
  readonly camera: ArcRotateCamera;
  readonly player: Player;
  readonly enemies: BarbarianEnemy[] = [];
  readonly effects: CombatEffect[] = [];
  readonly rageTexts: RageTextEffect[] = [];
  readonly materials: ArenaMaterials;
  readonly characters: CharacterLibrary;
  readonly audio: CombatAudio;
  readonly haptics: Haptics;
  readonly session: GameSession;

  private spawnClock = 0;
  private challengeTimer = 0;
  private readonly challengeDuration = 1.8;
  private readonly initialSpawnDelay = 3;
  private challengeWindow = this.challengeDuration;
  private challenger = "ゴリラ";
  private taunt = "拳で語れ。";
  private enemyCharacterCursor = 0;
  private hudClock = 0;
  private elapsed = 0;
  private slowMotionTime = 0;
  private readonly bannerNodes: TransformNode[] = [];
  private readonly entryRoarCounts = new Map<EnemyCharacterKey, number>();
  private attackClashRequested = false;
  private clashAuditTriggered = false;
  private started = false;
  private startRequested = false;
  private assetsPrepared = false;
  private paused = false;
  private killCount = 0;
  private combo = 0;
  private comboDecay = 0;
  private cameraShake = 0;
  private lockTarget: BarbarianEnemy | null = null;
  private cameraOrbitOffset = 0;
  private cameraBeta = 1.05;
  private lockAuditClock = 0;
  private lockAuditHudState: boolean | null = null;
  private notice = "";
  private noticeTime = 0;
  private completed = false;
  private result: RunResult | null = null;
  private screenShakeScale = 1;
  private randomState = 0x51f15e;
  private disposed = false;
  private readonly auditTimers: number[] = [];
  private readonly effectPool = new Map<CombatEffectKind, CombatEffect[]>();
  private readonly onCommand = (event: Event) => {
    const detail = (event as CustomEvent<{ command: string; value?: string | number | boolean }>).detail;
    const command = detail?.command;
    if (command === "start") this.start();
    if (command === "pause") this.paused = !this.paused;
    if (command === "restart") {
      requestLocalRetry();
      window.location.reload();
    }
    if (command === "retire") this.finishRun("retired");
    if (command === "top") window.location.assign(import.meta.env.BASE_URL);
    if (command === "shake") this.screenShakeScale = detail.value === "none" ? 0 : detail.value === "weak" ? 0.45 : 1;
  };

  private readonly onAutoPause = () => {
    if (this.started && !this.completed) this.paused = true;
  };

  private readonly onAudioSettings = (event: Event) => {
    const detail = (event as CustomEvent<Partial<import("@/game/CombatAudio").CombatAudioSettings>>).detail;
    if (detail) this.audio.updateSettings(detail);
  };

  private readonly onHapticsSettings = (event: Event) => {
    const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
    if (typeof enabled === "boolean") this.haptics.setEnabled(enabled);
  };

  constructor(scene: Scene, canvas: HTMLCanvasElement, playerName: string) {
    this.scene = scene;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) this.screenShakeScale = 0.3;
    this.input = new InputManager(canvas);
    this.session = new GameSession(playerName);
    this.materials = new ArenaMaterials(scene);
    this.characters = new CharacterLibrary(scene);
    const initialPreload = Promise.all([
      this.characters.preload("goose"),
      this.characters.preload(enemyCharacterKeys[0]),
      this.characters.preload("poop"),
    ]);
    this.audio = new CombatAudio();
    this.haptics = new Haptics();
    this.configureScene();
    this.buildArena();
    this.player = new Player(this, new Vector3(0, 0, 0));
    this.camera = new ArcRotateCamera("arenaCamera", Math.PI, 1.08, 10.5, new Vector3(0, 1.4, 0), scene);
    this.camera.lowerRadiusLimit = 7;
    this.camera.upperRadiusLimit = 18;
    this.camera.lowerBetaLimit = 0.7;
    this.camera.upperBetaLimit = 1.25;
    this.camera.wheelPrecision = 50;
    this.camera.panningSensibility = 0;
    this.camera.checkCollisions = true;
    this.camera.collisionRadius = new Vector3(0.45, 0.45, 0.45);
    this.camera.attachControl(canvas, false);
    this.camera.inputs.clear();
    window.addEventListener("arena-command", this.onCommand);
    window.addEventListener("arena-auto-pause", this.onAutoPause);
    window.addEventListener("arena-audio-settings", this.onAudioSettings);
    window.addEventListener("arena-haptics-settings", this.onHapticsSettings);
    this.startRequested = this.input.isDemo;
    void initialPreload.then((results) => {
      if (this.disposed) return;
      this.assetsPrepared = true;
      if (results.some((ready) => !ready)) this.notify("一部素材を代替表示で開始します", 1.8);
      if (this.startRequested) this.beginRun();
      this.emitHud(1);
    });
    if (this.input.isDemo && runtimeFlags.audioAudit) {
      this.scheduleAudit(() => this.runAudioAudit(), 260);
    }
    if (this.input.isDemo && runtimeFlags.clashAudit) {
      console.info("[ClashAudit] scheduled");
      this.scheduleAudit(() => this.runClashAudit(), 720);
    }
    if (this.input.isDemo && runtimeFlags.combatAudit) {
      this.scheduleAudit(() => this.runCombatAudit(), 720);
    }
    if (this.input.isDemo && runtimeFlags.lockAudit) {
      this.scheduleAudit(() => this.runMouseLookAudit(), 850);
      this.scheduleAudit(() => this.runLockAuditTransition(), 1600);
    }
    if (this.input.isDemo && runtimeFlags.adversarialAudit) {
      this.scheduleAudit(() => this.runPreLethalAudit(), 1100);
    }
    this.emitHud();
  }

  private scheduleAudit(task: () => void, delay: number) {
    const timer = window.setTimeout(() => {
      if (!this.disposed) task();
    }, delay);
    this.auditTimers.push(timer);
  }

  private configureScene() {
    this.scene.collisionsEnabled = true;
    this.scene.clearColor = new Color4(0.018, 0.017, 0.021, 1);
    this.scene.ambientColor = new Color3(0.18, 0.12, 0.08);
    const hemi = new HemisphericLight("ashSky", new Vector3(0.1, 1, 0.15), this.scene);
    hemi.diffuse = Color3.FromHexString("#7C695B");
    hemi.groundColor = Color3.FromHexString("#150D09");
    hemi.intensity = 0.78;
    const key = new DirectionalLight("duskKey", new Vector3(-0.42, -0.8, 0.35), this.scene);
    key.position = new Vector3(18, 24, -16);
    key.diffuse = Color3.FromHexString("#F4B36A");
    key.intensity = 1.55;
  }

  private buildArena() {
    const floor = MeshBuilder.CreateGround("crackedArena", { width: 48, height: 48, subdivisions: 2 }, this.scene);
    floor.material = this.materials.ground;
    floor.checkCollisions = true;

    for (let index = 0; index < 34; index += 1) {
      const theta = (index / 34) * Math.PI * 2;
      const radius = 23;
      const wall = MeshBuilder.CreateBox(`stoneBoundary-${index}`, { width: 2.1, height: 0.72, depth: 1.15 }, this.scene);
      wall.position.set(Math.sin(theta) * radius, 0.32 + (index % 3) * 0.04, Math.cos(theta) * radius);
      wall.rotation.y = theta;
      wall.material = index % 4 === 0 ? this.materials.stoneLight : this.materials.stone;
      wall.checkCollisions = true;
    }

    for (let index = 0; index < 4; index += 1) {
      const theta = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const base = new TransformNode(`banner-${index}`, this.scene);
      base.position.set(Math.sin(theta) * 18.8, 0, Math.cos(theta) * 18.8);
      base.rotation.y = theta + Math.PI / 2;
      const pole = MeshBuilder.CreateCylinder(`bannerPole-${index}`, { height: 5.5, diameter: 0.11, tessellation: 8 }, this.scene);
      pole.parent = base;
      pole.position.y = 2.75;
      pole.material = this.materials.wood;
      const cloth = MeshBuilder.CreatePlane(`bannerCloth-${index}`, { width: 1.4, height: 2.05, sideOrientation: Mesh.DOUBLESIDE }, this.scene);
      cloth.parent = base;
      cloth.position.set(0.65, 4.2, 0);
      cloth.material = this.materials.banner;
      // Animate only the cloth; the pole and its foundation stay rigid.
      this.bannerNodes.push(cloth);
    }

    const braziers = [
      new Vector3(-15.8, 0, -12.4),
      new Vector3(14.8, 0, 13.4),
    ];
    braziers.forEach((position, index) => {
      const pit = MeshBuilder.CreateCylinder(`brazier-${index}`, { height: 0.8, diameterTop: 1.1, diameterBottom: 1.35, tessellation: 10 }, this.scene);
      pit.position = position.add(new Vector3(0, 0.4, 0));
      pit.material = this.materials.iron;
      const flame = MeshBuilder.CreateCylinder(`flame-${index}`, {
        height: 1.05,
        diameterTop: 0.06,
        diameterBottom: 0.64,
        tessellation: 7,
      }, this.scene);
      flame.position = position.add(new Vector3(0, 1.16, 0));
      flame.material = this.materials.fire;
      const light = new PointLight(`fireLight-${index}`, position.add(new Vector3(0, 1.7, 0)), this.scene);
      light.diffuse = Color3.FromHexString("#EA812B");
      light.intensity = 12;
      light.range = 9;
    });
  }

  update(delta: number) {
    if (this.disposed) return;
    // Preserve real-time pacing on a temporarily slow mobile frame while
    // bounding a background-tab resume spike.
    const rawDelta = Math.min(delta, 0.1);
    this.slowMotionTime = Math.max(0, this.slowMotionTime - rawDelta);
    const capped = rawDelta * (this.slowMotionTime > 0 ? 0.3 : 1);
    this.elapsed += capped;
    this.bannerNodes.forEach((cloth, index) => {
      cloth.rotation.z = Math.sin(this.elapsed * 1.65 + index * 1.7) * 0.04;
      cloth.rotation.y = Math.sin(this.elapsed * 2.15 + index * 1.1) * 0.035;
    });

    this.input.update(capped);
    if (this.input.consume("pause")) this.paused = !this.paused;
    if (this.input.consume("restart")) {
      requestLocalRetry();
      window.location.reload();
    }
    if (this.paused || !this.started || this.completed) {
      this.updateCamera(capped);
      this.emitHud(capped);
      return;
    }

    const roundActive = this.enemies.some((enemy) => !enemy.removed && enemy.mode !== "dead" && enemy.mode !== "spawn");
    this.session.tick(capped, roundActive);
    this.noticeTime = Math.max(0, this.noticeTime - capped);
    if (this.noticeTime <= 0) this.notice = "";
    this.player.update(capped);
    if (this.player.mode === "fallen") {
      this.finishRun("defeat");
      this.emitHud(1);
      return;
    }
    const rageReady = this.player.rage >= 100;
    this.enemies.forEach((enemy) => enemy.setRageOutline(rageReady));
    this.challengeTimer = Math.max(0, this.challengeTimer - capped);
    for (const enemy of [...this.enemies]) enemy.update(capped);
    this.effects.forEach((effect) => effect.update(capped));
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      if (this.effects[index].done) {
        const [effect] = this.effects.splice(index, 1);
        this.recycleEffect(effect);
      }
    }
    this.rageTexts.forEach((effect) => effect.update(capped));
    for (let index = this.rageTexts.length - 1; index >= 0; index -= 1) {
      if (this.rageTexts[index].done) this.rageTexts.splice(index, 1);
    }
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      if (this.enemies[index].removed) this.enemies.splice(index, 1);
    }
    const activeEnemies = this.enemies.filter((enemy) => !enemy.removed && enemy.mode !== "dead");
    const roundSpawn = advanceRoundSpawn(activeEnemies.length, this.spawnClock, capped);
    this.spawnClock = roundSpawn.spawnClock;
    if (roundSpawn.shouldSpawn && this.enemyCharacterCursor < enemyCharacterKeys.length) this.spawnEnemy();
    if (this.killCount >= enemyCharacterKeys.length && activeEnemies.length === 0) this.finishRun("victory");
    this.comboDecay -= capped;
    if (this.comboDecay <= 0) this.combo = 0;
    this.cameraShake = Math.max(0, this.cameraShake - capped * 3.8);
    this.updateCamera(capped);
    this.emitHud(capped);
  }

  private updateCamera(delta: number) {
    const look = this.input.consumeLook();
    const adjusted = applyLockCameraLook(this.cameraOrbitOffset, this.cameraBeta, look.x, look.y);
    this.cameraOrbitOffset = adjusted.orbitOffset;
    this.cameraBeta = adjusted.beta;
    this.updateLockTarget();
    const playerForward = forwardFromYaw(this.player.root.rotation.y);
    const playerFocus = this.player.root.position.add(new Vector3(0, 1.45, 0));
    const focus = playerFocus.add(playerForward.scale(1.15));
    const rig = fixedThirdPersonRig(this.player.root.rotation.y);
    if (this.lockTarget) {
      const enemyFocus = this.lockTarget.root.position.add(new Vector3(0, 1.25, 0));
      const lockFocus = Vector3.Lerp(focus, enemyFocus, 0.35);
      const fighterDistance = Vector3.Distance(this.player.root.position, this.lockTarget.root.position);
      const desiredRadius = clamp(8.8 + fighterDistance * 0.28, 9.2, 14.5);
      this.camera.target = Vector3.Lerp(this.camera.target, lockFocus, clamp(delta * 10, 0, 1));
      this.camera.radius += (desiredRadius - this.camera.radius) * clamp(delta * 8, 0, 1);
      this.camera.alpha = lerpAngle(this.camera.alpha, rig.alpha + this.cameraOrbitOffset, clamp(delta * 10, 0, 1));
      this.camera.beta += (this.cameraBeta - this.camera.beta) * clamp(delta * 10, 0, 1);
      this.lockAuditClock -= delta;
      if (this.lockAuditClock <= 0 && this.input.isDemo && runtimeFlags.lockAudit) {
        this.lockAuditClock = 0.5;
        console.info("[LockAudit] camera lockOn=true target=%s base=player-back orbitOffset=%s beta=%s radius=%s cameraTarget=(%s,%s,%s) lockFocus=(%s,%s,%s)", this.lockTarget.variant, this.cameraOrbitOffset.toFixed(3), this.camera.beta.toFixed(3), this.camera.radius.toFixed(2), this.camera.target.x.toFixed(2), this.camera.target.y.toFixed(2), this.camera.target.z.toFixed(2), lockFocus.x.toFixed(2), lockFocus.y.toFixed(2), lockFocus.z.toFixed(2));
        window.dispatchEvent(new CustomEvent("arena-lock-audit", { detail: { lockOn: true, target: this.lockTarget.variant, orbitOffset: this.cameraOrbitOffset, beta: this.camera.beta, radius: this.camera.radius, cameraTarget: this.camera.target.clone(), lockFocus } }));
      }
    } else {
      this.camera.target = Vector3.Lerp(this.camera.target, focus, clamp(delta * 10, 0, 1));
      this.camera.radius += (rig.radius - this.camera.radius) * clamp(delta * 10, 0, 1);
      this.camera.alpha = lerpAngle(this.camera.alpha, rig.alpha + this.cameraOrbitOffset, clamp(delta * 10, 0, 1));
      this.camera.beta += (this.cameraBeta - this.camera.beta) * clamp(delta * 10, 0, 1);
    }
    if (this.cameraShake > 0 && this.screenShakeScale > 0) {
      this.camera.inertialAlphaOffset += Math.sin(this.elapsed * 63) * this.cameraShake * 0.006 * this.screenShakeScale;
      this.camera.inertialBetaOffset += Math.cos(this.elapsed * 53) * this.cameraShake * 0.004 * this.screenShakeScale;
    }
  }

  private updateLockTarget() {
    const candidate = this.enemies.find((enemy) => !enemy.removed && enemy.mode !== "dead" && enemy.mode !== "spawn") ?? null;
    if (candidate === this.lockTarget) return;
    this.lockTarget = candidate;
    if (this.input.isDemo && runtimeFlags.lockAudit) {
      const state = candidate ? `acquired target=${candidate.variant}` : "released reason=dead-or-intermission";
      console.info(`[LockAudit] ${state}`);
      window.dispatchEvent(new CustomEvent("arena-lock-audit", { detail: { lockOn: candidate !== null, target: candidate?.variant ?? null, reason: candidate ? "spawned" : "dead-or-intermission" } }));
    }
  }

  random() {
    this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 0x1_0000_0000;
  }

  private nextEnemyCharacter(): EnemyCharacterKey | null {
    const variant = enemyCharacterKeys[this.enemyCharacterCursor];
    if (!variant) return null;
    this.enemyCharacterCursor += 1;
    return variant;
  }

  spawnEnemy(delay = 0) {
    const variant = this.nextEnemyCharacter();
    if (!variant) return;
    const theta = this.elapsed * 0.66 + this.enemies.length * 2.4 + this.random() * 0.75;
    const radius = 17.5 + this.random() * 2.4;
    const enemy = new BarbarianEnemy(this, new Vector3(Math.sin(theta) * radius, 0, Math.cos(theta) * radius), delay, variant);
    this.enemies.push(enemy);
    const nextPreload = enemyCharacterKeys[this.enemyCharacterCursor] ?? null;
    if (nextPreload) void this.characters.preload(nextPreload);
    this.challengeTimer = 0;
    if (this.input.isDemo && runtimeFlags.adversarialAudit) {
      console.info("[AdversarialAudit] challengeVisible=false spawned=%s", enemy.variant);
    }
  }

  enemiesNear(position: Vector3, radius: number) {
    return this.enemies.filter((enemy) => !enemy.removed && enemy.mode !== "dead" && Vector3.DistanceSquared(enemy.root.position, position) < radius * radius);
  }

  separationFor(target: BarbarianEnemy) {
    const force = Vector3.Zero();
    for (const other of this.enemies) {
      if (other === target || other.removed || other.mode === "dead") continue;
      const delta = target.root.position.subtract(other.root.position);
      const distance = delta.length();
      if (distance > 0.01 && distance < 1.15) force.addInPlace(delta.normalize().scale((1.15 - distance) * 0.9));
    }
    return force;
  }

  hitEnemies(origin: Vector3, forward: Vector3, range: number, arcDot: number, damage: number, knockback: number, sound: "hit" | "heavy" = "hit", target: HitLocation = "torso", move?: AttackMove) {
    let hitCount = 0;
    let clashTriggered = false;
    const effectiveRange = target === "heart" ? range * 0.9 : target === "head" ? range * 0.95 : range;
    const effectiveArcDot = target === "heart" ? Math.max(0.42, arcDot) : target === "head" ? Math.max(0.18, arcDot) : arcDot;
    for (const enemy of this.enemies) {
      if (enemy.removed || enemy.mode === "dead") continue;
      const targetPoint = enemy.targetPoint(target);
      const attackHeight = target === "head" ? 2.12 : target === "heart" ? 1.52 : 1.2;
      const strikeOrigin = origin.add(new Vector3(0, attackHeight, 0));
      const offset = targetPoint.subtract(strikeOrigin);
      const horizontal = new Vector3(offset.x, 0, offset.z);
      const distance = horizontal.length();
      if (distance > effectiveRange || distance < 0.1) continue;
      const direction = horizontal.normalize();
      if (Vector3.Dot(forward, direction) < effectiveArcDot) continue;
      const right = new Vector3(forward.z, 0, -forward.x);
      const hitRadius = enemy.targetRadius(target);
      if (Math.abs(offset.y) > hitRadius || Math.abs(Vector3.Dot(horizontal, right)) > hitRadius) continue;
      if (this.player.isAttackClashActive() && enemy.isAttackClashActive()) {
        enemy.cancelAttackForClash();
        this.requestAttackClash();
        if (!clashTriggered) {
          clashTriggered = true;
          this.triggerAttackClash(Vector3.Lerp(this.player.root.position, enemy.root.position, 0.5));
        }
        continue;
      }
      const resolved = enemy.takeTargetedDamage(damage, direction.scale(knockback), target, move);
      this.session.recordHit(resolved, move?.name ?? `${sound}-${target}`);
      const impactKind = resolved.location === "heart" ? "heart" : resolved.location === "head" ? "head" : damage > 2 ? "heavy" : "light";
      this.spawnEffect(targetPoint, impactKind);
      this.audio.playHit(resolved.location, sound === "heavy" ? 1.24 : 0.92);
      this.haptics.triggerHit(resolved.location);
      this.notify(
        target === "heart" && !resolved.heartConfirmed
          ? "心臓はまだ狙えない・胴体命中"
          : target === "head" && resolved.location !== "head"
            ? "頭部をかわされた・胴体命中"
          : resolved.location === "heart"
            ? "心臓命中 +300"
            : resolved.location === "head"
              ? "頭部命中・尊厳ダメージ"
              : "胴体命中",
        0.65,
      );
      hitCount += 1;
    }
    if (hitCount > 0) {
      this.combo += hitCount;
      this.comboDecay = 2.2;
      this.cameraShake = Math.min(1, this.cameraShake + 0.35 + hitCount * 0.05);
      this.player.addRage(hitCount * (damage > 2 ? 10 : 6));
    }
    return hitCount;
  }

  isStarted() {
    return this.started;
  }

  start() {
    this.audio.unlock();
    if (this.started || this.startRequested) return;
    this.startRequested = true;
    if (!this.assetsPrepared) {
      this.notify("ガチョウと最初の対戦相手を準備中", 1.2);
      return;
    }
    this.beginRun();
  }

  private beginRun() {
    if (this.started) return;
    this.started = true;
    const openingDelay = this.input.isDemo ? -1 : this.initialSpawnDelay;
    this.spawnClock = openingDelay;
    this.challengeTimer = Math.max(0, openingDelay);
    this.challengeWindow = Math.max(0, openingDelay);
    const initialVariant = enemyCharacterKeys[this.enemyCharacterCursor] ?? enemyCharacterKeys[0];
    this.challenger = challengerNames[initialVariant];
    this.taunt = enemyPresentations[initialVariant].taunt;
    if (this.input.isDemo) this.spawnEnemy(-1);
  }

  movementDirection(move: Vector2) {
    if (move.lengthSquared() < 0.002) return Vector3.Zero();
    if (this.lockTarget) {
      const toward = this.lockTarget.root.position.subtract(this.player.root.position);
      toward.y = 0;
      if (toward.lengthSquared() > 0.001) {
        toward.normalize();
        const right = new Vector3(toward.z, 0, -toward.x);
        return toward.scale(move.y).add(right.scale(move.x)).normalize();
      }
    }
    const cameraForward = new Vector3(Math.sin(-this.camera.alpha - Math.PI / 2), 0, Math.cos(-this.camera.alpha - Math.PI / 2));
    const cameraRight = new Vector3(cameraForward.z, 0, -cameraForward.x);
    return cameraForward.scale(move.y).add(cameraRight.scale(move.x)).normalize();
  }

  currentTarget() {
    return this.lockTarget;
  }

  notify(message: string, seconds = 1.1) {
    this.notice = message;
    this.noticeTime = seconds;
  }

  private runMouseLookAudit() {
    console.info("[LockAudit] mouse look input begin dx=180 dy=-160");
    window.dispatchEvent(new CustomEvent("arena-mouse-look-audit", { detail: { dx: 180, dy: -160 } }));
  }

  private runPreLethalAudit() {
    const enemy = this.enemies.find((candidate) => !candidate.removed && candidate.mode !== "dead");
    if (!enemy) {
      console.info("[AdversarialAudit] prelethal skipped: no active enemy");
      return;
    }
    enemy.setHealthForAudit(1);
    console.info("[AdversarialAudit] prelethal target=%s health=%s", enemy.variant, enemy.healthValue());
    enemy.takeDamage(1, Vector3.Zero());
  }

  private runLockAuditTransition() {
    const enemy = this.enemies.find((candidate) => !candidate.removed && candidate.mode !== "dead");
    if (!enemy) return;
    console.info("[LockAudit] transition begin defeat=%s", enemy.variant);
    enemy.takeDamage(999, Vector3.Zero());
  }

  private runCombatAudit() {
    const enemy = this.enemies.find((candidate) => !candidate.removed && candidate.mode !== "dead");
    if (!enemy) return;
    const forward = forwardFromYaw(this.player.root.rotation.y);
    enemy.root.position.copyFrom(this.player.root.position.add(forward.scale(2.7)));
    enemy.prepareStrikeAudit();
    this.player.prepareGuardAudit();
    const guardResult = this.player.receiveAuditStrike(enemy);
    this.player.startCounterAudit();
    console.info("[CombatAudit] guard-vs-strike result=%s playerHealth=%s enemyHealth=%s", guardResult, Math.ceil(this.player.health), Math.ceil(enemy.healthValue()));
  }

  private runClashAudit() {
    if (this.clashAuditTriggered) return;
    const enemy = this.enemies.find((candidate) => !candidate.removed && candidate.mode !== "dead");
    if (!enemy) {
      console.info("[ClashAudit] skipped: no active enemy");
      return;
    }
    this.clashAuditTriggered = true;
    const forward = forwardFromYaw(this.player.root.rotation.y);
    enemy.root.position.copyFrom(this.player.root.position.add(forward.scale(2.7)));
    enemy.prepareAttackClashAudit();
    this.player.prepareAttackClashAudit();
    console.info("[ClashAudit] prepared playerHealth=%s enemyHealth=%s", Math.ceil(this.player.health), Math.ceil(enemy.healthValue()));
  }

  private runAudioAudit() {
    const variants: EnemyCharacterKey[] = ["bear", "crocodile", "gorilla", "hippopotamus", "lion", "rhinoceros"];
    const pans = [-1, -0.5, 0, 0.5, 1, -0.25];
    variants.forEach((variant, index) => {
      const pan = pans[index];
      this.audio.playEnemyEntry(variant, 0.82, pan);
      this.recordEnemyEntryRoar(variant, pan);
    });
  }

  entryPanFor(position: Vector3) {
    const offset = position.subtract(this.player.root.position);
    const horizontal = new Vector3(offset.x, 0, offset.z);
    if (horizontal.lengthSquared() < 0.01) return 0;
    const forward = forwardFromYaw(this.player.root.rotation.y);
    const right = new Vector3(forward.z, 0, -forward.x);
    return clamp(Vector3.Dot(horizontal.normalize(), right), -1, 1);
  }

  requestAttackClash() {
    this.attackClashRequested = true;
  }

  consumeAttackClash() {
    const requested = this.attackClashRequested;
    this.attackClashRequested = false;
    return requested;
  }

  triggerAttackClash(position: Vector3) {
    this.haptics.trigger("clash");
    this.audio.playClash(1.15);
    this.session.recordClash();
    if (this.input.isDemo && runtimeFlags.clashAudit) {
      const comboBefore = this.combo;
      const rageBefore = this.player.rage;
      console.info("[ClashAudit] ATTACK CLASH — CANCEL! damage=0 playerHealth=%s enemyDamage=0 comboBefore=%s comboAfter=%s rageBefore=%s rageAfter=%s", Math.ceil(this.player.health), comboBefore, this.combo, Math.ceil(rageBefore), Math.ceil(this.player.rage));
      window.dispatchEvent(new CustomEvent("arena-attack-clash", { detail: { damage: 0, playerHealth: this.player.health, enemyDamage: 0, comboBefore, comboAfter: this.combo, rageBefore, rageAfter: this.player.rage } }));
    }
    this.slowMotionTime = Math.max(this.slowMotionTime, 0.16);
    this.addCameraShake(0.62);
    this.player.routeLabel = "ATTACK CLASH — CANCEL!";
    this.spawnEffect(position.add(new Vector3(0, 1.05, 0)), "clash");
  }

  recordEnemyEntryRoar(variant: EnemyCharacterKey, pan: number) {
    const count = (this.entryRoarCounts.get(variant) ?? 0) + 1;
    this.entryRoarCounts.set(variant, count);
    if (this.input.isDemo && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("arena-entry-roar", { detail: createEntryRoarTelemetry(variant, count, pan, this.audio.reverbEnabled()) }));
    }
  }

  entryRoarCount(variant: EnemyCharacterKey) {
    return this.entryRoarCounts.get(variant) ?? 0;
  }

  onEnemyDefeated(enemy: BarbarianEnemy) {
    this.haptics.trigger("heavy");
    this.killCount += 1;
    this.session.recordEnemyDefeat(this.killCount - 1, enemy.scoreMultiplier());
    this.combo += 1;
    this.comboDecay = 2.4;
    this.player.addRage(14);
    const hasNext = this.killCount < enemyCharacterKeys.length;
    this.spawnClock = hasNext ? this.challengeDuration : 0;
    this.challengeTimer = hasNext ? this.challengeDuration : 0;
    this.challengeWindow = hasNext ? this.challengeDuration : 0;
    if (this.input.isDemo && runtimeFlags.adversarialAudit) {
      console.info("[AdversarialAudit] challengeVisible=true defeated=%s", enemy.variant);
    }
    const nextVariant = enemyCharacterKeys[this.enemyCharacterCursor];
    if (nextVariant) {
      this.challenger = challengerNames[nextVariant];
      this.taunt = enemyPresentations[nextVariant].taunt;
      void this.characters.preload(nextVariant);
    }
    this.spawnEffect(enemy.root.position.add(new Vector3(0, 0.4, 0)), "heavy");
  }

  finishRun(reason: "victory" | "defeat" | "retired") {
    if (this.completed) return;
    this.completed = true;
    this.paused = false;
    this.result = this.session.finish(reason, this.player.health, this.player.dignity.value, Math.min(6, this.killCount + 1));
    this.audio.playResult(reason, 1.12);
    this.haptics.trigger(reason === "victory" ? "victory" : "defeat");
    this.emitHud(1);
  }

  addCameraShake(amount: number) {
    this.cameraShake = Math.min(1.1, this.cameraShake + amount);
  }

  triggerJustGuard(position: Vector3) {
    this.haptics.trigger("justGuard");
    this.audio.playJustGuard(1.1);
    this.session.recordJustGuard();
    if (this.input.isDemo && runtimeFlags.combatAudit) console.info("[CombatAudit] just guard started");
    this.slowMotionTime = Math.max(this.slowMotionTime, 0.18);
    this.addCameraShake(0.72);
    this.spawnEffect(position.add(new Vector3(0, 1.2, 0)), "guard");
  }

  triggerRageBurst(position: Vector3) {
    this.haptics.trigger("rage");
    this.audio.playRage(1.35);
    this.slowMotionTime = Math.max(this.slowMotionTime, 0.12);
    this.addCameraShake(1.05);
    this.spawnEffect(position.add(new Vector3(0, 0.28, 0)), "heavy");
    this.burstRageText(position.add(new Vector3(0, 1.1, 0)), 6, 1.24);
  }

  triggerDignityLoss(position: Vector3, playerSide: boolean) {
    this.slowMotionTime = Math.max(this.slowMotionTime, 0.22);
    this.addCameraShake(0.8);
    this.audio.playDignityLoss(0.95);
    this.haptics.triggerDignityLoss();
    this.camera.radius = Math.max(this.camera.lowerRadiusLimit ?? 7, this.camera.radius - 0.9);
    this.notify(playerSide ? "尊厳喪失・怒気獲得上昇" : "敵の尊厳を奪った", 1.65);
    this.spawnEffect(position.add(new Vector3(0, 2.05, 0)), "head");
  }

  burstRageText(position: Vector3, count: number, scale = 1) {
    const limitedCount = Math.max(0, Math.min(6, Math.floor(count)));
    for (let index = 0; index < limitedCount; index += 1) {
      const theta = (index / limitedCount) * Math.PI * 2 + this.random() * 0.24;
      const speed = 1.4 + this.random() * 2.5;
      this.rageTexts.push(new RageTextEffect(this.scene, position, new Vector3(Math.cos(theta) * speed, 1.9 + this.random() * 2.2, Math.sin(theta) * speed), scale * (0.72 + this.random() * 0.62), index));
    }
  }

  spawnEffect(position: Vector3, kind: CombatEffectKind) {
    const available = this.effectPool.get(kind) ?? [];
    const effect = available.pop() ?? new CombatEffect(this.scene, kind, this.materials);
    this.effectPool.set(kind, available);
    effect.reset(position);
    this.effects.push(effect);
  }

  private recycleEffect(effect: CombatEffect) {
    const available = this.effectPool.get(effect.kind) ?? [];
    if (available.length < 12) available.push(effect);
    else effect.dispose();
    this.effectPool.set(effect.kind, available);
  }

  clampToArena(position: Vector3) {
    const radial = new Vector2(position.x, position.z);
    if (radial.length() > ARENA_RADIUS) {
      radial.normalize().scaleInPlace(ARENA_RADIUS);
      position.x = radial.x;
      position.z = radial.y;
    }
  }

  private emitHud(delta = 1) {
    this.hudClock -= delta;
    if (this.hudClock > 0) return;
    this.hudClock = 0.1;
    const activeEnemy = this.enemies.find((enemy) => !enemy.removed && enemy.mode !== "dead") ?? null;
    const detail: HudPayload = {
      health: Math.ceil(this.player.health),
      playerHealth: Math.ceil(this.player.health),
      playerMaxHealth: DEFAULT_COMBAT_BALANCE.player.maxHealth,
      rage: Math.ceil(this.player.rage),
      kills: this.killCount,
      combo: this.session.score.combo,
      enemies: this.enemies.filter((enemy) => !enemy.removed && enemy.mode !== "dead").length,
      route: this.player.routeLabel,
      started: this.started,
      paused: this.paused,
      fallen: this.player.mode === "fallen",
      challengeVisible: this.challengeTimer > 0 && this.started && !this.completed,
      challenger: this.challenger,
      taunt: this.taunt,
      challengeProgress: this.challengeWindow > 0 ? 1 - this.challengeTimer / this.challengeWindow : 1,
      lockOn: this.lockTarget !== null,
      playerName: this.session.playerName,
      dignity: this.player.dignity.value,
      playerDignity: this.player.dignity.value,
      playerMaxDignity: this.player.dignity.max,
      enemyCount: this.enemies.filter((enemy) => !enemy.removed && enemy.mode !== "dead").length,
      enemyHealth: activeEnemy?.healthValue() ?? 0,
      enemyMaxHealth: activeEnemy?.maxHealthValue() ?? 0,
      enemyDignity: activeEnemy?.dignityValue() ?? 0,
      enemyMaxDignity: 100,
      enemyName: activeEnemy?.displayName() ?? this.challenger,
      round: Math.min(enemyCharacterKeys.length, this.killCount + 1),
      totalRounds: enemyCharacterKeys.length,
      roundTotal: enemyCharacterKeys.length,
      score: Math.round(this.session.score.total),
      elapsed: this.session.score.elapsed,
      elapsedSeconds: this.session.score.elapsed,
      dodgeCooldown: this.player.dodgeCooldown,
      dodgeReady: this.player.dodgeCooldown <= 0,
      aimTarget: this.player.aimTarget,
      heartOpen: activeEnemy?.heartIsOpen() ?? false,
      lockTarget: activeEnemy?.displayName() ?? null,
      notice: this.notice,
      guardBreak: this.player.guardBreak,
      counterReady: this.player.counterReady(),
      loadState: this.assetsPrepared ? "ready" : "loading",
      intermission: this.challengeTimer > 0 && this.started && !this.completed,
      intermissionRemaining: Math.max(0, this.challengeTimer),
      result: this.result,
    };
    if (this.input.isDemo && runtimeFlags.lockAudit && this.lockAuditHudState !== detail.lockOn) {
      this.lockAuditHudState = detail.lockOn;
      console.info(`[LockAudit] hud lockOn=${detail.lockOn ? "true" : "false"}`);
    }
    window.dispatchEvent(new CustomEvent("arena-hud", { detail }));
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.auditTimers.forEach((timer) => window.clearTimeout(timer));
    this.auditTimers.length = 0;
    window.removeEventListener("arena-command", this.onCommand);
    window.removeEventListener("arena-auto-pause", this.onAutoPause);
    window.removeEventListener("arena-audio-settings", this.onAudioSettings);
    window.removeEventListener("arena-haptics-settings", this.onHapticsSettings);
    this.input.dispose();
    this.effects.forEach((effect) => effect.dispose());
    this.effectPool.forEach((effects) => effects.forEach((effect) => effect.dispose()));
    this.effectPool.clear();
    this.rageTexts.forEach((effect) => effect.dispose());
    this.enemies.forEach((enemy) => enemy.dispose());
    this.player.dispose();
    this.characters.dispose();
    this.audio.dispose();
    this.materials.dispose();
  }
}

class ArenaMaterials {
  readonly ground: StandardMaterial;
  readonly stone: StandardMaterial;
  readonly stoneLight: StandardMaterial;
  readonly wood: StandardMaterial;
  readonly banner: StandardMaterial;
  readonly iron: StandardMaterial;
  readonly fire: StandardMaterial;
  readonly playerCloth: StandardMaterial;
  readonly playerStone: StandardMaterial;
  readonly playerBronze: StandardMaterial;
  readonly enemySkin: StandardMaterial;
  readonly enemyLeather: StandardMaterial;
  readonly enemyFur: StandardMaterial;
  readonly enemyBronze: StandardMaterial;
  readonly enemyIron: StandardMaterial;
  readonly warning: StandardMaterial;
  readonly impact: StandardMaterial;
  readonly heart: StandardMaterial;
  readonly dignity: StandardMaterial;
  readonly dust: StandardMaterial;
  readonly shadow: StandardMaterial;
  private readonly owned: StandardMaterial[] = [];

  constructor(scene: Scene) {
    const isTouchMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 680px) and (pointer: coarse)").matches;
    const pcTextureQuality = !isTouchMobile;
    scene.metadata = { ...(scene.metadata ?? {}), textureQuality: pcTextureQuality ? "pc-high-density" : "mobile-balanced" };
    const applyTextureQuality = (texture: Texture, uScale: number, vScale: number) => {
      texture.uScale = uScale;
      texture.vScale = vScale;
      texture.anisotropicFilteringLevel = pcTextureQuality ? 8 : 2;
      texture.level = pcTextureQuality ? 1 : 0.42;
    };
    const make = (name: string, color: string, specular = "#000000") => {
      const material = new StandardMaterial(name, scene);
      material.diffuseColor = Color3.FromHexString(color);
      material.specularColor = Color3.FromHexString(specular);
      material.backFaceCulling = false;
      this.owned.push(material);
      return material;
    };
    this.ground = make("crackedEarth", "#6D4022");
    const groundTexture = new Texture(arenaAssets.groundTile, scene, true, false);
    applyTextureQuality(groundTexture, 9.5, 9.5);
    this.ground.diffuseTexture = groundTexture;
    this.ground.specularColor = Color3.FromHexString("#1B0F08");
    this.stone = make("blackStone", "#302A27", "#161313");
    this.stoneLight = make("paleStone", "#685849", "#2C251E");
    this.wood = make("charredWood", "#2B1810", "#120A06");
    this.banner = make("crimsonBanner", "#6D1217", "#331012");
    this.iron = make("coldIron", "#24272B", "#50545A");
    this.fire = make("braziersFire", "#E66B1C");
    this.fire.emissiveColor = Color3.FromHexString("#F08B29");
    this.playerCloth = make("playerCloth", "#303840", "#242C32");
    this.playerStone = make("playerStone", "#B1B8B3", "#666E68");
    this.playerBronze = make("playerBronze", "#B56B2B", "#E4A45C");
    this.enemySkin = make("barbarianSkin", "#A66B45", "#4D281A");
    this.enemyLeather = make("barbarianSurface", "#B77B4D", "#4B2C18");
    const enemyTexture = new Texture(arenaAssets.barbarianSurface, scene, true, false);
    applyTextureQuality(enemyTexture, 1.5, 1.5);
    this.enemyLeather.diffuseTexture = enemyTexture;
    this.enemyFur = make("barbarianFur", "#4A2F22", "#120B08");
    this.enemyBronze = make("barbarianBronze", "#B87539", "#E4A45C");
    this.enemyIron = make("barbarianIron", "#2A2E30", "#5B6062");
    this.warning = make("warning", "#D5402C");
    this.warning.emissiveColor = Color3.FromHexString("#A92B24");
    this.warning.alpha = 0.6;
    this.impact = make("impact", "#F9C46C");
    this.impact.emissiveColor = Color3.FromHexString("#EF9D3A");
    this.impact.alpha = 0.9;
    this.heart = make("heartImpact", "#FF253E");
    this.heart.emissiveColor = Color3.FromHexString("#D70F2B");
    this.heart.alpha = 0.92;
    this.dignity = make("dignityFragments", "#EBC77B");
    this.dignity.emissiveColor = Color3.FromHexString("#8D5A20");
    this.dignity.alpha = 0.88;
    this.dust = make("arenaDust", "#7A4C2A");
    this.dust.alpha = 0.42;
    this.shadow = make("fighterShadow", "#070504");
    this.shadow.alpha = 0.34;
    this.shadow.disableLighting = true;
  }

  dispose() {
    this.owned.forEach((material) => material.dispose());
  }
}

class Player {
  readonly root: TransformNode;
  private readonly torso: Mesh;
  private readonly weaponPivot: TransformNode;
  private readonly weapon: Mesh;
  private readonly shoulder: Mesh;
  private readonly fallbackMeshes: Mesh[] = [];
  private characterVisual: TransformNode | null = null;
  private characterAnimator: CharacterAnimator | null = null;
  mode: PlayerMode = "idle";
  health = 100;
  rage = 0;
  dignity: DignityState = createDignityState();
  aimTarget: HitLocation = "torso";
  dodgeCooldown = 0;
  guardBreak = 0;
  routeLabel = "FIND THE OPENING";
  private attack: Attack | null = null;
  private dodgeTime = 0;
  private dodgeVelocity = Vector3.Zero();
  private afterDodgeWindow = 0;
  private afterClashWindow = 0;
  private hurtCooldown = 0;
  private motionClock = 0;
  private guardTime = 0;
  private justGuardTime = 0;
  private counterWindow = 0;
  private animationTestClock = 0;
  private attackSequence = 0;
  private poopTransformed = false;
  private dustClock = 0;

  constructor(private readonly world: GameWorld, position: Vector3) {
    this.root = new TransformNode("blockyPlayer", world.scene);
    this.root.position.copyFrom(position);
    this.root.rotation.y = Math.PI;
    const { scene, materials } = world;
    const shadow = MeshBuilder.CreateDisc("playerFootShadow", { radius: 0.72, tessellation: 20, sideOrientation: Mesh.DOUBLESIDE }, scene);
    shadow.parent = this.root;
    shadow.position.y = 0.018;
    shadow.rotation.x = Math.PI / 2;
    shadow.scaling.z = 0.62;
    shadow.material = materials.shadow;
    const legs = MeshBuilder.CreateBox("playerLegs", { width: 0.74, height: 0.58, depth: 0.46 }, scene);
    legs.parent = this.root;
    legs.position.y = 0.3;
    legs.material = materials.playerCloth;
    this.fallbackMeshes.push(legs);
    this.torso = MeshBuilder.CreateBox("playerTorso", { width: 0.92, height: 1.05, depth: 0.52 }, scene);
    this.torso.parent = this.root;
    this.torso.position.y = 1.08;
    this.torso.material = materials.playerStone;
    this.fallbackMeshes.push(this.torso);
    const head = MeshBuilder.CreateBox("playerHead", { width: 0.57, height: 0.57, depth: 0.57 }, scene);
    head.parent = this.root;
    head.position.y = 1.9;
    head.material = materials.playerStone;
    this.fallbackMeshes.push(head);
    this.shoulder = MeshBuilder.CreateBox("playerShoulder", { width: 1.18, height: 0.3, depth: 0.62 }, scene);
    this.shoulder.parent = this.root;
    this.shoulder.position.y = 1.55;
    this.shoulder.material = materials.playerBronze;
    this.fallbackMeshes.push(this.shoulder);
    const armLeft = MeshBuilder.CreateBox("playerArmLeft", { width: 0.26, height: 0.76, depth: 0.26 }, scene);
    armLeft.parent = this.root;
    armLeft.position.set(-0.67, 1.24, 0);
    armLeft.material = materials.playerStone;
    this.fallbackMeshes.push(armLeft);
    this.weaponPivot = new TransformNode("playerWeaponPivot", scene);
    this.weaponPivot.parent = this.root;
    this.weaponPivot.position.set(0.68, 1.44, 0.05);
    const armRight = MeshBuilder.CreateBox("playerArmRight", { width: 0.26, height: 0.76, depth: 0.26 }, scene);
    armRight.parent = this.weaponPivot;
    armRight.position.y = -0.27;
    armRight.material = materials.playerStone;
    this.fallbackMeshes.push(armRight);
    this.weapon = MeshBuilder.CreateBox("blockBlade", { width: 0.18, height: 1.52, depth: 0.22 }, scene);
    this.weapon.parent = this.weaponPivot;
    this.weapon.position.set(0, -1.0, 0.07);
    this.weapon.material = materials.playerBronze;
    this.fallbackMeshes.push(this.weapon);
    world.characters.attach("goose", this.root, 0.84, (visual, animator) => {
      this.characterVisual = visual;
      this.characterAnimator = animator;
      this.playCharacterMotion("idle", true);
    });
    if (world.input.isDemo) this.rage = 100;
  }

  update(delta: number) {
    this.motionClock += delta;
    this.dustClock = Math.max(0, this.dustClock - delta);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - delta);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta);
    this.afterDodgeWindow = Math.max(0, this.afterDodgeWindow - delta);
    this.afterClashWindow = Math.max(0, this.afterClashWindow - delta);
    if (this.mode !== "guard") this.guardBreak = Math.max(0, this.guardBreak - delta * 10);
    if (runtimeFlags.animationTest) {
      this.updateAnimationTest(delta);
      return;
    }
    if (this.mode === "fallen") {
      this.root.rotation.z = Math.min(1.35, this.root.rotation.z + delta * 2.8);
      this.playCharacterMotion("dead");
      return;
    }
    const clashAudit = this.world.input.isDemo && runtimeFlags.clashAudit;
    const combatAudit = this.world.input.isDemo && runtimeFlags.combatAudit;
    const demoGuardTarget = this.world.input.isDemo && !clashAudit && !combatAudit
      ? this.world.enemies.find((enemy) => enemy.requiresJustGuard && Vector3.DistanceSquared(enemy.root.position, this.root.position) < 10.5)
      : undefined;
    if (demoGuardTarget && this.attack) {
      this.attack = null;
      this.mode = "idle";
    }
    if (demoGuardTarget && !this.attack && this.mode !== "guard" && this.mode !== "dodge") this.beginGuard();
    if (this.counterWindow > 0) {
      this.counterWindow -= delta;
      if (this.counterWindow <= 0 && !this.attack) this.routeLabel = "FIND THE OPENING";
    }
    if (!this.attack && this.mode !== "dodge" && this.world.input.consume("aim")) {
      this.aimTarget = this.aimTarget === "torso" ? "head" : this.aimTarget === "head" ? "heart" : "torso";
      this.routeLabel = `狙い：${targetLabel(this.aimTarget)}`;
    }
    if (!this.attack && this.mode !== "dodge" && this.rage >= 100 && this.world.input.consume("rage")) this.beginMusou();
    if (this.world.input.isDemo && runtimeFlags.autoMusou && this.rage >= 100 && !this.attack && this.mode !== "dodge") this.beginMusou();
    const dodgeCancelable = !this.attack || this.attack.time >= this.scaledMoveTime(this.attack.move.dodgeCancelAt);
    if (this.dodgeCooldown <= 0 && this.mode !== "dodge" && dodgeCancelable && this.world.input.consume("dodge")) {
      this.attack = null;
      const rawMove = this.world.input.movement();
      this.dodgeVelocity = this.world.movementDirection(rawMove.lengthSquared() > 0.02 ? rawMove : new Vector2(0, -1));
      this.mode = "dodge";
      this.dodgeTime = 0.32;
      this.dodgeCooldown = 0.82;
      this.afterDodgeWindow = 0.95;
    }
    const guardCancelable = !this.attack || this.attack.time >= this.scaledMoveTime(this.attack.move.guardCancelAt);
    if (this.mode !== "dodge" && guardCancelable && this.world.input.consume("guard")) {
      this.attack = null;
      this.beginGuard();
    }
    const heavyChainOpen = this.attack?.kind === "light"
      && this.attack.time >= this.scaledMoveTime(this.attack.move.chainOpen)
      && this.attack.time <= this.scaledMoveTime(this.attack.move.chainClose);
    const heavyAcceptable = this.counterWindow > 0 && !this.attack && this.mode !== "dodge"
      || heavyChainOpen
      || !this.attack && this.mode !== "dodge";
    if (heavyAcceptable && this.world.input.peekAttack() === "heavy" && this.world.input.consumeAttack("heavy")) {
      if (this.counterWindow > 0 && !this.attack && this.mode !== "dodge") {
        this.beginCounter();
      } else if (heavyChainOpen && this.attack?.kind === "light") {
        this.attack.queued = "heavy";
      } else if (!this.attack && this.mode !== "dodge") {
        this.beginAttack("heavy", 0);
      }
    }
    if (this.world.input.isDemo && this.counterWindow > 0 && !this.attack && this.mode !== "dodge") this.beginCounter();
    const lightChainOpen = this.attack?.kind === "light"
      && this.attack.time >= this.scaledMoveTime(this.attack.move.chainOpen)
      && this.attack.time <= this.scaledMoveTime(this.attack.move.chainClose);
    if ((lightChainOpen || !this.attack && this.mode !== "dodge") && this.world.input.peekAttack() === "light" && this.world.input.consumeAttack("light")) {
      if (lightChainOpen && this.attack?.kind === "light") {
        this.attack.queued = "light";
      } else if (!this.attack && this.mode !== "dodge") {
        this.beginAttack("light", 1);
      }
    }

    let move = this.world.input.movement();
    let demoTarget: BarbarianEnemy | undefined;
    if (this.world.input.isDemo) {
      demoTarget = this.world.enemies
        .filter((enemy) => !enemy.removed && enemy.mode !== "dead")
        .sort((a, b) => Vector3.DistanceSquared(a.root.position, this.root.position) - Vector3.DistanceSquared(b.root.position, this.root.position))[0];
      if (demoTarget) {
        const toward = demoTarget.root.position.subtract(this.root.position);
        const distance = Math.hypot(toward.x, toward.z);
        move = distance > 2.7 ? new Vector2(toward.x / distance, toward.z / distance) : Vector2.Zero();
      }
    }
    if (this.mode === "guard") {
      if (!this.world.input.isHeld("guard")) this.guardTime -= delta;
      this.justGuardTime = Math.max(0, this.justGuardTime - delta);
      this.weaponPivot.rotation.z = lerpAngle(this.weaponPivot.rotation.z, -1.2, clamp(delta * 13, 0, 1));
      this.weaponPivot.rotation.x = lerpAngle(this.weaponPivot.rotation.x, -0.72, clamp(delta * 13, 0, 1));
      if (this.guardTime <= 0) {
        this.mode = "idle";
        if (this.counterWindow <= 0) this.routeLabel = "FIND THE OPENING";
      }
    } else if (this.mode === "dodge") {
      this.dodgeTime -= delta;
      this.root.position.addInPlace(this.dodgeVelocity.scale(delta * 13.5));
      if (this.dodgeVelocity.lengthSquared() > 0.01) this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(this.dodgeVelocity.x, this.dodgeVelocity.z), clamp(delta * 15, 0, 1));
      this.root.rotation.z = Math.sin((0.32 - this.dodgeTime) * 20) * 0.18;
      if (this.dodgeTime <= 0) {
        this.mode = "idle";
        this.root.rotation.z = 0;
      }
    } else if (!this.attack) {
      const moving = move.length() > 0.05;
      if (moving) {
        const direction = this.world.movementDirection(move);
        const desiredYaw = Math.atan2(direction.x, direction.z);
        this.root.rotation.y = lerpAngle(this.root.rotation.y, desiredYaw, clamp(delta * 10, 0, 1));
        this.root.position.addInPlace(direction.scale(delta * 7.4));
        this.mode = "move";
        if (this.dustClock <= 0) {
          this.dustClock = 0.2;
          this.world.spawnEffect(this.root.position.add(new Vector3(0, 0.08, 0)), "dust");
        }
      } else {
        if (this.world.input.isDemo && demoTarget) {
          const toward = demoTarget.root.position.subtract(this.root.position);
          this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(toward.x, toward.z), clamp(delta * 3.5, 0, 1));
        }
        this.mode = "idle";
      }
    }
    this.world.clampToArena(this.root.position);
    this.updateAttack(delta);
    const bob = this.mode === "move" ? Math.sin(this.motionClock * 10) * 0.07 : Math.sin(this.motionClock * 2) * 0.02;
    this.torso.position.y = 1.08 + bob;
    this.shoulder.rotation.z = Math.sin(this.motionClock * (this.mode === "move" ? 10 : 2)) * 0.03;
    if (this.characterVisual) {
      this.characterVisual.position.y = bob * 0.45;
      this.characterVisual.rotation.z = lerpAngle(this.characterVisual.rotation.z, this.mode === "dodge" ? 0.22 : 0, clamp(delta * 12, 0, 1));
      if (!this.attack) this.characterVisual.rotation.y = lerpAngle(this.characterVisual.rotation.y, 0, clamp(delta * 14, 0, 1));
    }
    if (!this.attack) {
      const motion: CharacterMotion = this.mode === "guard" ? "guard" : this.mode === "dodge" || this.mode === "move" ? "move" : "idle";
      this.playCharacterMotion(motion, motion === "idle" || motion === "move" || motion === "guard");
    } else {
      this.characterVisual?.setEnabled(Boolean(this.characterAnimator));
      this.fallbackMeshes.forEach((mesh) => { mesh.isVisible = !this.characterAnimator; });
    }
  }

  private scaledMoveTime(moveTime: number) {
    if (!this.attack) return 0;
    return this.attack.duration * (moveTime / Math.max(0.08, this.attack.move.duration));
  }

  private playCharacterMotion(motion: CharacterMotion, loop = false, speedRatio = 1) {
    const played = this.characterAnimator ? this.characterAnimator.play(motion, loop, speedRatio) : false;
    this.characterVisual?.setEnabled(Boolean(this.characterAnimator && played));
    this.fallbackMeshes.forEach((mesh) => { mesh.isVisible = !this.characterAnimator || !played; });
  }

  private updateAnimationTest(delta: number) {
    const phases: Array<{ label: string; motion: CharacterMotion; duration: number; loop: boolean }> = [
      { label: "TEST · IDLE", motion: "idle", duration: 0.8, loop: true },
      { label: "TEST · MOVE", motion: "move", duration: 0.8, loop: true },
      { label: "TEST · GUARD", motion: "guard", duration: 0.8, loop: true },
      { label: "TEST · LIGHT", motion: "light", duration: 0.6, loop: false },
      { label: "TEST · HEAVY", motion: "heavy", duration: 0.8, loop: false },
      { label: "TEST · HURT", motion: "hurt", duration: 0.6, loop: false },
      { label: "TEST · DEAD", motion: "dead", duration: 0.8, loop: false },
    ];
    const fixedMotion = runtimeFlags.animationTestPhase as CharacterMotion | null;
    const fixedPhase = phases.find((phase) => phase.motion === fixedMotion);
    if (fixedPhase) {
      this.routeLabel = `${fixedPhase.label} · FIXED`;
      this.playCharacterMotion(fixedPhase.motion, fixedPhase.loop, 1.1);
      return;
    }
    this.animationTestClock = (this.animationTestClock + delta) % phases.reduce((sum, phase) => sum + phase.duration, 0);
    let cursor = this.animationTestClock;
    let phase = phases[0];
    for (const candidate of phases) {
      if (cursor <= candidate.duration) { phase = candidate; break; }
      cursor -= candidate.duration;
    }
    this.routeLabel = phase.label;
    this.playCharacterMotion(phase.motion, phase.loop, 1.1);
  }

  private beginAttack(kind: "light" | "heavy", stage: number) {
    const nextStage = kind === "light" ? (stage || 1) : 0;
    const isFinisher = kind === "heavy" && stage > 0;
    const targetEnemy = this.world.currentTarget();
    const distance = targetEnemy ? Vector3.Distance(targetEnemy.root.position, this.root.position) : 5;
    const inputDirection = this.world.input.movement();
    const move = selectAttackMove({
      kind,
      stage: nextStage,
      directionX: inputDirection.x,
      directionY: inputDirection.y,
      afterDodge: this.afterDodgeWindow > 0,
      afterJustGuard: false,
      afterClash: this.afterClashWindow > 0,
      distance,
      target: this.aimTarget,
      targetStaggered: targetEnemy?.heartIsOpen() ?? false,
      rageReady: this.rage >= 100,
      sequence: this.attackSequence++,
    });
    const duration = this.characterAnimator?.durationNamed(move.name) ?? move.duration;
    const hitAt = duration * (move.hitStart / move.duration);
    this.attack = {
      kind,
      stage: kind === "light" ? nextStage : stage,
      time: 0,
      duration,
      hitAt,
      hitEndAt: duration * (move.hitEnd / move.duration),
      didHit: false,
      connected: false,
      queued: null,
      pulse: 0,
      move,
      target: this.aimTarget,
    };
    this.routeLabel = isFinisher
      ? (stage >= 2 ? "WEAK · WEAK · HEAVY" : "WEAK · HEAVY")
      : kind === "light"
        ? `WEAK ${"ⅠⅡⅢ"[nextStage - 1]}`
        : "HEAVY BREAK";
    if (this.world.input.isDemo && typeof window !== "undefined") {
      console.info(`[DemoCombo] fired kind=${kind} stage=${stage} route=${this.routeLabel}`);
    }
    this.mode = kind;
    if (targetEnemy) {
      const toward = targetEnemy.root.position.subtract(this.root.position);
      this.root.rotation.y = Math.atan2(toward.x, toward.z);
    }
    this.characterAnimator?.playNamed(move.name, false, 1, true);
    this.world.audio.play(kind === "heavy" ? "heavy" : "swing", kind === "heavy" ? 1.05 : 0.72);
    if (kind === "heavy") this.world.haptics.triggerStrong();
  }

  private beginGuard() {
    this.mode = "guard";
    this.guardTime = 0.18;
    this.justGuardTime = 0.145;
    this.routeLabel = "GUARD — MEET THE BLOW";
  }

  private beginCounter() {
    this.counterWindow = 0;
    if (this.world.input.isDemo && runtimeFlags.combatAudit) console.info("[CombatAudit] counter started");
    const move = selectAttackMove({ kind: "counter", stage: 0, directionX: 0, directionY: 1, afterDodge: false, afterJustGuard: true, afterClash: false, distance: 2.5, target: this.aimTarget, targetStaggered: true, rageReady: this.rage >= 100, sequence: this.attackSequence++ });
    const duration = this.characterAnimator?.durationNamed(move.name) ?? move.duration;
    this.attack = { kind: "counter", stage: 0, time: 0, duration, hitAt: duration * (move.hitStart / move.duration), hitEndAt: duration * (move.hitEnd / move.duration), didHit: false, connected: false, queued: null, pulse: 0, move, target: this.aimTarget };
    this.mode = "counter";
    this.characterAnimator?.playNamed(move.name, false, 1.06, true);
    this.world.audio.play("counter", 1.12);
    this.routeLabel = "JUST GUARD · COUNTER";
  }

  private beginMusou() {
    this.rage = 0;
    if (this.world.input.isDemo && runtimeFlags.combatAudit) console.info("[CombatAudit] musou started rageSpent=100");
    if (this.world.input.isDemo && runtimeFlags.adversarialAudit) console.info("[AdversarialAudit] musou started rageSpent=100");
    const move = selectAttackMove({ kind: "musou", stage: 0, directionX: 0, directionY: 1, afterDodge: false, afterJustGuard: false, afterClash: false, distance: 2.5, target: this.aimTarget, targetStaggered: this.world.currentTarget()?.heartIsOpen() ?? false, rageReady: true, sequence: this.attackSequence++ });
    this.attack = { kind: "musou", stage: 0, time: 0, duration: 1.28, hitAt: 0, hitEndAt: 1.28, didHit: false, connected: false, queued: null, pulse: 0, move, target: this.aimTarget };
    this.mode = "musou";
    this.characterAnimator?.playNamed(move.name, false, 1.08, true);
    this.routeLabel = "怒破 — RAGE RELEASE";
    this.world.triggerRageBurst(this.root.position);
  }

  private updateAttack(delta: number) {
    if (!this.attack) {
      this.weaponPivot.rotation.z = lerpAngle(this.weaponPivot.rotation.z, 0.22, clamp(delta * 10, 0, 1));
      return;
    }
    const previousTime = this.attack.time;
    this.attack.time += delta;
    const phase = clamp(this.attack.time / this.attack.duration, 0, 1);
    const isFinisher = this.attack.kind === "heavy" && this.attack.stage > 0;
    const isCounter = this.attack.kind === "counter";
    const isMusou = this.attack.kind === "musou";
    const swing = this.attack.kind === "light"
      ? Math.sin(phase * Math.PI) * 2.35
      : isCounter
        ? Math.sin(phase * Math.PI) * 4.45
        : isMusou
          ? Math.sin(phase * Math.PI * 4) * 3.45
        : isFinisher
        ? Math.sin(phase * Math.PI) * 3.6
        : Math.sin(phase * Math.PI) * 2.95;
    this.weaponPivot.rotation.z = isMusou ? swing : isCounter ? -2.1 + swing : isFinisher ? -1.25 + swing : -0.55 + swing;
    this.weaponPivot.rotation.x = this.attack.kind === "heavy" || isCounter || isMusou ? -Math.sin(phase * Math.PI * (isMusou ? 4 : 1)) * (isFinisher || isCounter || isMusou ? 1.05 : 0.7) : 0;
    if (this.characterVisual && this.attack.move.rotation !== 0) {
      this.characterVisual.rotation.y = Math.sin(phase * Math.PI) * this.attack.move.rotation;
    }
    if (isMusou) {
      const target = this.world.currentTarget();
      if (target) {
        const toward = target.root.position.subtract(this.root.position);
        this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(toward.x, toward.z), clamp(delta * 18, 0, 1));
      }
    }
    const configuredAdvance = this.attack.move.forward / Math.max(0.18, this.attack.duration);
    const advanceScale = isCounter ? 1.75 : isFinisher ? 1.3 : this.attack.kind === "heavy" ? 1.05 : 0.72;
    this.root.position.addInPlace(forwardFromYaw(this.root.rotation.y).scale(delta * configuredAdvance * advanceScale));
    if (isMusou) {
      const pulseTimes = [0.18, 0.56, 0.98];
      const nextPulse = pulseTimes[this.attack.pulse];
      if (nextPulse !== undefined && this.attack.time >= nextPulse) {
        const forward = forwardFromYaw(this.root.rotation.y);
        const finalPulse = this.attack.pulse === pulseTimes.length - 1;
        const hit = this.world.hitEnemies(
          this.root.position.add(forward.scale(0.5)),
          forward,
          finalPulse ? 5.4 : 4.35,
          finalPulse ? -0.05 : 0.15,
          finalPulse ? 10.2 : 5.6 + this.attack.pulse * 1.2,
          finalPulse ? 6.2 : 1.4,
          "heavy",
          this.attack.target,
          this.attack.move,
        );
        if (hit > 0) this.attack.connected = true;
        this.world.spawnEffect(this.root.position.add(new Vector3(0, 0.34, 0)), "heavy");
        this.world.burstRageText(this.root.position.add(new Vector3(0, 1.1, 0)), finalPulse ? 4 : 2, 1.12 + this.attack.pulse * 0.12);
        this.world.addCameraShake(0.66 + hit * 0.06);
        this.attack.pulse += 1;
      }
    } else if (!this.attack.didHit && previousTime <= this.attack.hitEndAt && this.attack.time >= this.attack.hitAt) {
      this.attack.didHit = true;
      const forward = forwardFromYaw(this.root.rotation.y);
      const hit = this.world.hitEnemies(
        this.root.position.add(forward.scale(0.6)),
        forward,
        isCounter ? 6.7 : isFinisher ? 5.45 : this.attack.kind === "heavy" ? 4.1 : 3.0,
        isCounter ? -0.78 : isFinisher ? -0.58 : this.attack.kind === "heavy" ? -0.18 : 0.1,
        isCounter ? 11.5 : isFinisher ? 6.6 : this.attack.kind === "heavy" ? 3.8 : 1.25 + this.attack.stage * 0.16,
        isCounter ? 7.5 : isFinisher ? 4.3 : this.attack.kind === "heavy" ? 2.2 : 0.8,
        isCounter || isFinisher || this.attack.kind === "heavy" ? "heavy" : "hit",
        this.attack.target,
        this.attack.move,
      );
      this.attack.connected = hit > 0;
      if (this.world.consumeAttackClash()) {
        this.cancelAttackForClash();
        return;
      }
      if (isFinisher || isCounter) {
        this.world.addCameraShake((isCounter ? 0.9 : 0.58) + hit * 0.1);
        this.world.spawnEffect(this.root.position.add(forward.scale(2.2)).add(new Vector3(0, 0.3, 0)), "heavy");
      }
      if (hit === 0) {
        this.world.session.recordMiss();
        this.world.audio.playWhiff(this.attack.kind === "heavy" || isCounter ? 1.15 : 0.82);
        this.world.spawnEffect(this.root.position.add(forward.scale(2.0)).add(new Vector3(0, 1.1, 0)), "miss");
      }
    }
    const recovery = isMusou ? 0 : this.attack.connected ? this.attack.move.hitRecovery : this.attack.move.whiffRecovery;
    if (this.attack.time >= this.attack.duration + recovery) {
      const queued = this.attack.queued;
      const chain = queued === "light" && this.attack.kind === "light" && this.attack.stage < 3;
      const finisher = queued === "heavy" && this.attack.kind === "light";
      const nextStage = this.attack.stage + 1;
      const previousStage = this.attack.stage;
      this.attack = null;
      this.mode = "idle";
      if (chain) this.beginAttack("light", nextStage);
      if (finisher) this.beginAttack("heavy", previousStage);
      if (!chain && !finisher) this.routeLabel = "FIND THE OPENING";
    }
  }

  prepareGuardAudit() {
    this.beginGuard();
  }

  receiveAuditStrike(attacker: BarbarianEnemy) {
    const from = attacker.root.position.subtract(this.root.position).normalize();
    return this.takeDamage(1, from, attacker);
  }

  startCounterAudit() {
    if (this.counterWindow > 0) {
      this.attack = null;
      this.beginCounter();
    }
  }

  prepareAttackClashAudit() {
    const move = selectAttackMove({ kind: "heavy", stage: 0, directionX: 0, directionY: 1, afterDodge: false, afterJustGuard: false, afterClash: false, distance: 2.5, target: "torso", targetStaggered: false, rageReady: false, sequence: this.attackSequence++ });
    const duration = this.characterAnimator?.durationNamed(move.name) ?? move.duration;
    this.attack = { kind: "heavy", stage: 0, time: duration * 0.52, duration, hitAt: duration * 0.43, hitEndAt: duration * 0.66, didHit: false, connected: false, queued: null, pulse: 0, move, target: "torso" };
    this.mode = "heavy";
    this.routeLabel = "AUDIT · ATTACK CLASH";
  }

  isAttackClashActive() {
    if (!this.attack || this.mode === "guard" || this.mode === "dodge" || this.mode === "fallen") return false;
    return isAttackClashWindow(clamp(this.attack.time / this.attack.duration, 0, 1));
  }

  cancelAttackForClash() {
    if (!this.attack) return;
    this.attack = null;
    this.mode = "idle";
    this.weaponPivot.rotation.z = 0;
    this.weaponPivot.rotation.x = 0;
    this.afterClashWindow = 0.8;
    this.routeLabel = "ATTACK CLASH — CANCEL!";
  }

  takeDamage(amount: number, from: Vector3, attacker?: BarbarianEnemy, hitLocation: HitLocation = "torso", dignityDamage = hitLocation === "head" ? 14 : 3) {
    if (this.mode === "dodge" || this.mode === "fallen" || this.hurtCooldown > 0) return "evade" as const;
    if (this.mode === "guard") {
      if (this.justGuardTime > 0) {
        this.guardTime = 0;
        this.justGuardTime = 0;
        this.counterWindow = 0.72;
        this.mode = "idle";
        this.addRage(this.dignity.value <= 0 ? 34 : 26);
        this.routeLabel = "JUST GUARD — COUNTER!";
        this.world.triggerJustGuard(this.root.position);
        attacker?.openToCounter();
        return "just" as const;
      }
      this.guardBreak = clamp(this.guardBreak + amount * 7.5, 0, 100);
      if (this.guardBreak >= 100) {
        this.mode = "idle";
        this.guardTime = 0;
        this.justGuardTime = 0;
        this.routeLabel = "防御崩れ";
        const brokenDamage = amount * 0.55;
        this.health = Math.max(0, this.health - brokenDamage);
        this.world.session.recordDamageTaken(brokenDamage);
        this.hurtCooldown = 0.45;
        if (this.health <= 0) this.mode = "fallen";
        return "hit" as const;
      }
      const chipDamage = amount * 0.16;
      this.health = Math.max(0, this.health - chipDamage);
      this.world.session.recordDamageTaken(chipDamage);
      this.addRage(1);
      this.world.haptics.trigger("guard");
      this.world.audio.playDefense(0.72);
      this.world.spawnEffect(this.root.position.add(new Vector3(0, 1.1, 0)), "guard");
      return "guard" as const;
    }
    this.hurtCooldown = 0.52;
    this.world.haptics.trigger("hurt");
    this.world.audio.playDamage(0.9);
    this.health = Math.max(0, this.health - amount);
    this.world.session.recordDamageTaken(amount);
    const beforeDignity = this.dignity.value;
    this.dignity = applyDignityDamage(this.dignity, dignityDamage);
    const lostDignity = beforeDignity - this.dignity.value;
    if (lostDignity > 0) this.world.session.recordDignityLoss(lostDignity);
    if (isDignityLost(this.dignity) && !this.poopTransformed) this.transformToPoop();
    this.root.position.addInPlace(from.scale(0.28));
    this.world.addCameraShake(0.5);
    this.world.spawnEffect(this.root.position.add(new Vector3(0, 1.1, 0)), "hurt");
    if (this.health <= 0) this.mode = "fallen";
    return "hit" as const;
  }

  addRage(amount: number) {
    const comebackMultiplier = this.dignity.value <= 0 ? 1.25 : 1;
    this.rage = clamp(this.rage + amount * comebackMultiplier, 0, 100);
  }

  counterReady() {
    return this.counterWindow > 0;
  }

  private transformToPoop() {
    this.poopTransformed = true;
    this.world.session.recordPoopTransformation();
    this.world.triggerDignityLoss(this.root.position, true);
    const previousAnimator = this.characterAnimator;
    this.world.characters.attach("poop", this.root, 0.84, (visual, animator) => {
      this.characterVisual = visual;
      this.characterAnimator = animator;
      if (this.attack) animator.playNamed(this.attack.move.name, false, 1, true);
      else this.playCharacterMotion(this.mode === "fallen" ? "dead" : this.mode === "guard" ? "guard" : "idle", this.mode !== "fallen");
      previousAnimator?.dispose();
    });
  }

  dispose() {
    this.characterAnimator?.dispose();
    this.root.dispose(false, false);
  }
}

class BarbarianEnemy {
  readonly root: TransformNode;
  readonly warningRing: Mesh;
  mode: EnemyMode = "spawn";
  removed = false;
  private health: number;
  private readonly maxHealth: number;
  private dignity: DignityState = createDignityState();
  private timer = 0;
  private actionClock = 0;
  private dealtDamage = false;
  private rewarded = false;
  private readonly torso: Mesh;
  private readonly armLeft: TransformNode;
  private readonly armRight: TransformNode;
  private readonly weaponPivot: TransformNode;
  private readonly outlineMeshes: Mesh[] = [];
  private readonly fallbackMeshes: Mesh[] = [];
  private characterVisual: TransformNode | null = null;
  private characterAnimator: CharacterAnimator | null = null;
  private outlineActive = false;
  private animationTestClock = 0;
  private readonly presentation: EnemyPresentation;
  private readonly balanceProfile: EnemyProfile;
  private readonly baseScale: number;
  private entryPoseClock = 0;
  private entrySoundPlayed = false;
  private heartOpenTime = 0;
  private poopTransformed = false;
  private attackCursor = 0;
  private currentAttackMove: AttackMove | null = null;
  private currentAttackDuration = 0.72;
  private telegraphDuration = 0.58;
  private attackConnected = false;
  private chargeDirection = Vector3.Zero();
  private chargeTrailClock = 0;
  private feintUsed = false;
  private readonly heartMeshes: Mesh[] = [];
  private readonly hitMeshes: Record<HitLocation, Mesh[]> = { head: [], torso: [], heart: [] };

  constructor(private readonly world: GameWorld, position: Vector3, spawnDelay: number, readonly variant: EnemyCharacterKey) {
    const { scene, materials } = world;
    this.presentation = enemyPresentations[variant];
    this.balanceProfile = enemyProfileFor(variant) ?? DEFAULT_ENEMY_ROSTER[0];
    this.actionClock = world.random() * 10;
    this.root = new TransformNode("texturedBarbarian", scene);
    this.root.position.copyFrom(position);
    this.root.rotation.y = world.random() * Math.PI * 2;
    this.baseScale = 0.94 + world.random() * 0.16;
    this.root.scaling.setAll(this.baseScale);
    const shadow = MeshBuilder.CreateDisc("enemyFootShadow", { radius: 0.78, tessellation: 20, sideOrientation: Mesh.DOUBLESIDE }, scene);
    shadow.parent = this.root;
    shadow.position.y = 0.018;
    shadow.rotation.x = Math.PI / 2;
    shadow.scaling.z = 0.65;
    shadow.material = materials.shadow;
    this.maxHealth = DEFAULT_COMBAT_BALANCE.enemy.baseHealth * this.balanceProfile.healthMultiplier;
    this.health = this.maxHealth;
    this.timer = spawnDelay + 0.36;

    const legs = MeshBuilder.CreateCylinder("barbarianLegs", { height: 0.8, diameterTop: 0.33, diameterBottom: 0.4, tessellation: 8 }, scene);
    legs.parent = this.root;
    legs.position.y = 0.42;
    legs.material = materials.enemyLeather;
    this.torso = MeshBuilder.CreateCylinder("barbarianTorso", { height: 1.12, diameterTop: 0.5, diameterBottom: 0.68, tessellation: 10 }, scene);
    this.torso.parent = this.root;
    this.torso.position.y = 1.35;
    this.torso.material = materials.enemyLeather;
    const chestFur = MeshBuilder.CreateBox("furMantle", { width: 0.92, height: 0.33, depth: 0.66 }, scene);
    chestFur.parent = this.root;
    chestFur.position.set(0, 1.66, -0.03);
    chestFur.material = materials.enemyFur;
    const leatherBelt = MeshBuilder.CreateTorus("barbarianLeatherBelt", { diameter: 0.72, thickness: 0.1, tessellation: 10 }, scene);
    leatherBelt.parent = this.root;
    leatherBelt.position.y = 1.06;
    leatherBelt.rotation.x = Math.PI / 2;
    leatherBelt.material = materials.enemyFur;
    const head = MeshBuilder.CreateSphere("barbarianHead", { diameter: 0.58, segments: 8 }, scene);
    head.parent = this.root;
    head.position.y = 2.25;
    head.material = materials.enemySkin;
    this.hitMeshes.head.push(head);
    this.hitMeshes.torso.push(this.torso);
    const hair = MeshBuilder.CreateBox("barbarianMohawk", { width: 0.24, height: 0.16, depth: 0.56 }, scene);
    hair.parent = this.root;
    hair.position.set(0, 2.54, 0);
    hair.material = materials.enemyFur;
    const beard = MeshBuilder.CreateBox("barbarianBeard", { width: 0.36, height: 0.25, depth: 0.2 }, scene);
    beard.parent = this.root;
    beard.position.set(0, 2.1, -0.28);
    beard.material = materials.enemyFur;
    const braid = MeshBuilder.CreateCylinder("barbarianBraid", { height: 0.4, diameter: 0.13, tessellation: 6 }, scene);
    braid.parent = this.root;
    braid.position.set(0, 2.22, 0.35);
    braid.rotation.x = Math.PI / 2;
    braid.material = materials.enemyFur;
    this.armLeft = new TransformNode("barbarianArmLeft", scene);
    this.armLeft.parent = this.root;
    this.armLeft.position.set(-0.58, 1.62, 0);
    const leftArm = MeshBuilder.CreateCylinder("barbarianLeftArm", { height: 0.86, diameter: 0.26, tessellation: 8 }, scene);
    leftArm.parent = this.armLeft;
    leftArm.position.y = -0.36;
    leftArm.material = materials.enemySkin;
    const leftWrap = MeshBuilder.CreateCylinder("leftLeatherWrap", { height: 0.31, diameter: 0.3, tessellation: 8 }, scene);
    leftWrap.parent = this.armLeft;
    leftWrap.position.y = -0.63;
    leftWrap.material = materials.enemyLeather;
    this.armRight = new TransformNode("barbarianArmRight", scene);
    this.armRight.parent = this.root;
    this.armRight.position.set(0.58, 1.62, 0);
    const rightArm = MeshBuilder.CreateCylinder("barbarianRightArm", { height: 0.86, diameter: 0.27, tessellation: 8 }, scene);
    rightArm.parent = this.armRight;
    rightArm.position.y = -0.36;
    rightArm.material = materials.enemySkin;
    const rightWrap = MeshBuilder.CreateCylinder("rightLeatherWrap", { height: 0.31, diameter: 0.31, tessellation: 8 }, scene);
    rightWrap.parent = this.armRight;
    rightWrap.position.y = -0.63;
    rightWrap.material = materials.enemyLeather;
    this.weaponPivot = new TransformNode("barbarianWeaponPivot", scene);
    this.weaponPivot.parent = this.armRight;
    this.weaponPivot.position.y = -0.74;
    const handle = MeshBuilder.CreateCylinder("barbarianAxeHandle", { height: 0.9, diameter: 0.1, tessellation: 6 }, scene);
    handle.parent = this.weaponPivot;
    handle.position.y = -0.34;
    handle.material = materials.wood;
    const axe = MeshBuilder.CreateBox("barbarianAxeHead", { width: 0.52, height: 0.24, depth: 0.14 }, scene);
    axe.parent = this.weaponPivot;
    axe.position.y = -0.78;
    axe.material = materials.enemyIron;
    const buckle = MeshBuilder.CreateTorus("barbarianBuckle", { diameter: 0.34, thickness: 0.08, tessellation: 8 }, scene);
    buckle.parent = this.root;
    buckle.position.set(0, 1.3, -0.6);
    buckle.rotation.x = Math.PI / 2;
    buckle.material = materials.enemyBronze;
    const shoulderPlate = MeshBuilder.CreateSphere("barbarianShoulderPlate", { diameter: 0.44, segments: 8 }, scene);
    shoulderPlate.parent = this.root;
    shoulderPlate.position.set(-0.55, 1.82, 0.03);
    shoulderPlate.scaling.y = 0.45;
    shoulderPlate.material = materials.enemyBronze;
    this.warningRing = variant === "rhinoceros" || variant === "crocodile"
      ? MeshBuilder.CreateBox("attackTelegraphStrip", {
          width: variant === "rhinoceros" ? 1.45 : 1.9,
          height: 0.035,
          depth: variant === "rhinoceros" ? 8.5 : 5.2,
        }, scene)
      : variant === "hippopotamus"
        ? MeshBuilder.CreateTorus("attackTelegraphCircle", { diameter: 5.7, thickness: 0.1, tessellation: 28 }, scene)
        : MeshBuilder.CreateDisc("attackTelegraphFan", { radius: 2.6, tessellation: 28, arc: 0.34, sideOrientation: Mesh.DOUBLESIDE }, scene);
    this.warningRing.parent = this.root;
    if (variant === "rhinoceros" || variant === "crocodile") {
      this.warningRing.position.set(0, 0.055, variant === "rhinoceros" ? 4.1 : 2.5);
    } else if (variant === "hippopotamus") {
      this.warningRing.position.y = 0.055;
      this.warningRing.rotation.x = Math.PI / 2;
    } else {
      this.warningRing.position.set(0, 0.045, 1.05);
      this.warningRing.rotation.x = Math.PI / 2;
      this.warningRing.rotation.y = Math.PI * 0.33;
    }
    this.warningRing.material = materials.warning;
    this.warningRing.isVisible = false;
    this.heartMeshes.push(this.torso);
    this.outlineMeshes.push(...this.root.getChildMeshes(false).filter((mesh): mesh is Mesh => mesh instanceof Mesh && mesh !== this.warningRing));
    this.fallbackMeshes.push(...this.outlineMeshes);
    world.characters.attach(this.variant, this.root, 0.82, (visual, animator) => {
      this.characterVisual = visual;
      this.characterAnimator = animator;
      this.outlineMeshes.push(...visual.getChildMeshes(false).filter((mesh): mesh is Mesh => mesh instanceof Mesh));
      this.registerVisualHitMeshes(visual);
      this.outlineActive = false;
      this.setRageOutline(this.world.player.rage >= 100);
      this.playCharacterMotion("idle", true);
    });
  }

  setRageOutline(active: boolean) {
    if (this.outlineActive === active) return;
    this.outlineActive = active;
    this.outlineMeshes.forEach((mesh) => {
      mesh.renderOutline = active;
      mesh.outlineColor = Color3.FromHexString("#FFE1A0");
      mesh.outlineWidth = active ? 0.085 : 0;
    });
  }

  update(delta: number) {
    this.actionClock += delta;
    this.heartOpenTime = Math.max(0, this.heartOpenTime - delta);
    this.updateHeartCue();
    if (runtimeFlags.animationTest) {
      this.updateAnimationTest(delta);
      return;
    }
    if (this.characterVisual) {
      const stride = this.mode === "approach" ? Math.sin(this.actionClock * 8) * 0.045 : 0;
      this.characterVisual.position.y = Math.max(0, stride);
      this.characterVisual.rotation.z = lerpAngle(this.characterVisual.rotation.z, this.mode === "stagger" ? 0.18 : 0, clamp(delta * 10, 0, 1));
    }
    if (this.mode === "dead") {
      this.playCharacterMotion("dead");
      this.timer -= delta;
      this.root.position.y -= delta * 1.7;
      this.root.rotation.z += delta * 1.2;
      this.root.scaling.scaleInPlace(1 - delta * 0.7);
      if (!this.rewarded) {
        this.rewarded = true;
        this.world.onEnemyDefeated(this);
      }
      if (this.timer <= 0) {
        this.removed = true;
        this.dispose();
      }
      return;
    }
    if (this.mode === "spawn") {
      this.entryPoseClock += delta;
      if (!this.entrySoundPlayed && (this.world.isStarted() || this.world.input.isDemo)) {
        this.entrySoundPlayed = true;
        const pan = this.world.entryPanFor(this.root.position);
        this.world.audio.playEnemyEntry(this.variant, this.presentation.roarIntensity, pan);
        this.world.recordEnemyEntryRoar(this.variant, pan);
      }
      this.playCharacterMotion(this.presentation.entryMotion, false, 0.82);
      this.timer -= delta;
      const reveal = clamp(1 - Math.max(this.timer, 0) / 0.36, 0.15, 1);
      this.root.scaling.setAll(reveal * this.baseScale);
      this.root.rotation.z = Math.sin(this.entryPoseClock * 5.5) * this.presentation.entryLean;
      this.weaponPivot.rotation.z = this.presentation.entryLean * 3.5;
      if (this.timer <= 0) {
        this.mode = "approach";
        this.root.scaling.setAll(this.baseScale);
        this.root.rotation.z = 0;
        this.weaponPivot.rotation.z = 0;
      }
      return;
    }
    const toPlayer = this.world.player.root.position.subtract(this.root.position);
    const flatToPlayer = new Vector3(toPlayer.x, 0, toPlayer.z);
    const distance = flatToPlayer.length();
    if (distance > 0.01) this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(flatToPlayer.x, flatToPlayer.z), clamp(delta * 5.2, 0, 1));

    if (this.mode === "approach") {
      const engageDistance = this.variant === "rhinoceros" ? 10.5 : this.variant === "crocodile" ? 3.9 : this.variant === "hippopotamus" ? 3.35 : 2.75;
      this.playCharacterMotion("move", true, 0.9 + this.balanceProfile.speedMultiplier * 0.18);
      if (distance > engageDistance) {
        const direction = flatToPlayer.normalize();
        const separation = this.world.separationFor(this);
        const lateral = this.variant === "lion"
          ? new Vector3(direction.z, 0, -direction.x).scale(Math.sin(this.actionClock * 3.4) * 0.8)
          : Vector3.Zero();
        const velocity = direction
          .scale(DEFAULT_COMBAT_BALANCE.enemy.moveSpeed * this.balanceProfile.speedMultiplier + Math.sin(this.actionClock * 2.1) * 0.12)
          .addInPlace(lateral)
          .addInPlace(separation);
        this.root.position.addInPlace(velocity.scale(delta));
        this.world.clampToArena(this.root.position);
        this.torso.rotation.z = Math.sin(this.actionClock * 9) * 0.05;
      } else {
        this.beginTelegraph();
      }
      return;
    }
    if (this.mode === "telegraph") {
      this.playCharacterMotion("guard", true, 1.15);
      this.timer -= delta;
      const pulse = 1 + Math.sin(this.actionClock * (this.variant === "lion" ? 30 : 18)) * 0.08;
      this.warningRing.scaling.setAll(pulse);
      this.warningRing.isVisible = this.variant !== "lion" || Math.sin(this.actionClock * 32) > -0.4;
      this.weaponPivot.rotation.z = -Math.sin((1 - this.timer) * 2) * 0.9;
      if (this.variant === "lion" && !this.feintUsed && this.timer <= this.telegraphDuration * 0.48) {
        this.feintUsed = true;
        this.timer += 0.28;
        this.warningRing.isVisible = false;
        this.world.notify("ライオンのフェイント", 0.45);
        return;
      }
      if (this.timer <= 0) {
        this.beginStrike(flatToPlayer);
      }
      return;
    }
    if (this.mode === "strike") {
      this.playCurrentAttack(false);
      this.timer -= delta;
      const strikeProgress = clamp(1 - this.timer / this.currentAttackDuration, 0, 1);
      this.weaponPivot.rotation.z = Math.sin(strikeProgress * Math.PI) * 1.7;
      const hitFraction = this.currentAttackMove ? this.currentAttackMove.hitStart / this.currentAttackMove.duration : 0.52;
      if (!this.dealtDamage && strikeProgress >= hitFraction) {
        this.dealtDamage = true;
        this.world.audio.play("heavy", 0.9);
        if (distance < this.attackRange()) {
          if (this.world.player.isAttackClashActive()) {
            this.world.player.cancelAttackForClash();
            this.cancelAttackForClash();
            this.world.triggerAttackClash(Vector3.Lerp(this.world.player.root.position, this.root.position, 0.5));
          } else {
            const location = this.attackLocation();
            const damage = DEFAULT_COMBAT_BALANCE.enemy.attackDamage * this.balanceProfile.damageMultiplier * (0.94 + this.world.random() * 0.12);
            const outcome = this.world.player.takeDamage(damage, flatToPlayer.normalize(), this, location, this.dignityPressure(location));
            this.attackConnected = outcome !== "evade";
          }
        }
      }
      if (this.timer <= 0) {
        this.mode = "recover";
        this.timer = this.recoveryDuration();
        if (!this.attackConnected) this.openHeart(this.whiffOpeningDuration(), "大技の空振り・心臓露出");
      }
      return;
    }
    if (this.mode === "charge") {
      this.playCurrentAttack(false);
      this.timer -= delta;
      this.chargeTrailClock -= delta;
      if (this.health < this.maxHealth * 0.5 && !this.dealtDamage) {
        const corrected = flatToPlayer.lengthSquared() > 0.01 ? flatToPlayer.normalize() : this.chargeDirection;
        this.chargeDirection = Vector3.Lerp(this.chargeDirection, corrected, clamp(delta * 0.48, 0, 1)).normalize();
      }
      this.root.rotation.y = Math.atan2(this.chargeDirection.x, this.chargeDirection.z);
      this.root.position.addInPlace(this.chargeDirection.scale(delta * (this.health < this.maxHealth * 0.5 ? 11.6 : 10.2)));
      if (this.chargeTrailClock <= 0) {
        this.chargeTrailClock = 0.18;
        this.world.spawnEffect(this.root.position.add(new Vector3(0, 0.12, 0)), "miss");
      }
      const chargeDistance = Vector3.Distance(this.root.position, this.world.player.root.position);
      if (!this.dealtDamage && chargeDistance < 1.35) {
        this.dealtDamage = true;
        const toPlayerNow = this.world.player.root.position.subtract(this.root.position);
        toPlayerNow.y = 0;
        const outcome = this.world.player.takeDamage(
          DEFAULT_COMBAT_BALANCE.enemy.attackDamage * this.balanceProfile.damageMultiplier * 1.24,
          toPlayerNow.lengthSquared() > 0.01 ? toPlayerNow.normalize() : this.chargeDirection,
          this,
          "torso",
          this.dignityPressure("torso") * 1.4,
        );
        this.attackConnected = outcome !== "evade";
        if (this.attackConnected) {
          this.mode = "recover";
          this.timer = 1.05;
          return;
        }
      }
      if (Math.hypot(this.root.position.x, this.root.position.z) >= ARENA_RADIUS - 0.3) {
        this.world.clampToArena(this.root.position);
        this.mode = "stagger";
        this.timer = 2.65;
        this.openHeart(2.65, "壁へ激突・心臓露出");
        this.world.addCameraShake(0.85);
        this.world.spawnEffect(this.root.position.add(new Vector3(0, 0.3, 0)), "heavy");
        return;
      }
      if (this.timer <= 0) {
        this.mode = "recover";
        this.timer = 1.05;
        if (!this.attackConnected) this.openHeart(1.45, "突進の空振り・心臓露出");
      }
      return;
    }
    if (this.mode === "recover" || this.mode === "stagger") {
      this.playCharacterMotion(this.mode === "stagger" ? "hurt" : "idle", this.mode === "recover", 1);
      this.timer -= delta;
      this.weaponPivot.rotation.z = lerpAngle(this.weaponPivot.rotation.z, 0, clamp(delta * 11, 0, 1));
      if (this.timer <= 0) this.mode = "approach";
    }
  }

  private updateHeartCue() {
    for (const mesh of this.heartMeshes) {
      if (mesh.isDisposed()) continue;
      if (this.heartOpenTime > 0) {
        mesh.renderOutline = true;
        mesh.outlineColor = Color3.FromHexString("#FF334F");
        mesh.outlineWidth = 0.12 + Math.sin(this.actionClock * 16) * 0.025;
      } else if (this.outlineActive) {
        mesh.renderOutline = true;
        mesh.outlineColor = Color3.FromHexString("#FFE1A0");
        mesh.outlineWidth = 0.085;
      } else {
        mesh.renderOutline = false;
        mesh.outlineWidth = 0;
      }
    }
  }

  private registerVisualHitMeshes(visual: TransformNode) {
    const meshes = visual.getChildMeshes(false).filter((mesh): mesh is Mesh => mesh instanceof Mesh);
    const collect = (pattern: RegExp, preferred: RegExp) => meshes
      .filter((mesh) => pattern.test(mesh.name))
      .sort((left, right) => Number(preferred.test(right.name)) - Number(preferred.test(left.name)));
    const head = collect(/head|skull|face|jaw|beak|muzzle|horn|mane/i, /head$/i);
    const torso = collect(/torso|chest|pectoral|abdomen|spine|belly|trunk/i, /torso$/i);
    const heart = collect(/heart|cavity|aorta/i, /heartbody$/i);
    if (head.length > 0) this.hitMeshes.head = head;
    if (torso.length > 0) this.hitMeshes.torso = torso;
    if (heart.length > 0) this.hitMeshes.heart = heart;
    this.heartMeshes.push(...heart);
  }

  private beginTelegraph() {
    const attackSet = ENEMY_ATTACK_SETS[this.variant];
    const lowHealthBonus = this.variant === "gorilla" && this.health <= this.maxHealth * 0.5 ? 1 : 0;
    const index = (this.attackCursor + lowHealthBonus) % attackSet.length;
    const shouldFeint = this.variant === "lion" && this.attackCursor % 2 === 0;
    const name = attackSet[index];
    this.attackCursor += 1;
    this.currentAttackMove = ATTACK_BY_NAME.get(name) ?? null;
    this.telegraphDuration = DEFAULT_COMBAT_BALANCE.enemy.telegraphSeconds * this.balanceProfile.telegraphMultiplier;
    if (this.variant === "lion") this.telegraphDuration *= 0.72;
    if (this.variant === "bear") this.telegraphDuration *= 1.15;
    this.timer = this.telegraphDuration;
    this.feintUsed = !shouldFeint;
    this.mode = "telegraph";
    this.warningRing.isVisible = true;
    if (this.variant === "rhinoceros") this.world.audio.playRage(0.45);
    else if (this.variant === "hippopotamus" || this.variant === "bear") this.world.audio.play("heavy", 0.52);
    else if (this.variant === "crocodile") this.world.audio.playWhiff(0.55);
    else this.world.audio.play("guard", 0.48);
  }

  private beginStrike(flatToPlayer: Vector3) {
    const speedRatio = this.variant === "lion" ? 1.18 : this.variant === "bear" || this.variant === "hippopotamus" ? 0.88 : 1;
    if (this.variant === "rhinoceros") {
      this.mode = "charge";
      this.timer = this.health <= this.maxHealth * 0.5 ? 4.4 : 4.05;
      this.currentAttackDuration = this.timer;
      this.chargeDirection = flatToPlayer.lengthSquared() > 0.01 ? flatToPlayer.normalize() : forwardFromYaw(this.root.rotation.y);
      this.chargeTrailClock = 0;
    } else {
      this.mode = "strike";
      this.currentAttackDuration = this.currentAttackMove
        ? this.characterAnimator?.durationNamed(this.currentAttackMove.name, speedRatio) ?? this.currentAttackMove.duration / speedRatio
        : this.characterAnimator?.duration("heavy", speedRatio) ?? 0.72;
      this.timer = this.currentAttackDuration;
    }
    this.dealtDamage = false;
    this.attackConnected = false;
    this.warningRing.isVisible = false;
    this.playCurrentAttack(true, speedRatio);
  }

  private playCurrentAttack(restart: boolean, speedRatio = 1) {
    const played = this.currentAttackMove
      ? this.characterAnimator?.playNamed(this.currentAttackMove.name, false, speedRatio, restart) ?? false
      : false;
    if (!played) this.playCharacterMotion("heavy", false, speedRatio);
    this.characterVisual?.setEnabled(Boolean(this.characterAnimator));
    this.fallbackMeshes.forEach((mesh) => { mesh.isVisible = !this.characterAnimator; });
  }

  private attackRange() {
    if (this.variant === "crocodile") return 4.25;
    if (this.variant === "hippopotamus") return 3.75;
    if (this.variant === "bear") return 3.35;
    if (this.variant === "lion") return 3.15;
    return DEFAULT_COMBAT_BALANCE.enemy.attackRange;
  }

  private attackLocation(): HitLocation {
    if (this.variant === "lion" || this.variant === "crocodile") return "head";
    return "torso";
  }

  private dignityPressure(location: HitLocation) {
    const base = location === "head" ? 11 : location === "heart" ? 5 : 3.5;
    return base * this.balanceProfile.dignityPressure;
  }

  private recoveryDuration() {
    if (this.variant === "crocodile") return 1.15;
    if (this.variant === "lion") return 0.72;
    if (this.variant === "bear") return 0.95;
    if (this.variant === "hippopotamus") return 0.82;
    return 0.55;
  }

  private whiffOpeningDuration() {
    if (this.variant === "crocodile") return 1.65;
    if (this.variant === "bear") return 1.55;
    if (this.variant === "lion") return 1.05;
    if (this.variant === "hippopotamus") return 1.2;
    return 0.9;
  }

  private openHeart(seconds: number, notice?: string) {
    this.heartOpenTime = Math.max(this.heartOpenTime, seconds);
    if (notice) this.world.notify(notice, Math.min(1.25, seconds));
  }

  prepareStrikeAudit() {
    this.currentAttackMove = ATTACK_BY_NAME.get(ENEMY_ATTACK_SETS[this.variant][0]) ?? null;
    const duration = this.currentAttackMove ? this.characterAnimator?.durationNamed(this.currentAttackMove.name) ?? this.currentAttackMove.duration : 0.72;
    this.mode = "strike";
    this.currentAttackDuration = duration;
    this.timer = duration * 0.48;
    this.dealtDamage = false;
    this.attackConnected = false;
    this.warningRing.isVisible = false;
  }

  prepareAttackClashAudit() {
    this.currentAttackMove = ATTACK_BY_NAME.get(ENEMY_ATTACK_SETS[this.variant][0]) ?? null;
    const duration = this.currentAttackMove ? this.characterAnimator?.durationNamed(this.currentAttackMove.name) ?? this.currentAttackMove.duration : 0.72;
    this.mode = "strike";
    this.currentAttackDuration = duration;
    this.timer = duration * (1 - 0.52);
    this.dealtDamage = false;
    this.attackConnected = false;
    this.warningRing.isVisible = false;
  }

  healthValue() {
    return this.health;
  }

  maxHealthValue() {
    return this.maxHealth;
  }

  dignityValue() {
    return this.dignity.value;
  }

  displayName() {
    return this.balanceProfile.displayName;
  }

  heartIsOpen() {
    return this.heartOpenTime > 0;
  }

  targetPoint(location: HitLocation) {
    const target = this.hitMeshes[location].find((mesh) => !mesh.isDisposed());
    if (target) {
      target.computeWorldMatrix(true);
      return target.getBoundingInfo().boundingBox.centerWorld.clone();
    }
    const height = location === "head" ? 2.25 : location === "heart" ? 1.52 : 1.35;
    return this.root.position.add(new Vector3(0, height * this.baseScale, 0));
  }

  targetRadius(location: HitLocation) {
    return TARGET_VOLUME_RADIUS[location];
  }

  scoreMultiplier() {
    return this.balanceProfile.scoreMultiplier;
  }

  setHealthForAudit(value: number) {
    this.health = Math.max(0, value);
  }

  isAttackClashActive() {
    if ((this.mode !== "strike" && this.mode !== "charge") || this.dealtDamage) return false;
    return isAttackClashWindow(clamp(1 - this.timer / this.currentAttackDuration, 0, 1));
  }

  cancelAttackForClash() {
    if (this.mode !== "strike" && this.mode !== "charge") return;
    this.dealtDamage = true;
    this.mode = "recover";
    this.timer = 0.72;
    this.openHeart(1.35, "攻撃相殺・心臓露出");
    this.warningRing.isVisible = false;
    this.weaponPivot.rotation.z = 0;
  }

  takeTargetedDamage(amount: number, knockback: Vector3, requestedLocation: HitLocation, move?: AttackMove) {
    const incoming = knockback.lengthSquared() > 0.001 ? knockback.normalizeToNew() : Vector3.Zero();
    const struckFromFront = incoming.lengthSquared() > 0 && Vector3.Dot(forwardFromYaw(this.root.rotation.y), incoming) < -0.28;
    const lionEvadesHead = this.variant === "lion" && requestedLocation === "head" && this.mode === "approach" && this.world.random() < 0.55;
    const effectiveRequest = lionEvadesHead ? "torso" : requestedLocation;
    const flankHeart = this.variant === "crocodile" && requestedLocation === "heart" && !struckFromFront;
    const initial = resolveHit(amount, effectiveRequest, undefined, { heartExposed: this.heartOpenTime > 0 || flankHeart });
    const healthMultiplier = move?.healthMultiplier[initial.location] ?? 1;
    const dignityMultiplier = move?.dignityMultiplier[initial.location] ?? 1;
    const rhinoFrontDefense = this.variant === "rhinoceros" && struckFromFront && this.heartOpenTime <= 0 && this.mode !== "stagger";
    const resolved = Object.freeze({
      ...initial,
      damage: initial.damage * healthMultiplier * (rhinoFrontDefense ? 0.48 : 1),
      dignityDamage: initial.dignityDamage * dignityMultiplier * (rhinoFrontDefense ? 0.7 : 1),
    });
    if (this.mode === "dead" || this.removed) return resolved;
    const committedBearAttack = this.variant === "bear" && (this.mode === "telegraph" || this.mode === "strike") && resolved.damage < 10;
    this.health = Math.max(0, this.health - resolved.damage);
    this.dignity = applyDignityDamage(this.dignity, resolved.dignityDamage);
    const knockbackResistance = this.variant === "hippopotamus" ? 0.22 : this.variant === "bear" ? 0.58 : 1;
    this.root.position.addInPlace(knockback.scale(knockbackResistance));
    if (isDignityLost(this.dignity) && !this.poopTransformed) this.transformToPoop();
    if (this.health <= 0) {
      this.mode = "dead";
      this.timer = 0.52;
      this.warningRing.isVisible = false;
      return resolved;
    }
    if (committedBearAttack) return resolved;
    this.mode = "stagger";
    const majorStagger = resolved.location === "heart" || resolved.damage >= 10 || move?.power === "heavy";
    this.timer = majorStagger ? 0.72 * resolved.staggerMultiplier : 0.22 * resolved.staggerMultiplier;
    if (majorStagger) this.openHeart(Math.max(0.85, this.timer), "大きくよろめいた・心臓露出");
    if (resolved.location === "heart") this.heartOpenTime = Math.min(this.heartOpenTime, 0.5);
    this.warningRing.isVisible = false;
    this.torso.rotation.z = (this.world.random() > 0.5 ? 1 : -1) * 0.24;
    return resolved;
  }

  takeDamage(amount: number, knockback: Vector3) {
    return this.takeTargetedDamage(amount, knockback, "torso");
  }

  openToCounter() {
    if (this.mode === "dead") return;
    this.mode = "stagger";
    this.timer = 1.1;
    this.openHeart(1.8, "ジャストガード・心臓露出");
    this.warningRing.isVisible = false;
    this.weaponPivot.rotation.z = -1.75;
    this.torso.rotation.z = 0.46;
  }

  private transformToPoop() {
    this.poopTransformed = true;
    this.world.triggerDignityLoss(this.root.position, false);
    const previousAnimator = this.characterAnimator;
    this.world.characters.attach("poop", this.root, 0.82, (visual, animator) => {
      this.characterVisual = visual;
      this.characterAnimator = animator;
      this.heartMeshes.length = 0;
      this.heartMeshes.push(this.torso);
      this.registerVisualHitMeshes(visual);
      if (this.currentAttackMove && (this.mode === "strike" || this.mode === "charge")) animator.playNamed(this.currentAttackMove.name, false, 1, true);
      else this.playCharacterMotion(this.mode === "dead" ? "dead" : this.mode === "stagger" ? "hurt" : "idle", this.mode !== "dead" && this.mode !== "stagger");
      previousAnimator?.dispose();
    });
  }

  private updateAnimationTest(delta: number) {
    const phases: Array<{ label: string; motion: CharacterMotion; duration: number; loop: boolean }> = [
      { label: "TEST · IDLE", motion: "idle", duration: 0.8, loop: true },
      { label: "TEST · MOVE", motion: "move", duration: 0.8, loop: true },
      { label: "TEST · GUARD", motion: "guard", duration: 0.8, loop: true },
      { label: "TEST · LIGHT", motion: "light", duration: 0.6, loop: false },
      { label: "TEST · HEAVY", motion: "heavy", duration: 0.8, loop: false },
      { label: "TEST · HURT", motion: "hurt", duration: 0.6, loop: false },
      { label: "TEST · DEAD", motion: "dead", duration: 0.8, loop: false },
    ];
    const fixedMotion = runtimeFlags.animationTestPhase as CharacterMotion | null;
    const fixedPhase = phases.find((phase) => phase.motion === fixedMotion);
    if (fixedPhase) {
      this.playCharacterMotion(fixedPhase.motion, fixedPhase.loop, 1.1);
      return;
    }
    this.animationTestClock = (this.animationTestClock + delta + 0.34) % phases.reduce((sum, phase) => sum + phase.duration, 0);
    let cursor = this.animationTestClock;
    let phase = phases[0];
    for (const candidate of phases) {
      if (cursor <= candidate.duration) { phase = candidate; break; }
      cursor -= candidate.duration;
    }
    this.playCharacterMotion(phase.motion, phase.loop, 1.1);
  }

  private playCharacterMotion(motion: CharacterMotion, loop = false, speedRatio = 1) {
    const played = this.characterAnimator ? this.characterAnimator.play(motion, loop, speedRatio) : false;
    this.characterVisual?.setEnabled(Boolean(this.characterAnimator && played));
    this.fallbackMeshes.forEach((mesh) => { mesh.isVisible = !this.characterAnimator || !played; });
  }

  get requiresJustGuard() {
    return this.mode === "strike" && this.timer < 0.22 && !this.dealtDamage;
  }

  dispose() {
    this.characterAnimator?.dispose();
    this.root.dispose(false, false);
  }
}

type CombatEffectKind = "light" | "heavy" | "miss" | "hurt" | "guard" | "clash" | "head" | "heart" | "dust";

class CombatEffect {
  private readonly ring: Mesh;
  private time = 0;
  done = false;

  constructor(scene: Scene, readonly kind: CombatEffectKind, materials: ArenaMaterials) {
    const diameter = kind === "clash" ? 1.55 : kind === "heart" ? 1.25 : kind === "head" ? 0.92 : kind === "heavy" ? 0.8 : kind === "guard" ? 1.15 : kind === "dust" ? 0.35 : 0.45;
    const thickness = kind === "clash" || kind === "heart" ? 0.12 : kind === "guard" || kind === "head" ? 0.085 : kind === "dust" ? 0.035 : 0.055;
    this.ring = MeshBuilder.CreateTorus("impactRing", { diameter, thickness, tessellation: kind === "dust" ? 10 : 16 }, scene);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.material = kind === "heart"
      ? materials.heart
      : kind === "head"
        ? materials.dignity
        : kind === "dust"
          ? materials.dust
          : kind === "hurt"
            ? materials.warning
            : kind === "guard" || kind === "clash"
              ? materials.playerBronze
              : materials.impact;
    this.ring.setEnabled(false);
  }

  reset(position: Vector3) {
    this.time = 0;
    this.done = false;
    this.ring.position.copyFrom(position);
    this.ring.scaling.setAll(1);
    this.ring.setEnabled(true);
  }

  update(delta: number) {
    this.time += delta;
    const scale = 1 + this.time * (this.ring.scaling.x > 1.2 ? 6.4 : 4.8);
    this.ring.scaling.setAll(scale);
    this.ring.position.y += delta * 0.15;
    if (this.time > 0.34) {
      this.done = true;
      this.ring.setEnabled(false);
    }
  }

  dispose() {
    this.ring.dispose();
  }
}

class RageTextEffect {
  private readonly element: HTMLSpanElement;
  private readonly position: Vector3;
  private readonly rotation: number;
  private time = 0;
  readonly life: number;
  done = false;

  constructor(private readonly scene: Scene, origin: Vector3, private velocity: Vector3, private readonly scale: number, index: number) {
    this.life = 0.56 + (index % 4) * 0.07;
    this.position = origin.add(new Vector3(0, 0.04 + (index % 3) * 0.12, 0));
    this.rotation = -24 + ((index * 17) % 48);
    this.element = document.createElement("span");
    this.element.className = "rage-text-burst";
    this.element.textContent = "怒破";
    this.element.style.fontSize = `${Math.round(24 + scale * 17)}px`;
    (document.querySelector(".arena-shell") ?? document.body).appendChild(this.element);
  }

  update(delta: number) {
    this.time += delta;
    this.velocity.y -= delta * 6.4;
    this.position.addInPlace(this.velocity.scale(delta));
    const fade = Math.max(0, 1 - this.time / this.life);
    const camera = this.scene.activeCamera;
    if (!camera) return;
    const engine = this.scene.getEngine();
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const projected = Vector3.Project(this.position, Matrix.Identity(), this.scene.getTransformMatrix(), viewport);
    const x = projected.x;
    const y = projected.y;
    this.element.style.visibility = projected.z >= 0 && projected.z <= 1 ? "visible" : "hidden";
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.style.opacity = `${fade}`;
    this.element.style.transform = `translate(-50%, -50%) rotate(${this.rotation + this.time * 90}deg) scale(${this.scale * (1 + this.time * 0.55)})`;
    if (this.time >= this.life) {
      this.done = true;
      this.dispose();
    }
  }

  dispose() {
    this.element.remove();
  }
}
