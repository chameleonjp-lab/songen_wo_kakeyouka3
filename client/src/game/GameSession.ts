import type { HitLocation, ResolvedHit } from "@/game/HitLocations";
import { applyScoreEvent, createScoreState, tickScore, type ScoreState } from "@/game/Score";
import { loadPersonalBest, savePersonalBest } from "@/game/PlayerProfile";

export type FinishReason = "victory" | "defeat" | "retired";

export type RunResult = Readonly<{
  playerName: string;
  reason: FinishReason;
  score: number;
  personalBest: number;
  isNewBest: boolean;
  defeats: number;
  reachedRound: number;
  clearTimeSeconds: number;
  remainingHealth: number;
  remainingDignity: number;
  heartHits: number;
  headHits: number;
  justGuards: number;
  clashes: number;
  uniqueMoves: number;
  maxCombo: number;
  accuracyPercent: number;
  damageTaken: number;
  dignityLost: number;
  poopTransformations: number;
  grade: "S" | "A" | "B" | "C" | "D";
}>;

export type RankingSubmission = Readonly<{
  gameSlug: "songen_wo_kakeyouka3";
  playerName: string;
  score: number;
  metadata: Omit<RunResult, "playerName" | "score" | "personalBest" | "isNewBest">;
}>;

function gradeResult(score: number, defeated: number, health: number, dignity: number, accuracy: number): RunResult["grade"] {
  const completion = defeated / 6;
  const preservation = (Math.max(0, health) + Math.max(0, dignity)) / 200;
  const value = score / 11_000 + completion * 0.4 + preservation * 0.18 + accuracy * 0.12;
  if (defeated === 6 && value >= 1.25) return "S";
  if (defeated === 6 && value >= 0.95) return "A";
  if (value >= 0.68) return "B";
  if (value >= 0.38) return "C";
  return "D";
}

export class GameSession {
  private scoreState: ScoreState = createScoreState();
  private finalResult: RunResult | null = null;

  constructor(readonly playerName: string) {}

  get score() {
    return this.scoreState;
  }

  get result() {
    return this.finalResult;
  }

  tick(deltaSeconds: number, roundActive = true) {
    if (!this.finalResult) this.scoreState = tickScore(this.scoreState, deltaSeconds, undefined, roundActive);
  }

  recordHit(hit: ResolvedHit, moveId: string) {
    this.scoreState = applyScoreEvent(this.scoreState, {
      type: "hit",
      damage: hit.damage,
      location: hit.location,
      scoreMultiplier: 1,
      critical: hit.critical,
      heartConfirmed: hit.heartConfirmed,
      moveId,
    });
  }

  recordJustGuard() {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "guard", just: true });
  }

  recordClash() {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "clash" });
  }

  recordEnemyDefeat(round: number, enemyMultiplier: number) {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "defeat", round, enemyMultiplier });
  }

  recordDamageTaken(amount: number) {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "damage-taken", amount });
  }

  recordDignityLoss(amount: number) {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "dignity-loss", amount });
  }

  recordPoopTransformation() {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "poop-transform" });
  }

  recordMiss() {
    this.scoreState = applyScoreEvent(this.scoreState, { type: "miss" });
  }

  finish(reason: FinishReason, remainingHealth: number, remainingDignity: number, reachedRound: number) {
    if (this.finalResult) return this.finalResult;
    if (reason === "victory") this.scoreState = applyScoreEvent(this.scoreState, { type: "clear" });
    const previousBest = loadPersonalBest();
    const personalBest = savePersonalBest(this.scoreState.total);
    const attempts = this.scoreState.hits + this.scoreState.misses;
    const accuracy = attempts > 0 ? this.scoreState.hits / attempts : 0;
    this.finalResult = Object.freeze({
      playerName: this.playerName,
      reason,
      score: Math.round(this.scoreState.total),
      personalBest,
      isNewBest: this.scoreState.total > previousBest,
      defeats: this.scoreState.defeats,
      reachedRound: Math.max(1, Math.min(6, reachedRound)),
      clearTimeSeconds: this.scoreState.elapsed,
      remainingHealth: Math.max(0, Math.round(remainingHealth)),
      remainingDignity: Math.max(0, Math.round(remainingDignity)),
      heartHits: this.scoreState.heartHits,
      headHits: this.scoreState.headHits,
      justGuards: this.scoreState.justGuards,
      clashes: this.scoreState.clashes,
      uniqueMoves: this.scoreState.uniqueMoves,
      maxCombo: this.scoreState.maxCombo,
      accuracyPercent: Math.round(accuracy * 100),
      damageTaken: Math.round(this.scoreState.damageTaken),
      dignityLost: Math.round(this.scoreState.dignityLost),
      poopTransformations: this.scoreState.poopTransformations,
      grade: gradeResult(this.scoreState.total, this.scoreState.defeats, remainingHealth, remainingDignity, accuracy),
    });
    return this.finalResult;
  }

  rankingSubmission(): RankingSubmission | null {
    if (!this.finalResult) return null;
    const { playerName, score, personalBest: _personalBest, isNewBest: _isNewBest, ...metadata } = this.finalResult;
    return Object.freeze({ gameSlug: "songen_wo_kakeyouka3", playerName, score, metadata });
  }
}

export function targetLabel(target: HitLocation) {
  return target === "head" ? "頭・尊厳" : target === "heart" ? "心臓" : "胴体";
}
