// Bronze & Blood Arena game surface. React owns presentation and touch affordances;
// GameWorld remains the source of truth for combat, camera, and run state.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { arenaAssets } from "@/game/assets";
import { loadCombatAudioSettings } from "@/game/CombatAudio";
import { loadHapticsPreference } from "@/game/Haptics";
import type { HitLocation } from "@/game/HitLocations";
import type { RunResult } from "@/game/GameSession";
import { activeArenaModal } from "@/game/ModalPriority";
import { safeRun } from "@/game/RuntimeResilience";
import { TouchLookController } from "@/game/TouchLookController";
import { createGameScene, type GameHandle } from "@/game/scene";

type TouchDirection = "up" | "down" | "left" | "right";
type TouchAction = "light" | "heavy" | "guard" | "dodge" | "rage" | "aim";
type ShakeMode = "full" | "weak" | "none";

/**
 * The gameplay branch has shipped both the original HudPayload names and the
 * normalized names used by the final UI contract. Keeping the raw event loose
 * here lets this view roll forward without making GameWorld a presentation API.
 */
type RawHudPayload = Partial<{
  health: number;
  playerHealth: number;
  playerMaxHealth: number;
  rage: number;
  kills: number;
  enemies: number;
  enemyCount: number;
  route: string;
  started: boolean;
  paused: boolean;
  fallen: boolean;
  challengeVisible: boolean;
  intermission: boolean;
  challenger: string;
  taunt: string;
  challengeProgress: number;
  intermissionRemaining: number;
  lockOn: boolean;
  lockTarget: boolean | string | null;
  playerName: string;
  dignity: number;
  playerDignity: number;
  playerMaxDignity: number;
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
  notice: string;
  guardBreak: number;
  counterReady: boolean;
  loadState: string;
  combo: number;
  result: RunResult | null;
}>;

type HudState = {
  playerName: string;
  playerHealth: number;
  playerMaxHealth: number;
  playerDignity: number;
  playerMaxDignity: number;
  rage: number;
  enemyCount: number;
  enemyHealth: number;
  enemyMaxHealth: number;
  enemyDignity: number;
  enemyMaxDignity: number;
  enemyName: string;
  round: number;
  roundTotal: number;
  score: number;
  elapsedSeconds: number;
  dodgeCooldown: number;
  dodgeReady: boolean;
  aimTarget: HitLocation;
  lockTarget: boolean;
  heartOpen: boolean;
  notice: string;
  guardBreak: number;
  counterReady: boolean;
  loadState: string;
  paused: boolean;
  started: boolean;
  fallen: boolean;
  intermission: boolean;
  combo: number;
  intermissionRemaining: number;
  result: RunResult | null;
  // Older challenge/audio audit fields remain useful during development.
  challenger: string;
  taunt: string;
  challengeProgress: number;
};

type EntryRoarTrace = Record<string, { count: number; pan: number; reverb: boolean }>;

const INITIAL_HUD: HudState = {
  playerName: "戦士",
  playerHealth: 100,
  playerMaxHealth: 100,
  playerDignity: 100,
  playerMaxDignity: 100,
  rage: 0,
  enemyCount: 0,
  enemyHealth: 0,
  enemyMaxHealth: 100,
  enemyDignity: 0,
  enemyMaxDignity: 100,
  enemyName: "対戦相手",
  round: 1,
  roundTotal: 6,
  score: 0,
  elapsedSeconds: 0,
  dodgeCooldown: 0,
  dodgeReady: true,
  aimTarget: "torso",
  lockTarget: false,
  heartOpen: false,
  notice: "",
  guardBreak: 0,
  counterReady: false,
  loadState: "idle",
  paused: false,
  started: false,
  fallen: false,
  intermission: false,
  combo: 0,
  intermissionRemaining: 0,
  result: null,
  challenger: "対戦相手",
  taunt: "",
  challengeProgress: 1,
};

