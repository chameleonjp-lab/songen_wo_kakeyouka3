import { expect, test } from "@playwright/test";

const publicUrl = "https://chameleonjp-lab.github.io/songen_wo_kakeyouka3/";
const view = (page, name) => page.locator(`[data-screen="${name}"]`);
const part = (page, board, seat, name) => page.locator(`#${board} .fighter[data-seat="${seat}"] [data-part="${name}"]`);

async function hostRoom(page, capture) {
  await page.goto("./");
  await page.locator("#language").selectOption("ja");
  const home = view(page, "home");
  await expect(home.locator("#home-actions > *")).toHaveText(["ゲームの準備", /ルール説明/, "Xにシェア", "ランキング"]);
  await expect(home.locator(".ranking")).toBeHidden();
  await expect(home.locator("#home-title")).toHaveText("尊厳を 賭けようか3", { useInnerText: true });
  const languageBox = await home.locator("#language").boundingBox();
  const cardBox = await home.locator(".home-panel").boundingBox();
  expect(languageBox.x - cardBox.x).toBeLessThan(25);
  await expect(home.locator(".home-panel")).toHaveCSS("border-top-left-radius", "24px");
  expect((await home.locator(".home-panel").boundingBox()).y).toBeLessThan(40);
  await expect(home.locator("#prepare")).toHaveCSS("background-image", /linear-gradient/);
  await expect(home.locator("#home-actions > :visible").last()).toBeInViewport();
  await page.locator("#rules summary").click();
  await expect(page.locator("#rules li").first()).toBeVisible();
  await page.locator("#rules summary").click();
  await capture(page, "01-home-402x700");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "01-home-390x844");
  await page.setViewportSize({ width: 402, height: 700 });
  await page.getByRole("button", { name: "ゲームの準備" }).click();
  await expect(view(page, "register")).toBeVisible();
  await page.locator("#player-name").fill("<ほすと>");
  await page.locator("[data-face-id='12']").click();
  await capture(page, "02-registration");
  await page.getByRole("button", { name: "ルームを立てる" }).click();
  const input = page.locator("#invite-code");
  await expect(input).toHaveValue(/^[0-9A-Z]{12}$/);
  const code = await input.inputValue();
  const href = await page.locator("#invite-share").getAttribute("href");
  const share = new URL(href).searchParams.get("text");
  expect(share).toContain(`${publicUrl}#room=${code}`);
  expect(share).toContain(`ルームID ${code}`);
  await page.getByRole("button", { name: "待機室へ" }).click();
  await expect(page.locator("#lobby-status")).toHaveText("相手を待っています");
  return code;
}

