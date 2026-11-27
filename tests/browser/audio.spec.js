import { expect, test } from "@playwright/test";

test("renders distinct audio for the challenger and all twenty result comments, respecting mute and volume", async ({ page }) => {
  await page.goto("./");
  const result = await page.evaluate(async () => {
    const sampleRate = 22050;
    let output;
    // Use the game's synthesis and envelopes, with the speaker replaced by an offline buffer.
    window.AudioContext = class {
      constructor() {
        this.offline = new OfflineAudioContext(1, 2 * sampleRate, sampleRate);
        output = this.offline;
      }
      get state() { return this.offline.state === "closed" ? "closed" : "running"; }
      get currentTime() { return this.offline.currentTime; }
      get destination() { return this.offline.destination; }
      createOscillator() { return this.offline.createOscillator(); }
      createGain() { return this.offline.createGain(); }
    };
    const audio = window.SongenAudio;
    audio.setVolume(1);
    async function render(kind, details, cancel = false) {
      audio.unlock();
      audio.play(kind, details);
      if (cancel) audio.setEnabled(false);
      const samples = (await output.startRendering()).getChannelData(0);
      let peak = 0, end = 0, signature = 0;
      for (const [i, value] of samples.entries()) {
        peak = Math.max(peak, Math.abs(value));
        if (Math.abs(value) > .001) end = i / sampleRate;
        signature = (Math.imul(signature, 31) + Math.round(value * 32767)) | 0;
      }
      return { peak, end, signature };
    }
    const clips = [await render("challenger")];
    for (const outcome of ["win", "loss"]) {
      for (let brokenLimbs = 0; brokenLimbs <= 4; brokenLimbs++) {
        for (const headBroken of [false, true]) clips.push(await render(outcome, { brokenLimbs, headBroken }));
      }
    }
    audio.setVolume(.25);
    const quiet = await render("challenger");
    const muted = await render("win", { brokenLimbs: 4, headBroken: true }, true);
    return { clips, quiet, muted };
  });
  expect(new Set(result.clips.map(clip => clip.signature)).size).toBe(21);
  for (const clip of result.clips) {
    expect(clip.peak).toBeGreaterThan(.12);
    expect(clip.peak).toBeLessThan(1);
    expect(clip.end).toBeGreaterThan(.75);
    expect(clip.end).toBeLessThan(2);
  }
  expect(result.quiet.peak / result.clips[0].peak).toBeCloseTo(.25, 1);
  expect(result.muted.peak).toBe(0);
});