const finiteNumber = (value: unknown, fallback: number) => {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const bounded = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function normalizeHud(raw: RawHudPayload): HudState {
  const playerMaxHealth = Math.max(1, finiteNumber(raw.playerMaxHealth, 100));
  const playerMaxDignity = Math.max(1, finiteNumber(raw.playerMaxDignity, 100));
  const enemyMaxHealth = Math.max(1, finiteNumber(raw.enemyMaxHealth, 100));
  const enemyMaxDignity = Math.max(1, finiteNumber(raw.enemyMaxDignity, 100));
  const dodgeCooldown = Math.max(0, finiteNumber(raw.dodgeCooldown, 0));
  const lockTarget = typeof raw.lockTarget === "string" ? raw.lockTarget.length > 0 : Boolean(raw.lockTarget ?? raw.lockOn);
  const intermission = Boolean(raw.intermission ?? raw.challengeVisible);
  const normalizedProgress = raw.challengeProgress === undefined ? 1 : bounded(finiteNumber(raw.challengeProgress, 1), 0, 1);
  return {
    playerName: String(raw.playerName ?? INITIAL_HUD.playerName),
    playerHealth: bounded(finiteNumber(raw.playerHealth ?? raw.health, 100), 0, playerMaxHealth),
    playerMaxHealth,
    playerDignity: bounded(finiteNumber(raw.playerDignity ?? raw.dignity, 100), 0, playerMaxDignity),
    playerMaxDignity,
    rage: bounded(finiteNumber(raw.rage, 0)),
    enemyCount: Math.max(0, Math.round(finiteNumber(raw.enemyCount ?? raw.enemies, 0))),
    enemyHealth: bounded(finiteNumber(raw.enemyHealth, 0), 0, enemyMaxHealth),
    enemyMaxHealth,
    enemyDignity: bounded(finiteNumber(raw.enemyDignity, 0), 0, enemyMaxDignity),
    enemyMaxDignity,
    enemyName: String(raw.enemyName ?? raw.challenger ?? INITIAL_HUD.enemyName),
    round: Math.max(1, Math.round(finiteNumber(raw.round, 1))),
    roundTotal: Math.max(1, Math.round(finiteNumber(raw.roundTotal ?? raw.totalRounds, 6))),
    score: Math.max(0, Math.round(finiteNumber(raw.score, 0))),
    elapsedSeconds: Math.max(0, finiteNumber(raw.elapsedSeconds ?? raw.elapsed, 0)),
    dodgeCooldown,
    dodgeReady: raw.dodgeReady ?? dodgeCooldown <= 0,
    aimTarget: raw.aimTarget === "head" || raw.aimTarget === "heart" ? raw.aimTarget : "torso",
    lockTarget,
    heartOpen: Boolean(raw.heartOpen),
    notice: String(raw.notice || raw.route || ""),
    guardBreak: bounded(finiteNumber(raw.guardBreak, 0)),
    counterReady: Boolean(raw.counterReady),
    loadState: String(raw.loadState ?? (raw.started ? "ready" : "idle")),
    paused: Boolean(raw.paused),
    started: Boolean(raw.started),
    fallen: Boolean(raw.fallen),
    intermission,
    combo: Math.max(0, Math.round(finiteNumber(raw.combo, 0))),
    intermissionRemaining: Math.max(0, finiteNumber(raw.intermissionRemaining, 0)),
    result: raw.result ?? null,
    challenger: String(raw.challenger ?? raw.enemyName ?? INITIAL_HUD.challenger),
    taunt: String(raw.taunt ?? ""),
    challengeProgress: normalizedProgress,
  };
}

function dispatchArenaAction(action: TouchAction, down: boolean) {
  // `arena-action` is the normalized contract. The touch alias keeps this UI
  // compatible with the current InputManager while the game layer migrates.
  window.dispatchEvent(new CustomEvent("arena-action", { detail: { action, down } }));
  window.dispatchEvent(new CustomEvent("arena-touch-action", { detail: { action, down, active: down } }));
}

function dispatchArenaMove(direction: TouchDirection, active: boolean) {
  window.dispatchEvent(new CustomEvent("arena-touch-move", { detail: { direction, active, down: active } }));
}

function dispatchArenaLook(dx: number, dy: number) {
  window.dispatchEvent(new CustomEvent("arena-look", { detail: { dx, dy } }));
  window.dispatchEvent(new CustomEvent("arena-touch-look", { detail: { dx, dy } }));
}

function dispatchCommand(command: string, value?: string | number | boolean) {
  window.dispatchEvent(new CustomEvent("arena-command", { detail: value === undefined ? { command } : { command, value } }));
}

function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function targetLabel(target: HitLocation) {
  return target === "head" ? "頭・尊厳" : target === "heart" ? "心臓" : "胴体";
}

function meterPercent(value: number, max: number) {
  return max > 0 ? bounded((value / max) * 100) : 0;
}

function Meter({ label, value, max, tone, ready = false }: { label: string; value: number; max: number; tone: "health" | "dignity" | "rage"; ready?: boolean }) {
  return (
    <div className={`meter-block ${ready ? "meter-ready" : ""} ${tone === "dignity" && value <= 0 ? "meter-broken" : ""}`}>
      <div className="meter-label"><span>{label}</span><strong>{Math.round(Math.max(0, value))}<small>/{Math.round(max)}</small></strong></div>
      <div className={`meter-track ${tone}`}><div className="meter-fill" style={{ width: `${meterPercent(value, max)}%` }} /></div>
    </div>
  );
}

function FighterCard({ side, name, health, maxHealth, dignity, maxDignity, rage, player }: { side: "player" | "enemy"; name: string; health: number; maxHealth: number; dignity: number; maxDignity: number; rage?: number; player?: boolean }) {
  return (
    <section className={`fighter-card ${side}-card`} aria-label={player ? "プレイヤー情報" : "敵情報"}>
      <div className="fighter-heading"><span>{player ? "PLAYER" : "RIVAL"}</span><strong>{name}</strong></div>
      <Meter label="体力" value={health} max={maxHealth} tone="health" />
      <Meter label="尊厳" value={dignity} max={maxDignity} tone="dignity" />
      {player && <Meter label="怒気" value={rage ?? 0} max={100} tone="rage" ready={(rage ?? 0) >= 100} />}
    </section>
  );
}

type PointerButtonProps = {
  action: TouchAction;
  label: string;
  detail?: string;
  className?: string;
  disabled?: boolean;
  pressed: boolean;
  onPressed: (action: TouchAction, down: boolean) => void;
};

function ActionButton({ action, label, detail, className = "", disabled = false, pressed, onPressed }: PointerButtonProps) {
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onPressed(action, false);
  };
  return (
    <button
      type="button"
      className={`touch-action ${action} ${pressed ? "is-pressed" : ""} ${className}`}
      data-action={action}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onPressed(action, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={release}
      onClick={(event) => {
        // Pointer input is already handled above. A zero-detail click is the
        // keyboard/assistive-technology path and must remain playable.
        if (event.detail !== 0 || disabled) return;
        event.preventDefault();
        onPressed(action, true);
        window.setTimeout(() => onPressed(action, false), 80);
      }}
    >
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </button>
  );
}

function ResultBreakdown({ result }: { result: RunResult }) {
  const rows: Array<[string, string | number]> = [
    ["撃破数", `${result.defeats} / 6`],
    ["到達ラウンド", `${result.reachedRound} / 6`],
    ["クリアタイム", formatClock(result.clearTimeSeconds)],
    ["残り体力", result.remainingHealth],
    ["残り尊厳", result.remainingDignity],
    ["心臓命中", result.heartHits],
    ["頭部命中", result.headHits],
    ["ジャストガード", result.justGuards],
    ["攻撃相殺", result.clashes],
    ["最大コンボ", result.maxCombo],
    ["命中精度", `${result.accuracyPercent}%`],
    ["使用技数", result.uniqueMoves],
    ["被ダメージ", result.damageTaken],
    ["尊厳喪失", result.dignityLost],
    ["糞化回数", result.poopTransformations],
  ];
  return (
    <div className="result-breakdown" aria-label="戦績内訳">
      {rows.map(([label, value]) => <div className="result-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  );
}

function resultMessage(result: RunResult) {
  const reason = result.reason === "victory" ? "全戦突破" : result.reason === "retired" ? "リタイア" : "敗北";
  return `尊厳を賭けようか3｜${result.playerName}｜${reason}｜スコア ${result.score}｜ランク ${result.grade}`;
}

function trapModalFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export default function GameCanvas({ autoStart = false, playerName }: { autoStart?: boolean; playerName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lookSurfaceRef = useRef<HTMLDivElement>(null);
  const lookControllerRef = useRef(new TouchLookController());
  const contextLostRef = useRef(false);
  const renderFailureRef = useRef(false);
  const startedRef = useRef(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [entryRoars, setEntryRoars] = useState<EntryRoarTrace>({});
  const [pressedTouch, setPressedTouch] = useState<Record<string, boolean>>({});
  const [showControls, setShowControls] = useState(false);
  const initialAudioSettings = useMemo(() => loadCombatAudioSettings(), []);
  const [masterVolume, setMasterVolume] = useState(initialAudioSettings.master);
  const [musicVolume, setMusicVolume] = useState(initialAudioSettings.music);
  const [sfxVolume, setSfxVolume] = useState(initialAudioSettings.sfx);
  const [ambientVolume, setAmbientVolume] = useState(initialAudioSettings.ambient);
  const [muted, setMuted] = useState(initialAudioSettings.muted);
  const [hapticsEnabled, setHapticsEnabled] = useState(() => loadHapticsPreference() ?? true);
  const [shakeMode, setShakeMode] = useState<ShakeMode>("full");
  const [shareStatus, setShareStatus] = useState("");
  const [contextLost, setContextLost] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [assetNotice, setAssetNotice] = useState("");
  const assetNoticeTimerRef = useRef<number | null>(null);
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const isDemo = query.has("demo");
  const audioDebug = query.has("audioDebug");

  const markTouchPressed = useCallback((id: string, active: boolean) => {
    setPressedTouch((current) => ({ ...current, [id]: active }));
  }, []);

  const handleActionPressed = useCallback((action: TouchAction, down: boolean) => {
    markTouchPressed(action, down);
    dispatchArenaAction(action, down);
  }, [markTouchPressed]);

  const handleDirectionPressed = useCallback((direction: TouchDirection, active: boolean) => {
    markTouchPressed(direction, active);
    dispatchArenaMove(direction, active);
  }, [markTouchPressed]);

  const command = useCallback((value: string, payload?: string | number | boolean) => dispatchCommand(value, payload), []);

  useEffect(() => {
    const resetTouchPresentation = () => {
      setPressedTouch({});
      lookControllerRef.current = new TouchLookController();
    };
    const onVisibilityReset = () => {
      if (document.hidden) resetTouchPresentation();
    };
    window.addEventListener("blur", resetTouchPresentation);
    window.addEventListener("orientationchange", resetTouchPresentation);
    document.addEventListener("visibilitychange", onVisibilityReset);
    return () => {
      window.removeEventListener("blur", resetTouchPresentation);
      window.removeEventListener("orientationchange", resetTouchPresentation);
      document.removeEventListener("visibilitychange", onVisibilityReset);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    contextLostRef.current = false;
    renderFailureRef.current = false;
    setContextLost(false);
    setSceneError("");
    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const maxDevicePixelRatio = isAppleMobile ? 1.35 : isCoarsePointer ? 1.5 : 2;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
    let engine: Engine;
    try {
      engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true, adaptToDeviceRatio: false });
    } catch (error) {
      console.error("WebGL engine initialization failed", error);
      setSceneError("この端末で3D表示を開始できませんでした。ブラウザを閉じてから再読み込みしてください。");
      startedRef.current = false;
      return;
    }
    let disposed = false;
    const reportEngineFailure = (error: unknown) => {
      if (disposed) return;
      console.error("WebGL engine operation failed", error);
      setSceneError("3D表示の制御に失敗しました。再読み込みしてもう一度お試しください。");
    };
    // The canvas is absolutely positioned and its CSS size is established by
    // the first layout pass. Resize once before the first render so Safari
    // does not start with the default 300×150 drawing buffer.
    if (!safeRun(() => {
      engine.setHardwareScalingLevel(1 / devicePixelRatio);
      engine.resize(true);
    }, reportEngineFailure)) {
      safeRun(() => engine.dispose());
      startedRef.current = false;
      return;
    }
    let handle: GameHandle | null = null;
    let renderLoop: (() => void) | null = null;
    let contextRecoveryPending = false;
    let contextRestoredDuringInitialization = false;
    // Do not read document.hidden on every frame. Safari may keep a stale
    // hidden value while a tab is restored, which otherwise makes the first
    // visible render loop return forever. Visibility events remain the source
    // of truth, with pageshow/focus/user activity as safe recovery signals.
    let pagePaused = document.visibilityState === "hidden";
    const pauseRenderLoop = () => {
      const activeLoop = renderLoop;
      if (activeLoop) safeRun(() => engine.stopRenderLoop(activeLoop), reportEngineFailure);
    };
    const resumeRenderLoop = () => {
      const activeLoop = renderLoop;
      if (activeLoop && !pagePaused && !contextLostRef.current) safeRun(() => engine.runRenderLoop(activeLoop), reportEngineFailure);
    };
    const resizeEngine = () => {
      safeRun(() => engine.resize(true), reportEngineFailure);
    };
    const onVisibility = () => {
      pagePaused = document.visibilityState === "hidden";
      if (pagePaused) pauseRenderLoop();
      else {
        resizeEngine();
        resumeRenderLoop();
      }
    };
    const onPageShow = () => {
      pagePaused = false;
      resizeEngine();
      resumeRenderLoop();
    };
    const onFocus = () => {
      // A focus event is only delivered to the active page. Treat it as a
      // recovery signal for Safari's missed visibilitychange transition.
      pagePaused = false;
      resizeEngine();
      resumeRenderLoop();
    };
    const onUserActivity = () => {
      if (pagePaused) {
        pagePaused = false;
        resizeEngine();
        resumeRenderLoop();
      }
    };
    const onPageHide = () => {
      pagePaused = true;
      pauseRenderLoop();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextRecoveryPending = true;
      contextRestoredDuringInitialization = false;
      contextLostRef.current = true;
      setContextLost(true);
      pauseRenderLoop();
      window.dispatchEvent(new CustomEvent("arena-auto-pause"));
    };
    const onContextRestored = () => {
      if (!handle) {
        contextRestoredDuringInitialization = true;
        return;
      }
      if (!safeRun(() => handle?.recoverFromRenderError(new Error("WebGL context restored; switching to stable procedural presentation")), reportEngineFailure)) return;
      contextRecoveryPending = false;
      contextRestoredDuringInitialization = false;
      renderFailureRef.current = false;
      contextLostRef.current = false;
      setContextLost(false);
      resizeEngine();
      resumeRenderLoop();
    };
    void createGameScene(engine, canvas, playerName)
      .then((game) => {
        if (disposed) {
          safeRun(() => game.dispose());
          return;
        }
        handle = game;
        if (contextRecoveryPending && contextRestoredDuringInitialization) {
          if (!safeRun(() => game.recoverFromRenderError(new Error("WebGL context restored during scene initialization")), reportEngineFailure)) return;
          contextRecoveryPending = false;
          contextRestoredDuringInitialization = false;
          contextLostRef.current = false;
          setContextLost(false);
        }
        resizeEngine();
        if (autoStart) game.start();
        if (autoStart && query.has("launchAudit")) console.info("[LaunchAudit] game started");
        renderLoop = () => {
          if (pagePaused || contextLostRef.current) return;
          try {
            game.scene.render();
          } catch (error) {
            if (!renderFailureRef.current) {
              renderFailureRef.current = true;
              if (!safeRun(() => game.recoverFromRenderError(error), reportEngineFailure)) {
                pauseRenderLoop();
                return;
              }
              console.warn("Arena render failed; continuing with procedural fighter presentation", error);
            } else {
              pauseRenderLoop();
              console.error("Arena render failed after procedural recovery", error);
              setSceneError("映像の復旧に失敗しました。再読み込みしてもう一度お試しください。");
            }
          }
        };
        // Register even when the first callback happens during a hidden
        // transition. The callback guard above makes this safe and avoids a
        // permanently frozen first frame if visibilitychange was missed.
        const activeLoop = renderLoop;
        if (activeLoop) safeRun(() => engine.runRenderLoop(activeLoop), reportEngineFailure);
      })
      .catch((error) => {
        if (disposed) return;
        console.error("Game scene initialization failed", error);
        setSceneError("3D闘技場を開始できませんでした。再読み込みしてもう一度お試しください。");
      });
    const onResize = () => engine.resize();
    const onHud = (event: Event) => setHud(normalizeHud((event as CustomEvent<RawHudPayload>).detail ?? {}));
    const onEntryRoar = (event: Event) => {
      const detail = (event as CustomEvent<{ variant: string; count: number; pan: number; reverb: boolean }>).detail;
      if (!detail) return;
      setEntryRoars((current) => ({ ...current, [detail.variant]: { count: detail.count, pan: detail.pan, reverb: detail.reverb } }));
      if (audioDebug) console.info(`[AudioDebug] entry roar ${detail.variant} count=${detail.count} pan=${detail.pan.toFixed(2)} reverb=${detail.reverb}`);
    };
    const onAssetError = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (!message) return;
      setAssetNotice(message);
      if (assetNoticeTimerRef.current !== null) window.clearTimeout(assetNoticeTimerRef.current);
      assetNoticeTimerRef.current = window.setTimeout(() => setAssetNotice(""), 4200);
    };
    const onRenderRecovered = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (!message) return;
      setAssetNotice(message);
      if (assetNoticeTimerRef.current !== null) window.clearTimeout(assetNoticeTimerRef.current);
      assetNoticeTimerRef.current = window.setTimeout(() => setAssetNotice(""), 4200);
    };
    const onRuntimeFatal = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message;
      pauseRenderLoop();
      setSceneError(message || "ゲームの更新を続けられませんでした。再読み込みしてもう一度お試しください。");
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pointerdown", onUserActivity, { passive: true });
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);
    window.addEventListener("arena-hud", onHud);
    window.addEventListener("arena-entry-roar", onEntryRoar);
    window.addEventListener("arena-asset-error", onAssetError);
    window.addEventListener("arena-render-recovered", onRenderRecovered);
    window.addEventListener("arena-runtime-fatal", onRuntimeFatal);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointerdown", onUserActivity);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      window.removeEventListener("arena-hud", onHud);
      window.removeEventListener("arena-entry-roar", onEntryRoar);
      window.removeEventListener("arena-asset-error", onAssetError);
      window.removeEventListener("arena-render-recovered", onRenderRecovered);
      window.removeEventListener("arena-runtime-fatal", onRuntimeFatal);
      if (assetNoticeTimerRef.current !== null) window.clearTimeout(assetNoticeTimerRef.current);
      pauseRenderLoop();
      safeRun(() => handle?.dispose());
      safeRun(() => engine.dispose());
      startedRef.current = false;
    };
  }, [audioDebug, autoStart, playerName, query]);

  const onDirectionPointer = (direction: TouchDirection, active: boolean, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (active) event.currentTarget.setPointerCapture?.(event.pointerId);
    handleDirectionPressed(direction, active);
  };

  const onDirectionSyntheticClick = (direction: TouchDirection, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    event.preventDefault();
    handleDirectionPressed(direction, true);
    window.setTimeout(() => handleDirectionPressed(direction, false), 100);
  };

  const onLookDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    lookControllerRef.current.pointerDown({ id: event.pointerId, x: event.clientX, y: event.clientY });
  };

  const onLookMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = lookControllerRef.current.pointerMove({ id: event.pointerId, x: event.clientX, y: event.clientY });
    if (delta) dispatchArenaLook(delta.dx, delta.dy);
  };

  const onLookEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    lookControllerRef.current.pointerUp(event.pointerId);
  };

  const preventTouchScroll = (event: ReactTouchEvent<HTMLElement>) => event.preventDefault();

  const copyResult = useCallback(async () => {
    if (!hud.result) return;
    const text = resultMessage(hud.result);
    let copied = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied && typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try { copied = document.execCommand("copy"); } catch { copied = false; }
      textarea.remove();
    }
    setShareStatus(copied ? "コピーしました" : "コピーできませんでした");
    window.setTimeout(() => setShareStatus(""), 2200);
  }, [hud.result]);

  const shareResult = useCallback(async () => {
    if (!hud.result) return;
    const text = resultMessage(hud.result);
    const shareNavigator = navigator as Navigator & { share?: (data: { title: string; text: string }) => Promise<void> };
    if (shareNavigator.share) {
      try {
        await shareNavigator.share({ title: "尊厳を賭けようか3", text });
        setShareStatus("共有しました");
        return;
      } catch {
        // Dismissal or an unavailable share target falls back to clipboard.
      }
    }
    await copyResult();
  }, [copyResult, hud.result]);

  const setVolume = (value: number) => {
    setMasterVolume(value);
    window.dispatchEvent(new CustomEvent("arena-audio-settings", { detail: { master: value } }));
  };

  const setAudioBus = (bus: "music" | "sfx" | "ambient", value: number) => {
    if (bus === "music") setMusicVolume(value);
    if (bus === "sfx") setSfxVolume(value);
    if (bus === "ambient") setAmbientVolume(value);
    window.dispatchEvent(new CustomEvent("arena-audio-settings", { detail: { [bus]: value } }));
  };

  const setMute = (value: boolean) => {
    setMuted(value);
    window.dispatchEvent(new CustomEvent("arena-audio-settings", { detail: { muted: value } }));
  };

  const setHaptics = (value: boolean) => {
    setHapticsEnabled(value);
    window.dispatchEvent(new CustomEvent("arena-haptics-settings", { detail: { enabled: value } }));
  };

  const setShake = (value: ShakeMode) => {
    setShakeMode(value);
    command("shake", value);
  };

  const activeModal = activeArenaModal({
    sceneError: Boolean(sceneError),
    contextLost,
    hasResult: Boolean(hud.result),
    paused: hud.paused,
  });
  const isLoading = !activeModal && (hud.loadState === "loading" || (autoStart && !isDemo && !hud.started && !hud.result));
  const showTouchUi = hud.started && !activeModal;
  const lockLabel = hud.lockTarget ? "LOCK ON" : "FREE LOOK";
  const statusText = hud.notice || (hud.heartOpen ? "心臓が開いた — 狙いを切り替えろ" : "戦列を見極めろ");

  return (
    <main className="arena-shell" aria-label="尊厳を賭けようか3 闘技場" style={{ "--arena-panel-image": `url("${arenaAssets.visualTarget}")` } as CSSProperties}>
      <canvas ref={canvasRef} className="arena-canvas" style={{ touchAction: "none" }} tabIndex={activeModal ? -1 : 0} aria-hidden={activeModal ? true : undefined} aria-label="闘技場の3Dビュー" />
      <div
        ref={lookSurfaceRef}
        className="touch-camera-surface"
        aria-label="視点操作"
        aria-hidden={activeModal ? true : undefined}
        role="application"
        style={activeModal ? { pointerEvents: "none" } : undefined}
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
        onLostPointerCapture={onLookEnd}
        onTouchStart={preventTouchScroll}
        onTouchMove={preventTouchScroll}
      ><span>DRAG TO LOOK</span></div>

      <section className="arena-hud">
        <div className="hud-top">
          <FighterCard side="player" player name={hud.playerName || playerName} health={hud.playerHealth} maxHealth={hud.playerMaxHealth} dignity={hud.playerDignity} maxDignity={hud.playerMaxDignity} rage={hud.rage} />
          <div className="brand-lockup">
            <img src={arenaAssets.sigil} alt="" />
            <div><span>BRONZE &amp; BLOOD</span><strong>尊厳を賭けようか3</strong></div>
            <div className="round-readout"><span>ROUND</span><strong>{hud.round}<small> / {hud.roundTotal}</small></strong></div>
          </div>
          <section className="arena-score-panel" aria-label="スコアと戦闘状態">
            <span>SCORE</span><strong>{hud.score.toLocaleString()}</strong>
            <small>{formatClock(hud.elapsedSeconds)} · 敵 {hud.enemyCount}</small>
            <small className={`lock-on-badge ${hud.lockTarget ? "is-locked" : ""}`}>{lockLabel}</small>
          </section>
        </div>

        <div className="enemy-hud-wrap">
          <FighterCard side="enemy" name={hud.enemyName} health={hud.enemyHealth} maxHealth={hud.enemyMaxHealth} dignity={hud.enemyDignity} maxDignity={hud.enemyMaxDignity} />
          <div className="enemy-target-state">
            <span className={hud.heartOpen ? "heart-open" : ""}>{hud.heartOpen ? "HEART OPEN" : `狙い：${targetLabel(hud.aimTarget)}`}</span>
            {hud.combo > 1 && <b>COMBO × {hud.combo}</b>}
          </div>
        </div>

        <button className="pause-button" type="button" aria-label={hud.paused ? "戦闘を再開" : "一時停止"} onClick={() => command("pause")} disabled={!hud.started || Boolean(hud.result)}>
          <span aria-hidden="true">Ⅱ</span><small>{hud.paused ? "再開" : "PAUSE"}</small>
        </button>

        <div className="hud-bottom">
          <div className="combat-strip" aria-label="キーボード操作">
            <span className="keycap">J</span><b>弱</b><span className="keycap">K</span><b>強</b><span className="keycap">L</span><b>防御</b><span className="keycap">F</span><b>怒破</b><span className="keycap">SPACE</span><b>回避</b>
          </div>
          <div className={`status-pill ${hud.heartOpen || hud.guardBreak > 70 ? "finisher-active" : ""}`} aria-live="polite">
            <span>{statusText}</span>
            {hud.counterReady && <small>カウンター受付：強攻撃</small>}
            {hud.guardBreak > 0 && <small>ガード崩し {Math.round(hud.guardBreak)}%</small>}
          </div>
          <div className="combat-meta"><span>狙い切替 Q</span><span>経過 {formatClock(hud.elapsedSeconds)}</span></div>
        </div>
      </section>

      {showTouchUi && (
        <nav className="mobile-controller" aria-label="モバイル操作" onTouchStart={preventTouchScroll} onTouchMove={preventTouchScroll}>
          <div className="touch-move-cluster">
            <span className="touch-cluster-label">MOVE</span>
            <div className="touch-dpad" aria-label="左移動">
              <span />
              <button type="button" data-direction="up" aria-label="上へ" aria-pressed={Boolean(pressedTouch.up)} className={pressedTouch.up ? "is-pressed" : ""} onPointerDown={(event) => onDirectionPointer("up", true, event)} onPointerUp={(event) => onDirectionPointer("up", false, event)} onPointerCancel={(event) => onDirectionPointer("up", false, event)} onLostPointerCapture={(event) => onDirectionPointer("up", false, event)} onClick={(event) => onDirectionSyntheticClick("up", event)}>▲</button>
              <span />
              <button type="button" data-direction="left" aria-label="左へ" aria-pressed={Boolean(pressedTouch.left)} className={pressedTouch.left ? "is-pressed" : ""} onPointerDown={(event) => onDirectionPointer("left", true, event)} onPointerUp={(event) => onDirectionPointer("left", false, event)} onPointerCancel={(event) => onDirectionPointer("left", false, event)} onLostPointerCapture={(event) => onDirectionPointer("left", false, event)} onClick={(event) => onDirectionSyntheticClick("left", event)}>◀</button>
              <span className="dpad-core" aria-hidden="true">＋</span>
              <button type="button" data-direction="right" aria-label="右へ" aria-pressed={Boolean(pressedTouch.right)} className={pressedTouch.right ? "is-pressed" : ""} onPointerDown={(event) => onDirectionPointer("right", true, event)} onPointerUp={(event) => onDirectionPointer("right", false, event)} onPointerCancel={(event) => onDirectionPointer("right", false, event)} onLostPointerCapture={(event) => onDirectionPointer("right", false, event)} onClick={(event) => onDirectionSyntheticClick("right", event)}>▶</button>
              <span />
              <button type="button" data-direction="down" aria-label="下へ" aria-pressed={Boolean(pressedTouch.down)} className={pressedTouch.down ? "is-pressed" : ""} onPointerDown={(event) => onDirectionPointer("down", true, event)} onPointerUp={(event) => onDirectionPointer("down", false, event)} onPointerCancel={(event) => onDirectionPointer("down", false, event)} onLostPointerCapture={(event) => onDirectionPointer("down", false, event)} onClick={(event) => onDirectionSyntheticClick("down", event)}>▼</button>
              <span />
            </div>
          </div>
          <div className="touch-actions" aria-label="右戦闘操作">
            <ActionButton action="guard" label="防御" pressed={Boolean(pressedTouch.guard)} onPressed={handleActionPressed} />
            <ActionButton action="dodge" label="回避" detail={hud.dodgeReady ? "READY" : `${hud.dodgeCooldown.toFixed(1)}s`} pressed={Boolean(pressedTouch.dodge)} onPressed={handleActionPressed} />
            <ActionButton action="aim" label="狙い" detail={targetLabel(hud.aimTarget)} pressed={Boolean(pressedTouch.aim)} onPressed={handleActionPressed} />
            <ActionButton action="light" label="弱攻撃" detail="□" pressed={Boolean(pressedTouch.light)} onPressed={handleActionPressed} />
            <ActionButton action="heavy" label="強攻撃" detail="△" pressed={Boolean(pressedTouch.heavy)} onPressed={handleActionPressed} />
            <ActionButton action="rage" label="怒破" detail={hud.rage >= 100 ? "READY" : `${Math.round(hud.rage)}%`} disabled={hud.rage < 100} pressed={Boolean(pressedTouch.rage)} onPressed={handleActionPressed} />
          </div>
        </nav>
      )}

      {hud.intermission && hud.started && !activeModal && (
        <section className="intermission-banner" aria-live="assertive">
          <span>ROUND {String(hud.round).padStart(2, "0")} · 次の対戦相手</span>
          <strong>{hud.challenger || hud.enemyName}</strong>
          {hud.taunt && <p>「{hud.taunt}」</p>}
          {hud.intermissionRemaining > 0 && <small className="intermission-countdown">開始まで {hud.intermissionRemaining.toFixed(1)}s</small>}
          <div className="intermission-rule"><i style={{ transform: `scaleX(${hud.challengeProgress})` }} /></div>
        </section>
      )}

      {hud.started && !activeModal && (
        <aside className="orientation-hint" aria-label="画面向きの案内">
          <span className="orientation-portrait-label">縦画面でプレイ中</span>
          <span className="orientation-landscape-label">縦画面に戻してください</span>
        </aside>
      )}

      {!hud.started && !isDemo && !autoStart && !activeModal && (
        <section className="intro-panel" aria-label="ゲーム開始">
          <div className="arena-seal" aria-hidden="true"><span>Ⅲ</span><i /></div>
          <img className="intro-sigil" src={arenaAssets.sigil} alt="" />
          <p className="eyebrow">BRONZE &amp; BLOOD ARENA</p>
          <h1>尊厳を<br />賭けようか3</h1>
          <p className="intro-copy">{playerName}、6体との一騎打ち。体力を奪うか、頭を狙って尊厳を奪うか、戦い方で得点が変わります。</p>
          <p className="threat-line"><span>SIX CONSECUTIVE DUELS</span><strong>6</strong></p>
          <button className="enter-button" type="button" onClick={() => command("start")}>闘技場へ入る <span>↗</span></button>
          <p className="input-note">左で移動、右で攻撃。空いた画面中央をドラッグして視点を動かします。</p>
        </section>
      )}

      {isLoading && (
        <section className="game-loading-panel in-game-loading" aria-live="polite" aria-busy="true">
          <p className="eyebrow">PREPARING THE BLOOD RING</p>
          <h1>闘技場を構築中</h1>
          <div className="game-loading-track" aria-hidden="true"><i /></div>
        </section>
      )}

      {activeModal === "graphics-recovery" && (
        <section className="graphics-recovery-overlay" role="dialog" aria-modal="true" aria-labelledby="graphics-recovery-title" aria-live="assertive" onKeyDown={trapModalFocus}>
          <div className="graphics-recovery-panel">
            <p className="eyebrow">GRAPHICS CONNECTION LOST</p>
            <h2 id="graphics-recovery-title">映像を再接続中</h2>
            <p>端末の負荷が落ち着くまでお待ちください。復旧しない場合は再読み込みしてください。</p>
            <button className="enter-button" type="button" autoFocus onClick={() => window.location.reload()}>再読み込み</button>
          </div>
        </section>
      )}

      {activeModal === "scene-error" && (
        <section className="graphics-recovery-overlay" role="dialog" aria-modal="true" aria-labelledby="scene-error-title" aria-live="assertive" onKeyDown={trapModalFocus}>
          <div className="graphics-recovery-panel">
            <p className="eyebrow">ARENA START FAILED</p>
            <h2 id="scene-error-title">闘技場を開始できません</h2>
            <p>{sceneError}</p>
            <button className="enter-button" type="button" autoFocus onClick={() => window.location.reload()}>再試行</button>
          </div>
        </section>
      )}

      {assetNotice && <aside className="asset-error-notice" role="status">{assetNotice}</aside>}

      {audioDebug && (
        <aside className="audio-debug-panel" aria-label="Enemy entry roar trace">
          <span>ENTRY ROAR TRACE</span>
          {["bear", "crocodile", "gorilla", "hippopotamus", "lion", "rhinoceros"].map((variant) => <b key={variant}>{variant.toUpperCase()} <i>{entryRoars[variant]?.count ?? 0}</i><small>{entryRoars[variant] ? ` P${entryRoars[variant].pan.toFixed(2)} ${entryRoars[variant].reverb ? "RV" : "--"}` : " P0.00 --"}</small></b>)}
        </aside>
      )}

      {activeModal === "pause" && (
        <section className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title" onKeyDown={trapModalFocus}>
          <div className="pause-panel">
            <p className="eyebrow">THE CROWD WAITS</p>
            <h2 id="pause-title">一時停止</h2>
            <p className="pause-player">{hud.playerName} · ROUND {hud.round}/{hud.roundTotal}</p>
            <div className="pause-actions"><button className="enter-button" type="button" autoFocus onClick={() => command("pause")}>戦いへ戻る</button><button className="quiet-button" type="button" onClick={() => command("retire")}>リタイア</button><button className="quiet-button" type="button" onClick={() => command("top")}>トップへ</button></div>
            <div className="pause-settings">
              <div className="settings-row"><span>全体音量</span><input aria-label="マスター音量" type="range" min="0" max="1" step="0.05" value={masterVolume} onChange={(event) => setVolume(Number(event.target.value))} /><strong>{Math.round(masterVolume * 100)}%</strong><button type="button" className="settings-button" onClick={() => setMute(!muted)} aria-pressed={muted}>{muted ? "ミュート解除" : "ミュート"}</button></div>
              <div className="settings-row"><span>音楽</span><input aria-label="音楽音量" type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={(event) => setAudioBus("music", Number(event.target.value))} /><strong>{Math.round(musicVolume * 100)}%</strong></div>
              <div className="settings-row"><span>効果音</span><input aria-label="効果音音量" type="range" min="0" max="1" step="0.05" value={sfxVolume} onChange={(event) => setAudioBus("sfx", Number(event.target.value))} /><strong>{Math.round(sfxVolume * 100)}%</strong></div>
              <div className="settings-row"><span>環境音</span><input aria-label="環境音音量" type="range" min="0" max="1" step="0.05" value={ambientVolume} onChange={(event) => setAudioBus("ambient", Number(event.target.value))} /><strong>{Math.round(ambientVolume * 100)}%</strong></div>
              <div className="settings-row"><span>振動</span><button type="button" className="settings-button" onClick={() => setHaptics(!hapticsEnabled)} aria-pressed={hapticsEnabled}>{hapticsEnabled ? "有効" : "無効"}</button></div>
              <div className="settings-row"><span>画面揺れ</span><div className="segmented-settings" role="group" aria-label="画面揺れ設定"><button type="button" className={shakeMode === "full" ? "selected" : ""} onClick={() => setShake("full")}>強</button><button type="button" className={shakeMode === "weak" ? "selected" : ""} onClick={() => setShake("weak")}>弱</button><button type="button" className={shakeMode === "none" ? "selected" : ""} onClick={() => setShake("none")}>なし</button></div></div>
            </div>
            <button type="button" className="controls-toggle" aria-expanded={showControls} onClick={() => setShowControls(!showControls)}>操作説明 <span>{showControls ? "▲" : "▼"}</span></button>
            {showControls && <div className="controls-help"><p><b>左</b> 移動　<b>弱/強</b> 攻撃　<b>防御</b> 長押し　<b>回避</b> 入力方向へ無敵移動</p><p><b>怒破</b> 怒気100%で相手を捉える連続攻撃　<b>狙い</b> 頭→心臓→胴体</p><p><b>中央</b> ドラッグで視点　キーボード：WASD / J / K / L / F / SPACE / Q</p></div>}
          </div>
        </section>
      )}

      {activeModal === "result" && hud.result && (
        <section className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title" onKeyDown={trapModalFocus}>
          <div className="result-panel">
            <p className="eyebrow">ARENA RECORD · {hud.result.playerName}</p>
            <div className="result-heading"><div><h2 id="result-title">{hud.result.reason === "victory" ? "全戦突破" : hud.result.reason === "retired" ? "リタイア" : "倒れた"}</h2><p>{hud.result.isNewBest ? "NEW PERSONAL BEST" : `BEST ${hud.result.personalBest.toLocaleString()}`}</p></div><strong className="result-grade">{hud.result.grade}</strong></div>
            <div className="result-score"><span>SCORE</span><strong>{hud.result.score.toLocaleString()}</strong></div>
            <ResultBreakdown result={hud.result} />
            <p className="share-status" aria-live="polite">{shareStatus}</p>
            <div className="result-actions"><button className="enter-button" type="button" autoFocus onClick={() => command("restart")}>再挑戦</button><button className="quiet-button" type="button" onClick={() => command("top")}>トップへ</button><button className="share-button" type="button" onClick={() => void shareResult()}>Web Share</button><button className="share-button" type="button" onClick={() => void copyResult()}>コピー</button></div>
          </div>
        </section>
      )}
    </main>
  );
}
