// Bronze & Blood Arena UI frame — the full-screen canvas stays austere so the bronze HUD and active battle retain visual priority.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { arenaAssets } from "@/game/assets";
import { createGameScene, type GameHandle } from "@/game/scene";

type HudState = {
  health: number;
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
};

type EntryRoarTrace = Record<string, { count: number; pan: number; reverb: boolean }>;
type TouchDirection = "up" | "down" | "left" | "right";
type TouchAction = "light" | "heavy" | "guard" | "rage" | "dodge";

const INITIAL_HUD: HudState = { health: 100, rage: 0, kills: 0, combo: 0, enemies: 0, route: "FIND THE OPENING", started: false, paused: false, fallen: false, challengeVisible: false, challenger: "BEAR", taunt: "その翼、へし折る。", challengeProgress: 0, lockOn: false };

function emitTouchAction(action: TouchAction) {
  window.dispatchEvent(new CustomEvent("arena-touch-action", { detail: { action } }));
}

function emitTouchMove(direction: TouchDirection, active: boolean) {
  window.dispatchEvent(new CustomEvent("arena-touch-move", { detail: { direction, active } }));
}

function touchMoveHandlers(direction: TouchDirection, onPressed: (id: string, active: boolean) => void) {
  const setDirection = (event: ReactPointerEvent<HTMLButtonElement>, active: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    if (active) event.currentTarget.setPointerCapture?.(event.pointerId);
    onPressed(direction, active);
    emitTouchMove(direction, active);
  };
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => setDirection(event, true),
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => setDirection(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => setDirection(event, false),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => setDirection(event, false),
  };
}

