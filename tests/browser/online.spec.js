import { expect, test } from "@playwright/test";

const publicUrl = "https://chameleonjp-lab.github.io/songen_wo_kakeyouka3/";
const view = (page, name) => page.locator(`[data-screen="${name}"]`);
const part = (page, board, seat, name) => page.locator(`#${board} .fighter[data-seat="${seat}"] [data-part="${name}"]`);

const composer = /^https:\/\/twitter\.com\/intent\/tweet\?/;

async function sharedText(page, button) {
  await page.route(composer, route => route.fulfill({ contentType: "text/html", body: "<h1>X share</h1>" }), { times: 1 });
  await Promise.all([page.waitForURL(composer), button.click()]);
  const text = new URL(page.url()).searchParams.get("text");
  await page.goBack();
  return text;
}

async function hostRoom(page, capture) {
  await page.goto("./");
  await page.locator("#language").selectOption("ja");
  const home = view(page, "home");
  await expect(home.locator("#home-actions > :visible")).toHaveText([
    "ゲームの準備(オンライン対戦)", /ルール説明/, "Xにシェア", "ランキング", "CPUと戦う", "CPUと連続試合"
  ]);
  await expect(home.locator("[data-i18n='intro']")).toHaveText("尊厳を賭けるのに距離なんて関係ない！");
  await expect(home.locator("#home-cpu")).toHaveAttribute("href", "https://chameleonjp-lab.github.io/songen_wo_kakeyouka/");
  await expect(home.locator("#home-cpu-series")).toHaveAttribute("href", "https://chameleonjp-lab.github.io/songen_wo_kakeyouka2/");
  await expect(home.locator("#open-keyboard-settings")).toBeHidden();
  await expect(home.locator(".ranking")).toBeVisible();
  await expect(home.locator(".ranking")).toHaveAttribute("href", /ranking\.html\?game=songen_wo_kakeyouka3_online$/);
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
  await page.getByRole("button", { name: "ゲームの準備(オンライン対戦)" }).click();
  await expect(view(page, "register")).toBeVisible();
  await page.locator("#player-name").fill("<ほすと>");
  await page.locator("[data-face-id='12']").click();
  await capture(page, "02-registration");
  await page.getByRole("button", { name: "ルームを立てる" }).click();
  const input = page.locator("#invite-code");
  await expect(input).toHaveValue(/^[0-9]{4}$/);
  const code = await input.inputValue();
  await page.locator("#invite-share").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Xでシェア" })).toBeInViewport();
  await capture(page, "02-room-invite");
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
    await expect(host.locator("#show-score")).toBeDisabled();
    await expect(guest.locator("#show-score")).toBeDisabled();
    await expect(host.locator("#show-score")).toHaveCSS("background-color", "rgb(67, 69, 76)");
    await expect(host.locator("#announcement-outcome")).toHaveText("勝利");
    await expect(host.locator("#announcement-reason")).toHaveText("Gastの尊厳を少し破壊した");
    await expect(guest.locator("#announcement-reason")).toHaveText("<ほすと> hat meine Würde ein wenig zerstört");
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

    const photoBox = await host.locator("#final-board").boundingBox();
    const fighterBox = await host.locator("#final-board .fighter").first().boundingBox();
    expect(fighterBox.width).toBeGreaterThan(125);
    expect(Math.abs((fighterBox.y + fighterBox.height / 2) - (photoBox.y + photoBox.height / 2))).toBeLessThan(6);
    await capture(host, "05-announcement");
    await host.locator("#show-score").click();
    await guest.locator("#show-score").click();
    await expect(host.locator("#score-actions > :visible")).toHaveText(["ルームに戻る", "Xに結果をシェア", "ホーム"]);
    await expect(guest.locator("#score-actions > :visible")).toHaveCount(3);
    await expect(guest.locator("#return-to-room")).toBeVisible();
    await expect(host.locator("#score-breakdown > div")).toHaveCount(9);
    await expect(host.locator("#ranking-status")).toBeHidden();
    await expect(host.locator("#score-reason")).toHaveText("Gastの尊厳を少し破壊した");
    const hostShare = await sharedText(host, host.getByRole("button", { name: "Xに結果をシェア" }));
    await expect(view(host, "score")).toBeVisible();
    expect(hostShare).toContain(`勝利・スコア ${await host.locator("#score-value").textContent()}`);
    expect(hostShare.split("\n")).toContain("Gastの尊厳を少し破壊した");
    expect(hostShare).toContain(publicUrl);

    await capture(host, "06-score");
    await host.locator("#return-to-room").click();
    await expect(view(host, "lobby")).toBeVisible();
    await expect(host.locator("#lobby-code")).toHaveText(code);
    await expect(view(guest, "score")).toBeVisible();
    await guest.reload();
    await expect(view(guest, "score")).toBeVisible();
    await guest.locator("#return-to-room").click();
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

test("only the owner can swap or remove a guest, and the guest can clear a remembered ID", async ({ page: host, browser, baseURL }) => {
  const code = await hostRoom(host, async () => {});
  const guestContext = await browser.newContext({ baseURL, locale: "ja-JP", viewport: { width: 402, height: 700 }, isMobile: true });
  try {
    const guest = await guestContext.newPage();
    await guest.goto("./");
    await guest.locator("#prepare").click();
    await guest.locator("#player-name").fill("花子");
    await guest.locator("#join-code").fill(code);
    await guest.locator("#join-button").click();
    await expect(view(guest, "lobby")).toBeVisible();
    await expect(guest.locator("#owner-actions")).toBeHidden();
    await guest.locator("#ready").click();
    await expect(host.locator("#lobby-players [data-seat='1'] [data-ready]")).toBeVisible();

    await host.locator("#swap-seats").click();
    await expect(host.locator("#lobby-players [data-local=true]")).toHaveAttribute("data-seat", "1");
    await expect(guest.locator("#lobby-players [data-local=true]")).toHaveAttribute("data-seat", "0");
    await expect(guest.locator("#ready")).toBeEnabled();
    await host.locator("#kick-guest").click();
    await expect(view(guest, "register")).toBeVisible();
    await expect(guest.locator("#register-status")).toHaveText(/退出しました/);
    await expect(guest.locator("#join-code")).toHaveValue(code);
    await expect(host.locator("#lobby-players [data-seat='0']")).toHaveAttribute("data-present", "false");

    await guest.locator("#join-button").click();
    await expect(guest.locator("#lobby-players [data-local=true]")).toHaveAttribute("data-seat", "0");
    await guest.locator("#leave-lobby").click();
    await expect(view(guest, "register")).toBeVisible();
    await expect(guest.locator("#join-code")).toHaveValue(code);
    await guest.locator("#clear-join-code").click();
    await expect(guest.locator("#join-code")).toHaveValue("");
    await expect(guest.locator("#clear-join-code")).toBeHidden();
    await guest.reload();
    await guest.locator("#prepare").click();
    await expect(guest.locator("#join-code")).toHaveValue("");

    await guest.locator("#join-code").fill(code);
    await guest.locator("#join-button").click();
    await expect(view(guest, "lobby")).toBeVisible();
    await host.locator("#lobby-home").click();
    await expect(view(guest, "register")).toBeVisible();
    await expect(guest.locator("#register-status")).toHaveText("相手が退出しました。");
    await guest.reload();
    await expect(view(guest, "home")).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test("cancelling while the server accepts a join releases the seat before retry", async ({ page: host, browser, baseURL }) => {
  const code = await hostRoom(host, async () => {});
  const context = await browser.newContext({ baseURL, locale: "ja-JP", viewport: { width: 402, height: 700 }, isMobile: true });
  try {
    const guest = await context.newPage();
    let acceptJoin, deliverReply;
    const accepted = new Promise(resolve => { acceptJoin = resolve; });
    const deliver = new Promise(resolve => { deliverReply = resolve; });
    await guest.route(`**/v1/rooms/${code}/join`, async route => {
      const response = await route.fetch();
      acceptJoin(response.status());
      await deliver;
      await route.fulfill({ response });
    }, { times: 1 });
    await guest.goto(`./#room=${code}`);
    await guest.locator("#join-button").click();
    try {
      expect(await accepted).toBe(200);
      await view(guest, "register").locator("[data-home]").click();
      await guest.locator("#prepare").click();
      await guest.locator("#join-button").click();
    } finally {
      deliverReply();
    }
    await expect(view(guest, "lobby")).toBeVisible();
    await expect(guest.locator("#ready")).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("leaving a score releases the seat and kicking a seat preserves the other score", async ({ page: host, browser, baseURL }) => {
  const code = await hostRoom(host, async () => {});
  const context = await browser.newContext({ baseURL, locale: "ja-JP", viewport: { width: 402, height: 700 }, isMobile: true });
  try {
    const guest = await context.newPage();
    await guest.goto(`./#room=${code}`);
    await guest.locator("#join-button").click();
    async function playToScore() {
      await host.locator("#ready").click();
      await guest.locator("#ready").click();
      await host.locator("#forfeit").click();
      await host.locator("#confirm-forfeit").click();
      await Promise.all([host, guest].map(page => page.locator("#show-score").click()));
    }

    await playToScore();
    await view(guest, "score").locator("[data-home]").click();
    await host.locator("#return-to-room").click();
    await expect(host.locator("#lobby-players [data-seat='1']")).toHaveAttribute("data-present", "false");
    await guest.locator("#prepare").click();
    await guest.locator("#join-button").click();
    await playToScore();

    const score = await guest.locator("#score-value").textContent();
    await host.locator("#return-to-room").click();
    await host.locator("#kick-guest").click();
    await expect(guest.locator("#return-to-room")).toBeHidden();
    await expect(guest.locator("#score-value")).toHaveText(score);
    await guest.reload();
    await expect(view(guest, "score")).toBeVisible();
    await expect(guest.locator("#return-to-room")).toBeHidden();
    await expect(guest.locator("#score-value")).toHaveText(score);
    await expect(guest.locator("#score-share")).toBeEnabled();
    await view(guest, "score").locator("[data-home]").click();
    await expect(view(guest, "home")).toBeVisible();
  } finally {
    await context.close();
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
  const thumbnail = await page.evaluate(async () => {
    const url = new URL(document.querySelector('meta[property="og:image"]').content);
    const picture = new Image();
    picture.src = url.pathname;
    await picture.decode();
    return [picture.naturalWidth, picture.naturalHeight];
  });
  expect(thumbnail).toEqual([1200, 630]);
  for (const locale of ["zh-Hant", "fr", "th", "ja"]) {
    await page.locator("#language").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  await page.locator("#prepare").click();
  await page.locator("#join-button").click();
  await expect(page.locator("#register-status")).toHaveText("4桁のルームIDを入力してください。");
  await page.locator("#create-room").click();
  await expect(page.locator("#invite-code")).toHaveValue(/^[0-9]{4}$/);
  await page.locator("#copy-room").click();
  await expect(page.locator("#copy-status")).toHaveText(/IDを選択してコピー/);
  const selection = await page.locator("#invite-code").evaluate(input => [input.selectionStart, input.selectionEnd]);
  expect(selection).toEqual([0, 4]);
  // In-app blockers can hide links that already point to a social sharing service.
  await page.addStyleTag({ content: 'a[href^="https://twitter.com/intent/"] { display: none !important; }' });
  const shareButton = page.getByRole("button", { name: "Xでシェア" });
  await expect(shareButton).toBeVisible();
  const copy = await page.locator("#copy-room").boundingBox();
  const share = await shareButton.boundingBox();
  expect(share.x).toBeGreaterThan(copy.x + copy.width);
  expect(share.y).toBeCloseTo(copy.y);

  const code = await page.locator("#invite-code").inputValue();
  const text = await sharedText(page, shareButton);
  expect(text.split("\n")).toEqual([
    "私と尊厳を賭けようよ！", `ルームID：${code}`, "#尊厳を賭けようか3", `${publicUrl}#room=${code}`
  ]);
  await expect(page.locator("#invite-code")).toHaveValue(code);
  await expect(shareButton).toBeVisible();
});

const sampleRoom = "0937";
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

test("both room roles can reload after a connection failure and keep their seat", async ({ browser, baseURL }, testInfo) => {
  for (const owner of [true, false]) {
    const seat = owner ? 1 : 0;
    const context = await browser.newContext({ baseURL, locale: "ja-JP", viewport: { width: 402, height: 700 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      const seatKey = "a".repeat(32);
      await page.addInitScript(({ code, seat, owner, seatKey }) => {
        if (sessionStorage.getItem("test-room-seeded")) return;
        sessionStorage.setItem("test-room-seeded", "true");
        sessionStorage.setItem("songen3_active_room", JSON.stringify({ code, seat, owner, seatKey, screen: "lobby" }));
      }, { code: sampleRoom, seat, owner, seatKey });

      let documentLoads = 0;
      let initialSocket;
      let connectionDropped = false;
      let lastAuth;
      page.on("request", request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++;
      });
      await page.routeWebSocket(`**/v1/rooms/${sampleRoom}/socket`, socket => {
        socket.onMessage(raw => {
          const packet = JSON.parse(raw);
          if (packet.type !== "auth") return;
          if (connectionDropped && documentLoads === 1) {
            socket.send(JSON.stringify({ type: "error", code: "network" }));
            return;
          }
          initialSocket ??= socket;
          lastAuth = packet;
          socket.send(JSON.stringify({
            ...roomPacket("waiting"), owner, seat, layout: 1,
            players: samplePlayers.map(player => ({ ...player, ready: false })),
          }));
        });
      });

      await page.goto("./");
      const reload = page.getByRole("button", { name: "再読み込み" });
      await expect(page.locator("#ready")).toBeEnabled();
      await expect(reload).toBeHidden();
      if (owner) {
        for (const label of ["席を入れ替える", "相手を外す"]) {
          const button = page.getByRole("button", { name: label });
          await expect(button).toBeVisible();
          expect(await button.evaluate(node => {
            const labelRange = document.createRange();
            labelRange.selectNodeContents(node);
            return labelRange.getClientRects().length;
          })).toBe(1);
        }
      }

      connectionDropped = true;
      initialSocket.close({ code: 1011, reason: "test disconnect" });
      await expect(reload).toBeVisible();
      await expect(page.locator("#ready")).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath(`screen-lobby-reload-${owner ? "owner" : "guest"}.png`), scale: "css" });
      await Promise.all([page.waitForEvent("load"), reload.click()]);
      await expect(view(page, "lobby")).toBeVisible();
      await expect(page.locator("#lobby-code")).toHaveText(sampleRoom);
      await expect(page.locator("#lobby-players [data-local=true]")).toHaveAttribute("data-seat", String(seat));
      await expect(page.locator("#ready")).toBeEnabled();
      await expect(reload).toBeHidden();
      expect(lastAuth.seatKey).toBe(seatKey);
    } finally {
      await context.close();
    }
  }
});

test("desktop keyboard settings save immediately and control the next match", async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({
    baseURL, locale: "ja-JP", viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: false,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
  });
  try {
    const page = await context.newPage();
    await page.goto("./");
    const settings = page.getByRole("button", { name: "設定", exact: true });
    await expect(page.locator("#rules + #open-keyboard-settings")).toBeVisible();
    await settings.click();
    const dialog = page.getByRole("dialog", { name: "設定" });
    const labels = dialog.locator("kbd");
    await expect(labels).toHaveText(["↑", "↓", "←", "→", "W", "D"]);
    const choose = async (action, key) => {
      const row = dialog.locator(`[data-binding="${action}"]`);
      await row.click();
      await page.keyboard.press(key);
      await expect(row).toHaveAttribute("aria-pressed", "false");
    };
    await choose("attackPressed", "d");
    await expect(labels).toHaveText(["↑", "↓", "←", "→", "D", "W"]);
    await choose("attackPressed", "f");
    await choose("guardPressed", "g");
    await choose("jumpPressed", "j");
    await page.reload();
    await settings.click();
    await expect(labels).toHaveText(["J", "↓", "←", "→", "F", "G"]);
    await page.screenshot({ path: testInfo.outputPath("screen-pc-keyboard.png"), scale: "css" });
    await dialog.getByRole("button", { name: "閉じる" }).click();

    const { createMatch, toSnapshot } = await import("../../game/rules.js");
    const snapshot = toSnapshot(createMatch({ matchId: sampleMatch, players: samplePlayers }));
    const inputs = [];
    await page.routeWebSocket(`**/v1/rooms/${sampleRoom}/socket`, socket => {
      socket.onMessage(raw => {
        const packet = JSON.parse(raw);
        if (packet.type === "input") inputs.push(packet.input);
        if (packet.type !== "auth") return;
        socket.send(JSON.stringify(roomPacket("playing")));
        socket.send(JSON.stringify({ type: "snapshot", matchId: sampleMatch, phase: "playing", snapshot, events: [], acks: [0, 0] }));
      });
    });
    await resumeGame(page);
    await page.reload();
    await expect(page.locator('[data-control="attackPressed"]')).toBeEnabled();
    await page.keyboard.press("w");
    await page.keyboard.press("d");
    await page.keyboard.press("f");
    await page.keyboard.press("g");
    await page.keyboard.press("j");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => inputs.length).toBe(5);
    expect(inputs.slice(0, 4).map(input => Object.keys(input).filter(action => input[action]))).toEqual([
      ["attackPressed"], ["guardPressed"], ["jumpPressed"], ["right"]
    ]);
    expect(Object.values(inputs[4]).some(Boolean)).toBe(false);
  } finally {
    await context.close();
  }
});

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