test("two independent players can play, reload, keep the final board, and rematch", async ({ page: host, browser, baseURL }, testInfo) => {
  const capture = (page, name) => page.screenshot({ path: testInfo.outputPath("screen-" + name + ".png"), scale: "css" });
  await host.setViewportSize({ width: 402, height: 700 });
  const code = await hostRoom(host, capture);
  const guestContext = await browser.newContext({ baseURL, locale: "de-DE", viewport: { width: 402, height: 700 }, isMobile: true, hasTouch: true });
  try {
    const guest = await guestContext.newPage();
    await guest.goto(`./#room=${code.toLowerCase()}`);
    await expect(view(guest, "register")).toBeVisible();
    await expect(guest.locator("#join-code")).toHaveValue(code);
    await guest.locator("#player-name").fill("Gast");
    await guest.locator("[data-face-id='13']").click();
    await guest.locator("#join-button").click();
    await expect(view(guest, "lobby")).toBeVisible();
    await expect(host.locator("#lobby-players .player-name")).toHaveText(["<ほすと>", "Gast"]);
    await expect(guest.locator("#lobby-players .player-name")).toHaveText(["<ほすと>", "Gast"]);
    await expect(host.locator("#lobby-players [data-local=true] [data-you]")).toHaveText("あなた");
    await expect(guest.locator("#lobby-players [data-local=true] [data-you]")).toHaveText("Du");
    await guest.evaluate(value => { location.hash = `room=${value}`; }, code);
    await expect(guest.locator("#lobby-players [data-local=true] [data-you]")).toHaveText("Du");

    await capture(host, "03-lobby");
    await host.locator("#ready").click();
    await expect(view(host, "lobby")).toBeVisible();
    await guest.locator("#ready").click();
    await expect(host.locator("#countdown")).toBeVisible();
    await expect(view(host, "game")).toBeVisible();
    await expect(view(guest, "game")).toBeVisible();
    await expect(host.locator("#battle-time")).toBeVisible();
    await expect(host.locator("#battle-score")).toBeVisible();
    await expect(host.locator("#stamina-value")).toBeVisible();
    const movement = {};
    for (const key of ["jumpPressed", "left", "right", "crouch"]) {
      movement[key] = await host.locator(`[data-control="${key}"]`).boundingBox();
    }
    expect(movement.left.x + movement.left.width).toBeLessThan(movement.jumpPressed.x);
    expect(movement.right.x).toBeGreaterThan(movement.jumpPressed.x + movement.jumpPressed.width);
    expect(movement.left.y).toBe(movement.right.y);
    expect(movement.jumpPressed.y + movement.jumpPressed.height).toBeLessThan(movement.left.y);
    expect(movement.crouch.y).toBeGreaterThan(movement.left.y + movement.left.height);
    const attack = await host.locator('[data-control="attackPressed"]').boundingBox();
    const guard = await host.locator('[data-control="guardPressed"]').boundingBox();
    expect(guard.x + guard.width).toBeLessThan(attack.x);
    expect(guard.y).toBeGreaterThan(attack.y);
    expect(attack.width).toBe(attack.height);
    await expect(host.locator('[data-control="attackPressed"]')).toHaveCSS("border-radius", "50%");
    expect(await host.locator('#game-board .fighter[data-seat="0"] .part').evaluateAll(parts =>
      parts.map(part => part.dataset.part ?? null)
    )).toEqual([null, "head", "wing", "leftArm", "heart", "rightArm", null, "leftFoot", "rightFoot"]);
    const matchId = await host.locator("#game-board").getAttribute("data-match-id");
    expect(matchId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(guest.locator("#game-board")).toHaveAttribute("data-match-id", matchId);

    await host.evaluate(() => {
      window.inputDraws = [];
      window.inputConfirms = [];
      window.addEventListener("songen:input-drawn", event => window.inputDraws.push(event.detail));
      window.addEventListener("songen:input-confirmed", event => window.inputConfirms.push(event.detail));
    });
    await capture(host, "04-game-402x700");
    const punch = host.locator('[data-control="attackPressed"]');
    await punch.tap();
    await expect(part(host, "game-board", 1, "leftArm")).toHaveAttribute("data-damage", "1");
    await expect.poll(async () => Number(await host.locator("#battle-score").textContent())).toBeLessThanOrEqual(-30);
    await expect.poll(() => host.evaluate(() => window.inputDraws.length)).toBe(1);
    await expect.poll(() => host.evaluate(() => window.inputConfirms.length)).toBe(1);
    await host.waitForTimeout(650);
    await punch.tap();
    await expect(part(guest, "game-board", 1, "leftArm")).toHaveAttribute("data-broken", "true");
    await expect(part(host, "game-board", 1, "leftArm")).toHaveAttribute("data-broken", "true");

    await guest.reload();
    await expect(guest.locator("#game-board")).toHaveAttribute("data-match-id", matchId);
    await expect(guest.locator('[data-control="guardPressed"]')).toBeEnabled();
    await expect(part(guest, "game-board", 1, "leftArm")).toHaveAttribute("data-broken", "true");
    await guest.setViewportSize({ width: 700, height: 402 });
    for (const control of await guest.locator("[data-control]").all()) await expect(control).toBeInViewport();
    await capture(guest, "04-game-700x402");
    await guest.locator("#forfeit").click();
    await expect(guest.locator("#forfeit-dialog")).toBeVisible();
    await guest.locator("#confirm-forfeit").click();
    await expect(view(host, "announcement")).toBeVisible();
    await expect(view(guest, "announcement")).toBeVisible();
    await expect(host.locator("#announcement-outcome")).toHaveText("勝利");
    await expect(host.locator("#announcement-reason")).toHaveText("降参で決着");
    await expect(part(host, "final-board", 1, "leftArm")).toHaveAttribute("data-broken", "true");
    await expect(part(guest, "final-board", 1, "leftArm")).toHaveAttribute("data-broken", "true");
    const tick = await host.locator("#final-board").getAttribute("data-tick");
    expect(Number(tick)).toBeGreaterThan(0);
    await expect(guest.locator("#final-board")).toHaveAttribute("data-tick", tick);
    await expect(guest.locator("#final-board")).toHaveAttribute("data-match-id", matchId);
    await host.waitForTimeout(700);
    await expect(view(host, "announcement")).toBeVisible();
    await expect(host.locator("#final-board")).toHaveAttribute("data-tick", tick);
    await expect(host.locator("#show-score")).toBeInViewport();
    for (const face of await guest.locator("#final-board .fighter [data-part=head]").all()) await expect(face).toBeInViewport();
    await guest.setViewportSize({ width: 402, height: 700 });
    await expect(guest.locator("#final-board")).toHaveAttribute("data-tick", tick);
    await expect(guest.locator("#show-score")).toBeInViewport();

    await capture(host, "05-announcement");
    await host.locator("#show-score").click();
    await guest.locator("#show-score").click();
    await expect(host.locator("#score-actions > :visible")).toHaveText(["ルームに戻る", "Xにシェア", "ホーム"]);
    await expect(guest.locator("#score-actions > :visible")).toHaveCount(2);
    await expect(guest.locator("#return-to-room")).toBeHidden();
    await expect(host.locator("#score-breakdown > div")).toHaveCount(9);
    await expect(host.locator("#score-actions .ranking")).toBeHidden();
    await expect(host.locator("#ranking-status")).toBeHidden();
    const hostShare = new URL(await host.locator("#score-share").getAttribute("href")).searchParams.get("text");
    expect(hostShare).toContain(`勝利・スコア ${await host.locator("#score-value").textContent()}`);
    expect(hostShare).toContain(publicUrl);

    await capture(host, "06-score");
    await host.locator("#return-to-room").click();
    await expect(view(host, "lobby")).toBeVisible();
    await expect(host.locator("#lobby-code")).toHaveText(code);
    await expect(view(guest, "score")).toBeVisible();
    await guest.reload();
    await expect(view(guest, "score")).toBeVisible();
    await guest.locator("#score-actions [data-home]").click();
    await guest.locator("#prepare").click();
    await guest.locator("#join-code").fill(code);
    await guest.locator("#join-button").click();
    await expect(view(guest, "lobby")).toBeVisible();
    await host.locator("#ready").click();
    await guest.locator("#ready").click();
    await expect(view(host, "game")).toBeVisible();
    await expect(host.locator("#game-board")).not.toHaveAttribute("data-match-id", matchId);
    await expect(host.locator("#game-board")).toHaveAttribute("data-match-id", /^[0-9a-f-]{36}$/);
  } finally {
    await guestContext.close();
  }
});

test("manual invite is selectable when clipboard fails and all original languages load", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText() { return Promise.reject(new Error("unavailable")); } }
    });
  });
  await page.goto("./");
  await expect(page.locator("#language option")).toHaveCount(15);
  for (const locale of ["zh-Hant", "fr", "th", "ja"]) {
    await page.locator("#language").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  await page.locator("#prepare").click();
  await page.locator("#join-button").click();
  await expect(page.locator("#register-status")).toHaveText("12文字のルームIDを入力してください。");
  await page.locator("#create-room").click();
  await expect(page.locator("#invite-code")).toHaveValue(/^[0-9A-Z]{12}$/);
  await page.locator("#copy-room").click();
  await expect(page.locator("#copy-status")).toHaveText(/IDを選択してコピー/);
  const selection = await page.locator("#invite-code").evaluate(input => [input.selectionStart, input.selectionEnd]);
  expect(selection).toEqual([0, 12]);
});

