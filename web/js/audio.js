(function (root) {
  "use strict";

  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
  }

  let enabled = read("songen_sound") !== "off";
  const saved = read("songen_volume");
  const savedVolume = Number(saved);
  let volume = saved?.trim() && Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : .35;
  let context = null;
  const active = new Set();
  const last = new Map();
  const cues = {
    select: [440, .035], start: [660, .12], attack: [180, .045], guard: [300, .06],
    hit: [100, .06], break: [80, .12], warning: [540, .08],
  };

  function release(voice, stop = true) {
    active.delete(voice);
    voice.osc.onended = null;
    if (stop) { try { voice.osc.stop(); } catch { /* Already ended. */ } }
    voice.osc.disconnect();
    voice.gain.disconnect();
  }

  function clear() {
    for (const voice of active) release(voice);
    last.clear();
  }

  function unlock() {
    if (!enabled || volume === 0 || document.hidden) return;
    try {
      if (context?.state === "closed") {
        clear();
        context.onstatechange = null;
        context = null;
      }
      if (!context) {
        const Audio = root.AudioContext || root.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        context.onstatechange = () => { if (context.state !== "running") clear(); };
      }
      if (context.state === "suspended" || context.state === "interrupted") {
        clear();
        Promise.resolve(context.resume()).catch(() => {});
      }
    } catch { /* Audio is optional. */ }
  }

  // One oscillator plays one part. Notes use [start in seconds, Hz, duration, optional end Hz].
  function melody(type, level, notes, now) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    const voice = { osc, gain };
    try {
      osc.type = type;
      gain.gain.setValueAtTime(.0001, now);
      for (const [offset, hz, length, endHz] of notes) {
        const start = now + offset;
        const end = start + length;
        osc.frequency.setValueAtTime(hz, start);
        if (endHz) osc.frequency.exponentialRampToValueAtTime(endHz, end);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.linearRampToValueAtTime(Math.max(.0001, volume * level), start + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, end);
      }
      osc.connect(gain);
      gain.connect(context.destination);
      active.add(voice);
      osc.onended = () => release(voice, false);
      const [offset, , length] = notes.at(-1);
      osc.start(now + notes[0][0]);
      osc.stop(now + offset + length + .01);
    } catch { release(voice); }
  }

  function challenger(now) {
    melody("sine", .55, [[0, 146.83, .12, 65], [.16, 196, .14, 82], [.39, 146.83, .34, 73]], now);
    melody("sawtooth", .15, [[.08, 293.66, .09], [.21, 392, .12], [.39, 587.33, .43]], now);
    melody("triangle", .26, [[.39, 440, .36], [.79, 880, .20]], now);
  }

  function resultCue(won, { brokenLimbs = 0, headBroken = false }, now) {
    const lead = won
      ? [[0, 392, .10], [.13, 523.25, .12], [.28, 659.25, .16]]
      : [[0, 392, .12, 370], [.15, 329.63, .12, 311], [.30, 261.63, .15, 246.94]];
    const run = (won ? [783.99, 880, 987.77, 1174.66] : [233.08, 207.65, 174.61, 146.83]).slice(0, brokenLimbs);
    run.forEach((hz, i) => lead.push([.48 + .115 * i, hz, .095]));
    const finish = .48 + .115 * run.length;
    lead.push([finish, won ? 1046.5 : 130.81, .48, won ? undefined : 98]);
    melody("triangle", .40, lead, now);
    melody(won ? "sawtooth" : "triangle", won ? .10 : .21,
      [[.02, won ? 261.63 : 196, .15], [finish, won ? 659.25 : 155.56, .54]], now);
    melody("sine", .40, [[0, won ? 196 : 130.81, .21], [.27, won ? 261.63 : 110, .18], [finish, won ? 261.63 : 65.41, .56]], now);
    if (!headBroken) return;
    const tag = finish + .38;
    if (won) {
      melody("sine", .33, [[tag, 1046.5, .08], [tag + .10, 1318.5, .08], [tag + .20, 1568, .33]], now);
    } else {
      melody("sawtooth", .16, [[tag, 220, .14, 92], [tag + .17, 174.61, .34, 48]], now);
    }
  }

  function play(kind, details = {}) {
    if (!enabled || volume === 0 || document.hidden || context?.state !== "running") return;
    const now = context.currentTime;
    if (now - (last.get(kind) ?? -100) < .08) return;
    const featured = kind === "challenger" || kind === "win" || kind === "loss";
    if (featured) {
      // Give the announcement priority over simultaneous combat hits.
      for (const voice of active) release(voice);
    } else if (active.size >= 6) return;
    last.set(kind, now);
    try {
      if (kind === "challenger") challenger(now);
      else if (kind === "win" || kind === "loss") resultCue(kind === "win", details, now);
      else {
        const [hz, length] = cues[kind] ?? cues.select;
        melody("sine", .12, [[0, hz, length]], now);
      }
    } catch { /* Gameplay continues if a device cannot start audio. */ }
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    save("songen_sound", enabled ? "on" : "off");
    if (enabled) unlock();
    else clear();
  }

  function setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0 || next > 1) return;
    volume = next;
    save("songen_volume", String(next));
    clear();
    if (next > 0) unlock();
  }

  document.addEventListener("click", unlock, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  root.addEventListener("pagehide", clear);
  root.SongenAudio = { unlock, play, clear, setEnabled, setVolume, get enabled() { return enabled; }, get volume() { return volume; } };
})(globalThis);
