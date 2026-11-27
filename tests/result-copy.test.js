import { beforeAll, afterAll, expect, test, vi } from "vitest";

let dignityText;
beforeAll(async () => {
  vi.stubGlobal("navigator", { languages: ["ja"], language: "ja" });
  ({ dignityText } = await import("../web/js/result-view.js"));
});
afterAll(() => vi.unstubAllGlobals());

const limbs = ["leftArm", "rightArm", "leftFoot", "rightFoot"];

test("describes both sides using the losing player's four limbs and head", () => {
  const amounts = ["", "少し", "すごく", "たくさん", "徹底的に"];
  for (const loser of [0, 1]) {
    const winner = 1 - loser;
    for (const [count, amount] of amounts.entries()) {
      for (const headBroken of [false, true]) {
        const damaged = Object.fromEntries(limbs.map((name, index) => [name, { broken: index < count }]));
        damaged.head = { broken: headBroken };
        // A wing is not counted, and damage to the winner is irrelevant.
        damaged.wing = { broken: true };
        const players = [];
        players[loser] = { parts: damaged };
        players[winner] = { parts: { leftArm: { broken: true }, head: { broken: true } } };
        const outcomes = [];
        outcomes[loser] = "loss";
        outcomes[winner] = "win";
        const result = { outcomeBySeat: outcomes, players: [{ name: "花子" }, { name: "太郎" }], finalSnapshot: { players } };
        expect(dignityText(result, winner)).toBe(`${result.players[loser].name}の尊厳を${amount}破壊した${headBroken ? "💪" : ""}`);
        expect(dignityText(result, loser)).toBe(`${result.players[winner].name}に尊厳を${amount}破壊された${headBroken ? "💩💦" : ""}`);
      }
    }
  }
});

test("uses the displayed default name and leaves draws and interruptions without a victory caption", () => {
  expect(dignityText({ outcomeBySeat: ["win", "loss"], players: [{}, {}] }, 1)).toBe("プレイヤー1に尊厳を破壊された");
  expect(dignityText({ outcomeBySeat: ["draw", "draw"] }, 0)).toBe("");
  expect(dignityText({ outcomeBySeat: ["interrupted", "interrupted"] }, 1)).toBe("");
});
