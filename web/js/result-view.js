import { $, displayName } from "./view.js";
import { language, t } from "./i18n.js";

const outcomes = { win: "m036", loss: "m112", draw: "m113", interrupted: "interrupted" };

export function outcomeText(result, seat) {
  return t(outcomes[result.outcomeBySeat[seat]] ?? "interrupted");
}

const limbs = ["leftArm", "rightArm", "leftFoot", "rightFoot"];

export function dignityText(result, seat) {
  const outcome = result.outcomeBySeat[seat];
  if (outcome !== "win" && outcome !== "loss") return "";

  const opponentSeat = 1 - seat;
  const won = outcome === "win";
  const parts = result.finalSnapshot?.players?.[won ? opponentSeat : seat]?.parts;
  const destroyed = limbs.filter(part => parts?.[part]?.broken).length;
  const intensity = destroyed ? t(`dignityLevel${destroyed}`) : "";
  const text = t(won ? "dignityWin" : "dignityLoss", {
    p0: displayName(result.players?.[opponentSeat], opponentSeat), p1: intensity,
  });
  return text + (parts?.head?.broken ? (won ? "💪" : "💩💦") : "");
}

function reasonText(result, seat) {
  if (result.reason === "interrupted") return "";
  return dignityText(result, seat) || t(result.reason === "forfeit" ? "forfeitReason" : result.reason);
}

export function formatScore(score) {
  return Number.isFinite(score) ? new Intl.NumberFormat(language).format(score) : "—";
}

export function showAnnouncement(result, seat, board) {
  $("#announcement-outcome").textContent = outcomeText(result, seat);
  const reason = reasonText(result, seat);
  $("#announcement-reason").textContent = reason;
  $("#announcement-reason").hidden = !reason;
  board.render(result.finalSnapshot);
}

function breakdownRows(result, seat) {
  const stats = result.statsBySeat[seat];
  const won = result.outcomeBySeat[seat] === "win";
  return [
    ["winBonus", Number(won), 5000],
    ["m042", stats.attacks, -30],
    ["m043", stats.guardSuccess, 120],
    ["m044", Math.max(0, stats.enemyPartsBroken - stats.enemyHeadBroken), 300],
    ["headBreak", stats.enemyHeadBroken, 1000],
    ["brokenPartHits", stats.enemyBrokenPartHits, 300],
    ["m045", stats.playerPartsBroken, -500],
    ["hitsOnOwnBrokenParts", stats.playerBrokenPartHits, -300],
    ["m046", stats.elapsedSec, -10]
  ];
}

export function showScore(result, seat, canReturn, rankingsPublic) {
  $("#score-outcome").textContent = outcomeText(result, seat);
  const reason = reasonText(result, seat);
  $("#score-reason").textContent = reason;
  $("#score-reason").hidden = !reason;
  $("#score-value").textContent = formatScore(result.scoreBySeat[seat]);
  $("#return-to-room").hidden = !canReturn;
  const breakdown = $("#score-breakdown");
  breakdown.replaceChildren();
  const haveScore = Number.isFinite(result.scoreBySeat[seat]) && Boolean(result.statsBySeat?.[seat]);
  breakdown.hidden = !haveScore;
  if (haveScore) {
    for (const [key, count, weight] of breakdownRows(result, seat)) {
      const row = document.createElement("div");
      const label = document.createElement("dt");
      const calculation = document.createElement("dd");
      label.textContent = t(key);
      calculation.textContent = `${formatScore(count)} × ${formatScore(weight)}`;
      row.append(label, calculation);
      breakdown.append(row);
    }
  }
  const rankingStatus = $("#ranking-status");
  rankingStatus.hidden = !rankingsPublic || result.rankingStatus !== "pending";
  rankingStatus.textContent = rankingStatus.hidden ? "" : t("rankingPending");
}