const sampleRoom = "123456789ABC";
const sampleMatch = "01234567-89ab-cdef-0123-456789abcdef";
const samplePlayers = [
  { name: "Host", faceId: 12, ready: true, connected: true },
  { name: "Guest", faceId: 13, ready: true, connected: true }
];

function roomPacket(phase, generation = 1) {
  return {
    type: "room", code: sampleRoom, phase, generation, seat: 0,
    players: phase === "waiting" ? [samplePlayers[0], null] : samplePlayers,
    matchId: phase === "waiting" ? null : sampleMatch,
    serverNow: Date.now(), expiresAt: Date.now() + 60_000,
    startAt: null, pauseDeadline: null
  };
}

async function resumeGame(page) {
  await page.addInitScript(({ code, matchId }) => {
    localStorage.setItem("songen_language", "ja");
    sessionStorage.setItem("songen3_active_room", JSON.stringify({
      code, matchId, seat: 0, seatKey: "0".repeat(32), screen: "game"
    }));
  }, { code: sampleRoom, matchId: sampleMatch });
}

test("a restarted server can confirm interruption at an older checkpoint", async ({ page }) => {
  const { createMatch, toSnapshot } = await import("../../game/rules.js");
  const state = createMatch({ matchId: sampleMatch, players: samplePlayers });
  state.statsBySeat[0].score = 120;
  state.players[0].stamina = 3;
  const snapshot = { ...toSnapshot(state), tick: 61 };
  const finalSnapshot = { ...snapshot, tick: 60 };
  let socket;
  await resumeGame(page);
  await page.routeWebSocket(`**/v1/rooms/${sampleRoom}/socket`, route => {
    socket = route;
    route.onMessage(raw => {
      if (JSON.parse(raw).type !== "auth") return;
      route.send(JSON.stringify(roomPacket("playing")));
      route.send(JSON.stringify({ type: "snapshot", matchId: sampleMatch, phase: "playing", snapshot, events: [], acks: [0, 0] }));
    });
  });
  await page.goto("./");
  const board = page.locator("#game-board");
  await expect(board).toHaveAttribute("data-tick", "61");
  await expect(page.locator("#battle-score")).toHaveText("120");
  await expect(page.locator("#stamina-value")).toHaveText("3.0");
  socket.send(JSON.stringify({ type: "snapshot", matchId: sampleMatch, phase: "playing", snapshot: { ...snapshot, tick: 59 }, events: [], acks: [0, 0] }));
  await expect(board).toHaveAttribute("data-tick", "61");
  await expect(page.locator("#battle-score")).toHaveText("120");
  await expect(page.locator("#stamina-value")).toHaveText("3.0");
  socket.send(JSON.stringify({
    type: "finished", matchId: sampleMatch, finalSnapshot, players: samplePlayers,
    outcomeBySeat: ["interrupted", "interrupted"], scoreBySeat: [null, null], statsBySeat: [],
    expiresAt: Date.now() + 60_000, reason: "interrupted"
  }));
  await expect(view(page, "announcement")).toBeVisible();
  await expect(page.locator("#announcement-outcome")).toHaveText("通信中断");
  await expect(page.locator("#final-board")).toHaveAttribute("data-tick", "60");
  await page.locator("#show-score").click();
  await expect(page.locator("#score-value")).toHaveText("—");
});

