import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  arenaAssets,
  characterAssets,
  enemyCharacterKeys,
  publicAssetUrl,
} from "../client/src/game/assets";

const repoRoot = new URL("../", import.meta.url);

function relativePublicPath(url: string) {
  const base = import.meta.env.BASE_URL.replace(/^\.\//, "");
  const normalized = url.replace(/^\.\//, "");
  return normalized.startsWith(base) ? normalized.slice(base.length) : normalized.replace(/^\/+/, "");
}

describe("public asset registry", () => {
  it("joins the Vite public base without retaining a leading slash", () => {
    const base = import.meta.env.BASE_URL;
    expect(publicAssetUrl("/assets/example.glb")).toBe(`${base}assets/example.glb`);
    expect(publicAssetUrl("//assets/example.glb")).toBe(`${base}assets/example.glb`);
    expect(publicAssetUrl("assets/example.glb")).not.toContain("public/");
  });

  it("points every registered runtime asset at a shipped public file", () => {
    const registered = [...Object.values(arenaAssets), ...Object.values(characterAssets)];
    expect(registered.every((url) => url.startsWith(import.meta.env.BASE_URL))).toBe(true);
    expect(registered.every((url) => !url.includes("/public/") && !url.includes("attached_assets"))).toBe(true);
    for (const url of registered) {
      expect(existsSync(new URL(`client/public/${relativePublicPath(url)}`, repoRoot))).toBe(true);
    }
  });

  it("keeps the player-only keys out of the formal six-enemy route", () => {
    expect(enemyCharacterKeys).toEqual(["gorilla", "crocodile", "lion", "bear", "hippopotamus", "rhinoceros"]);
    expect(enemyCharacterKeys).not.toContain("goose");
    expect(enemyCharacterKeys).not.toContain("poop");
  });
});

describe("runtime wiring source contracts", () => {
  const gameWorldSource = readFileSync(new URL("../client/src/game/GameWorld.ts", import.meta.url), "utf8");
  const gameCanvasSource = readFileSync(new URL("../client/src/components/GameCanvas.tsx", import.meta.url), "utf8");
  const sceneSource = readFileSync(new URL("../client/src/game/scene.ts", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");

  it("keeps the scene and canvas lifecycle paired", () => {
    expect(sceneSource).toContain("world.dispose();");
    expect(sceneSource).toContain("scene.dispose();");
    expect(gameCanvasSource).toContain('document.addEventListener("visibilitychange", onVisibility)');
    expect(gameCanvasSource).toContain('canvas.addEventListener("webglcontextlost", onContextLost, false)');
    expect(gameCanvasSource).toContain('canvas.addEventListener("webglcontextrestored", onContextRestored, false)');
    expect(gameCanvasSource).toContain("handle?.dispose();");
    expect(gameCanvasSource).toContain("engine.dispose();");
    expect(gameCanvasSource).toContain('document.removeEventListener("visibilitychange", onVisibility)');
    expect(gameCanvasSource).toContain("engine.resize(true);");
    expect(gameCanvasSource).toContain("game.recoverFromRenderError(error);");
    expect(sceneSource).toContain("world.recoverFromRenderError(error);");
  });

  it("keeps auto-pause and retry commands wired to the world", () => {
    expect(gameWorldSource).toContain('window.addEventListener("arena-auto-pause", this.onAutoPause)');
    expect(gameWorldSource).toContain('if (this.started && !this.completed) this.paused = true;');
    expect(gameWorldSource).toContain('window.removeEventListener("arena-auto-pause", this.onAutoPause)');
    expect(gameWorldSource).toContain("requestLocalRetry();");
    expect(gameWorldSource).toContain('this.result = this.session.finish(reason');
  });

  it("keeps combat outcomes connected across just-guard, clash, guard-break and dignity loss", () => {
    expect(gameWorldSource).toContain("if (this.justGuardTime > 0) {");
    expect(gameWorldSource).toContain("this.world.triggerJustGuard(this.root.position);");
    expect(gameWorldSource).toContain("attacker?.openToCounter();");
    expect(gameWorldSource).toContain("if (this.guardBreak >= 100) {");
    expect(gameWorldSource).toContain("this.world.session.recordDamageTaken(brokenDamage);");
    expect(gameWorldSource).toContain("this.world.triggerAttackClash(Vector3.Lerp(this.world.player.root.position, this.root.position, 0.5));");
    expect(gameWorldSource.match(/if \(isDignityLost\(this\.dignity\) && !this\.poopTransformed\) this\.transformToPoop\(\);/g)).toHaveLength(2);
    expect(gameWorldSource).toContain("this.world.session.recordPoopTransformation();");
    expect(gameWorldSource).toContain("const targetPoint = enemy.targetPoint(target);");
    expect(gameWorldSource).toContain("const hitRadius = enemy.targetRadius(target);");
    expect(gameWorldSource).toContain("counterReady: this.player.counterReady()");
  });

  it("keeps dodge direction and cooldown in the player input path", () => {
    expect(gameWorldSource).toContain("const rawMove = this.world.input.movement();");
    expect(gameWorldSource).toContain("this.dodgeVelocity = this.world.movementDirection(rawMove.lengthSquared() > 0.02 ? rawMove : new Vector2(0, -1));");
    expect(gameWorldSource).toContain("this.dodgeTime = 0.32;");
    expect(gameWorldSource).toContain("this.dodgeCooldown = 0.82;");
    expect(gameWorldSource).toContain("this.root.position.addInPlace(this.dodgeVelocity.scale(delta * 13.5));");
  });

  it("keeps the touch control surface safe-area and reduced-motion rules", () => {
    expect(cssSource).toContain("--arena-safe-bottom");
    expect(cssSource).toContain(".mobile-controller");
    expect(cssSource).toContain("touch-action: none");
    expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(cssSource).toContain("@media (pointer: coarse), (max-width: 820px)");
    expect(cssSource).toContain("Portrait is the supported phone layout");
    expect(gameCanvasSource).toContain("orientation-landscape-label");
  });
});
