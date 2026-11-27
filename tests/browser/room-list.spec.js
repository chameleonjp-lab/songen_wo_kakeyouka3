import { expect, test } from "@playwright/test";

// WebKit's automation API exposes taps but no native multi-step touch drag.
async function swipe(page, { fromBottom = 20, dx = 0, dy = -100 } = {}) {
  await page.evaluate(({ fromBottom, dx, dy }) => {
    const screen = document.querySelector('[data-screen="register"]');
    const view = window.visualViewport;
    const y = view.height - fromBottom;
    const finger = (x, y) => ({ identifier: 1, clientX: x, clientY: y, pageY: y + view.pageTop });
    const start = finger(120, y);
    const end = finger(120 + dx, y + dy);
    for (const [type, touches, changedTouches] of [
      ["touchstart", [start], [start]], ["touchmove", [end], [end]], ["touchend", [], [end]],
    ]) {
      screen.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches, changedTouches }));
    }
  }, { fromBottom, dx, dy });
}

test("entering, tapping refresh, and swiping up at the bottom update only the room list", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 402, height: 700 });
  let rooms = Array.from({ length: 12 }, (_, i) => String(i).padStart(4, "0"));
  let requests = 0;
  let error = false;
  await page.route("**/v1/rooms", route => {
    expect(route.request().method()).toBe("GET");
    requests++;
    return route.fulfill({ status: error ? 503 : 200, json: { rooms } });
  });
  await page.goto("./");
  await page.locator("#language").selectOption("ja");
  expect(requests).toBe(0);
  await page.locator("#prepare").click();
  const numbers = page.locator("#room-list button");
  await expect(numbers).toHaveText(rooms.slice(0, 9));
  await page.locator("#player-name").fill("うちゃ");
  await page.locator("[data-face-id='4']").click();
  await page.locator("#join-code").fill("0123");
  const actions = page.locator(".room-list-actions");
  const home = await actions.locator("[data-home]").boundingBox();
  const refresh = await actions.locator("#refresh-rooms").boundingBox();
  expect(refresh.x).toBeGreaterThan(home.x + home.width);
  expect(Math.abs(home.y - refresh.y)).toBeLessThan(2);
  expect((await numbers.first().boundingBox()).y).toBeGreaterThan(refresh.y + refresh.height);
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await expect(numbers.last()).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("screen-open-rooms-402x700.png"), scale: "css" });
  rooms = ["0042", "0017"];
  await page.clock.install();
  await page.clock.fastForward(60_000);
  expect(requests).toBe(1);
  await page.locator("#refresh-rooms").click();
  await expect(numbers).toHaveText(rooms);
  await page.setViewportSize({ width: 874, height: 402 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await swipe(page);
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await expect(numbers.last()).toBeInViewport();
  await swipe(page, { fromBottom: 180 });
  await swipe(page, { dx: 120, dy: -20 });
  await swipe(page, { fromBottom: 30, dy: 20 });
  await swipe(page, { dy: -14 });
  expect(requests).toBe(2);
  rooms = [];
  await swipe(page);
  await expect(page.locator("#room-list-status")).toHaveText("今は参加できるルームがありません。");
  expect(requests).toBe(3);
  await expect(page.locator("#player-name")).toHaveValue("うちゃ");
  await expect(page.locator("#join-code")).toHaveValue("0123");
  await expect(page.locator("[data-face-id='4']")).toHaveAttribute("aria-pressed", "true");
  error = true;
  await page.locator("#refresh-rooms").click();
  await expect(page.locator("#room-list-status")).toContainText("一覧を取得できませんでした");
  await actions.locator("[data-home]").click();
  error = false;
  rooms = ["0009"];
  await page.locator("#prepare").click();
  await expect(numbers).toHaveText(rooms);
  expect(requests).toBe(5);
});

test("a room that fills after the snapshot can be selected once without losing other entries or the typed ID", async ({ page }) => {
  let reads = 0;
  let joins = 0;
  let releaseJoin;
  const gate = new Promise(resolve => { releaseJoin = resolve; });
  await page.route("**/v1/rooms", route => {
    reads++;
    return route.fulfill({ json: { rooms: ["0008", "0302"] } });
  });
  await page.route("**/v1/rooms/0008/join", async route => {
    joins++;
    expect(route.request().postDataJSON()).toMatchObject({ name: "", faceId: 12 });
    await gate;
    await route.fulfill({ status: 409, json: { code: "full" } });
  });
  await page.goto("./#room=0102");
  const button = page.locator('#room-list button[value="0008"]');
  await button.click();
  await expect(button).toBeDisabled();
  await button.evaluate(node => node.click());
  releaseJoin();
  await expect(button).toHaveCount(0);
  await expect(page.locator("#register-status")).toHaveText(/full/i);
  await expect(page.locator("#room-list button")).toHaveText(["0302"]);
  await expect(page.locator("#join-code")).toHaveValue("0102");
  expect([reads, joins]).toEqual([1, 1]);
});