test("seat revocation leaves the last board visible without inventing a result", async ({ page }) => {
  const { createMatch, toSnapshot } = await import("../../game/rules.js");
  const snapshot = toSnapshot(createMatch({ matchId: sampleMatch, players: samplePlayers }));
  let socket;
  await resumeGame(page);
  await page.routeWebSocket(`**/v1/rooms/${sampleRoom}/socket`, route => {
    socket = route;
    route.onMessage(raw => {
      if (JSON.parse(raw).type !== "auth") return;
      route.send(JSON.stringify(roomPacket("playing")));
      route.send(JSON.stringify({ type: "snapshot", matchId: sampleMatch, phase: "playing", snapshot, events: [], acks: [0, 0] }));
    });
  });
  await page.goto("./");
  await expect(page.locator("#game-board")).toHaveAttribute("data-tick", "0");
  socket.send(JSON.stringify({ type: "error", code: "credentials" }));
  await expect(view(page, "game")).toBeVisible();
  await expect(page.locator("#battle-status")).toHaveText("この席には接続できません。");
  await expect(page.locator("#game-board")).toHaveAttribute("data-tick", "0");
  await expect(view(page, "announcement")).toBeHidden();
  await page.locator("#disconnected-home").click();
  await expect(view(page, "home")).toBeVisible();
});

test("a return request retries after reconnect and sends once per connection", async ({ page }) => {
  const { createMatch, toSnapshot, resolveMatch } = await import("../../game/rules.js");
  const state = createMatch({ matchId: sampleMatch, players: samplePlayers });
  const final = {
    type: "finished", matchId: sampleMatch, finalSnapshot: toSnapshot(state), players: samplePlayers,
    ...resolveMatch(state, "forfeit", ["win", "loss"]), expiresAt: Date.now() + 60_000, rankingStatus: "sent"
  };
  let connections = 0;
  const returningGenerations = [];
  const authMatchIds = [];
  await resumeGame(page);
  await page.routeWebSocket(`**/v1/rooms/${sampleRoom}/socket`, socket => {
    const generation = ++connections;
    socket.onMessage(raw => {
      const message = JSON.parse(raw);
      if (message.type === "auth") {
        authMatchIds.push(message.matchId);
        socket.send(JSON.stringify(roomPacket("finished", generation)));
        socket.send(JSON.stringify(final));
        if (generation === 2) socket.send(JSON.stringify(roomPacket("finished", generation)));
      }
      if (message.type === "returnToRoom") {
        returningGenerations.push(message.generation);
        if (generation === 1) {
          socket.send(JSON.stringify({ type: "error", code: "disconnected" }));
          socket.close();
        }
        else socket.send(JSON.stringify(roomPacket("waiting", generation)));
      }
    });
  });
  await page.goto("./");
  await page.locator("#show-score").click();
  await page.locator("#return-to-room").click();
  await expect(view(page, "lobby")).toBeVisible();
  expect(authMatchIds).toEqual([sampleMatch, null]);
  expect(returningGenerations).toEqual([1, 2]);
});