function Meter({ label, value, tone, ready = false }: { label: string; value: number; tone: "health" | "rage"; ready?: boolean }) {
  return (
    <div className={`meter-block ${ready ? "meter-ready" : ""}`}>
      <div className="meter-label"><span>{label}</span><strong>{Math.max(0, Math.round(value)).toString().padStart(3, "0")}</strong></div>
      <div className={`meter-track ${tone}`}><div className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

export default function GameCanvas({ autoStart = false }: { autoStart?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [entryRoars, setEntryRoars] = useState<EntryRoarTrace>({});
  const [pressedTouch, setPressedTouch] = useState<Record<string, boolean>>({});
  const query = new URLSearchParams(window.location.search);
  const markTouchPressed = (id: string, active: boolean) => setPressedTouch((current) => ({ ...current, [id]: active }));
  const touchActionHandlers = (action: TouchAction) => {
    const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      markTouchPressed(action, false);
    };
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        markTouchPressed(action, true);
        emitTouchAction(action);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
    };
  };
  const isDemo = query.has("demo");
  const audioDebug = query.has("audioDebug");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
    let handle: GameHandle | null = null;
    let disposed = false;
    createGameScene(engine, canvas).then((game) => {
      if (disposed) {
        game.dispose();
        return;
      }
      handle = game;
      if (autoStart) game.start();
      if (autoStart && new URLSearchParams(window.location.search).has("launchAudit")) console.info("[LaunchAudit] game started");
      engine.runRenderLoop(() => game.scene.render());
    });
    const onResize = () => engine.resize();
    const onHud = (event: Event) => setHud((event as CustomEvent<HudState>).detail);
    const onEntryRoar = (event: Event) => {
      const detail = (event as CustomEvent<{ variant: string; count: number; pan: number; reverb: boolean }>).detail;
      setEntryRoars((current) => ({ ...current, [detail.variant]: { count: detail.count, pan: detail.pan, reverb: detail.reverb } }));
      if (audioDebug) console.info(`[AudioDebug] entry roar ${detail.variant} count=${detail.count} pan=${detail.pan.toFixed(2)} reverb=${detail.reverb}`);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("arena-hud", onHud);
    window.addEventListener("arena-entry-roar", onEntryRoar);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("arena-hud", onHud);
      window.removeEventListener("arena-entry-roar", onEntryRoar);
      handle?.dispose();
      engine.dispose();
      startedRef.current = false;
    };
  }, []);

  const command = (value: string) => window.dispatchEvent(new CustomEvent("arena-command", { detail: { command: value } }));

  return (
    <main className="arena-shell" aria-label="Barbarian Arena game">
      <canvas ref={canvasRef} className="arena-canvas" style={{ touchAction: "none" }} tabIndex={0} />
      <section className="arena-hud" aria-live="polite">
        <div className="hud-top">
          <div className="vitals"><Meter label="VIGOR" value={hud.health} tone="health" /><Meter label="RAGE" value={hud.rage} tone="rage" ready={hud.rage >= 100} /></div>
          <div className="brand-lockup"><img src={arenaAssets.sigil} alt="" /><div><span>BRONZE &amp; BLOOD</span><strong>ARENA PROTOCOL</strong></div></div>
          <div className="counter-panel"><span>THE FALLEN</span><strong>{hud.kills.toString().padStart(3, "0")}</strong><small>{hud.enemies} HOSTILES REMAIN</small><small className={`lock-on-badge ${hud.lockOn ? "is-locked" : ""}`}>{hud.lockOn ? "LOCK ON · 1P" : "THIRD PERSON"}</small></div>
        </div>
        <div className="hud-bottom">
          <div className="combat-strip"><span className="keycap">J</span><span className="controller-key">□</span><b>WEAK</b><i>→</i><span className="keycap">K</span><span className="controller-key">△</span><b>HEAVY</b><i>→</i><span className="keycap">L</span><span className="controller-key">L1</span><b>GUARD</b><i>→</i><span className="keycap rage-key">F</span><span className="controller-key">R2</span><b>怒破</b><i>→</i><span className="keycap">SPACE</span><b>DODGE</b></div>
          <div className={`status-pill ${hud.route.includes("HEAVY") || hud.route.includes("GUARD") || hud.route.includes("COUNTER") || hud.route.includes("怒破") ? "finisher-active" : ""}`}><span>{hud.route}</span>{hud.combo > 1 && <b>COMBO × {hud.combo}</b>}</div>
          <div className="movement-note">W A S D <span>MOVE</span> · HOLD MOUSE <span>LOOK</span></div>
        </div>
      </section>

      {!hud.started && !isDemo && !autoStart && (
        <section className="intro-panel">
          <div className="arena-seal" aria-hidden="true"><span>Ⅲ</span><i /></div>
          <img className="intro-sigil" src={arenaAssets.sigil} alt="" />
          <p className="eyebrow">COMBAT PROTOTYPE 01</p>
          <h1>群れを割れ。<br />間合いを奪え。</h1>
          <p className="intro-copy">蛮族は闘技場の外縁から絶えず出現する。弱攻撃をつなぎ、重い一撃で戦列を断て。</p>
          <p className="threat-line"><span>HOSTILES BEYOND THE RING</span><strong>∞</strong></p>
          <button className="enter-button" onClick={() => command("start")}>ARENAへ入る <span>↗</span></button>
          <p className="input-note">キーボード：WASD / J / K / L / F / SPACE　　コントローラー表記：□ / △ / L1 / R2</p>
        </section>
      )}

      {!hud.started && !isDemo && autoStart && (
        <section className="game-loading-panel in-game-loading" aria-live="polite" aria-busy="true">
          <p className="eyebrow">PREPARING THE BLOOD RING</p>
          <h1>闘技場を構築中</h1>
          <div className="game-loading-track" aria-hidden="true"><i /></div>
        </section>
      )}

      {isDemo && audioDebug && (
        <aside className="audio-debug-panel" aria-label="Enemy entry roar trace">
          <span>ENTRY ROAR TRACE</span>
          {(["bear", "crocodile", "gorilla", "hippopotamus", "lion", "rhinoceros"] as const).map((variant) => <b key={variant}>{variant.toUpperCase()} <i>{entryRoars[variant]?.count ?? 0}</i><small>{entryRoars[variant] ? ` P${entryRoars[variant].pan.toFixed(2)} ${entryRoars[variant].reverb ? "RV" : "--"}` : " P0.00 --"}</small></b>)}
        </aside>
      )}

      {(hud.started || isDemo) && (
        <nav className="mobile-controller" aria-label="スマホ操作">
          <div className="touch-dpad" aria-label="移動">
            <span />
            <button type="button" className={pressedTouch.up ? "is-pressed" : ""} aria-label="上へ" {...touchMoveHandlers("up", markTouchPressed)}>▲</button>
            <span />
            <button type="button" className={pressedTouch.left ? "is-pressed" : ""} aria-label="左へ" {...touchMoveHandlers("left", markTouchPressed)}>◀</button>
            <span />
            <button type="button" className={pressedTouch.right ? "is-pressed" : ""} aria-label="右へ" {...touchMoveHandlers("right", markTouchPressed)}>▶</button>
            <span />
            <button type="button" className={pressedTouch.down ? "is-pressed" : ""} aria-label="下へ" {...touchMoveHandlers("down", markTouchPressed)}>▼</button>
            <span />
          </div>
          <div className="touch-actions" aria-label="戦闘操作">
            <button type="button" className={`touch-action dodge ${pressedTouch.dodge ? "is-pressed" : ""}`} {...touchActionHandlers("dodge")}>回避</button>
            <button type="button" className={`touch-action guard ${pressedTouch.guard ? "is-pressed" : ""}`} {...touchActionHandlers("guard")}>防御</button>
            <button type="button" className={`touch-action rage ${pressedTouch.rage ? "is-pressed" : ""}`} {...touchActionHandlers("rage")}>怒破</button>
            <button type="button" className={`touch-action light ${pressedTouch.light ? "is-pressed" : ""}`} {...touchActionHandlers("light")}>弱攻撃</button>
            <button type="button" className={`touch-action heavy ${pressedTouch.heavy ? "is-pressed" : ""}`} {...touchActionHandlers("heavy")}>強攻撃</button>
          </div>
        </nav>
      )}

      {hud.challengeVisible && !hud.paused && !hud.fallen && (
        <section className="challenger-panel" aria-live="assertive">
          <span className="challenger-kicker">ROUND {String(hud.kills + 1).padStart(2, "0")} · THE ARENA CALLS</span>
          <h2>NEXT <em>CHALLENGER</em></h2>
          <div className="challenger-rule"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, hud.challengeProgress))})` }} /></div>
          <p><strong>{hud.challenger}</strong><span>ENTERS THE BLOOD RING</span></p>
          <div className="taunt-bubble" role="status"><i />「{hud.taunt}」</div>
        </section>
      )}

      {hud.paused && !hud.fallen && (
        <section className="modal-panel"><p className="eyebrow">THE CROWD WAITS</p><h2>一時停止</h2><button className="enter-button" onClick={() => command("pause")}>戦いへ戻る</button></section>
      )}
      {hud.fallen && (
        <section className="modal-panel fallen-panel"><p className="eyebrow">THE ARENA REMEMBERS</p><h2>倒れた</h2><p>撃破数 {hud.kills}。群れは止まらない。</p><button className="enter-button" onClick={() => command("restart")}>もう一度、立つ</button></section>
      )}
    </main>
  );
}
