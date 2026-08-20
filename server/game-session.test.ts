import { describe, expect, it } from "vitest";
import { GameSession } from "../client/src/game/GameSession";
import { sanitizePlayerName } from "../client/src/game/PlayerProfile";

describe("six-duel run results", () => {
  it("creates a victory result after all six formal defeats", () => {
    const session = new GameSession("ガチョウ");
    for (let round = 0; round < 6; round += 1) session.recordEnemyDefeat(round, 1);
    const result = session.finish("victory", 72, 88, 6);
    expect(result.reason).toBe("victory");
    expect(result.defeats).toBe(6);
    expect(result.reachedRound).toBe(6);
    expect(result.remainingHealth).toBe(72);
    expect(result.remainingDignity).toBe(88);
    expect(session.rankingSubmission()).toMatchObject({
      gameSlug: "songen_wo_kakeyouka3",
      playerName: "ガチョウ",
      score: result.score,
    });
  });

  it("keeps defeat and retire as distinct result reasons with the score so far", () => {
    const defeated = new GameSession("PLAYER");
    defeated.recordEnemyDefeat(0, 1);
    defeated.recordDamageTaken(10);
    expect(defeated.finish("defeat", 0, 64, 2)).toMatchObject({ reason: "defeat", defeats: 1, reachedRound: 2 });

    const retired = new GameSession("PLAYER");
    retired.recordEnemyDefeat(0, 1);
    expect(retired.finish("retired", 40, 55, 2)).toMatchObject({ reason: "retired", defeats: 1, reachedRound: 2 });
  });
});

describe("local player name", () => {
  it("trims, limits and removes markup/control characters", () => {
    expect(sanitizePlayerName("  <b>鴨\u0000太郎</b>  ")).toBe("b鴨太郎/b");
    expect(Array.from(sanitizePlayerName("１２３４５６７８９０１２３４５")).length).toBe(12);
    expect(sanitizePlayerName("   ")).toBe("");
  });
});
