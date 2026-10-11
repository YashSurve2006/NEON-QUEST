/* NEON QUEST - audio.js
 * Fully procedural audio (Web Audio API): looping chiptune music per level
 * plus sound effects. No audio files are needed.
 */
(function (NQ) {
  'use strict';

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let cur = null, timer = null, nextT = 0, sIdx = 0, pat = null, tr = null;
  let musicVol = 0.5, sfxVol = 0.7, muted = false, ducked = false;

  const SCALES = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };
  const TRACKS = {
    menu: { bpm: 84,  scale: 'minor', root: 57, prog: [0, -4, -2, -5], wave: 'triangle', drums: false, seed: 7 },
    1:    { bpm: 116, scale: 'major', root: 60, prog: [0, 7, 9, 5],    wave: 'square',   drums: true,  seed: 21 },
    2:    { bpm: 96,  scale: 'minor', root: 62, prog: [0, -4, -2, -5], wave: 'triangle', drums: true,  seed: 33 },
    3:    { bpm: 136, scale: 'minor', root: 50, prog: [0, -4, -2, -3], wave: 'sawtooth', drums: true,  seed: 47 },
    win:  { bpm: 100, scale: 'major', root: 60, prog: [0, 5, 7, 0],    wave: 'square',   drums: false, seed: 5 },
    desert: { bpm: 110, scale: 'minor', root: 55, prog: [0, -2, -4, -5], wave: 'triangle', drums: true,  seed: 61 },
    night:  { bpm: 124, scale: 'minor', root: 57, prog: [0, -4, -2, -5], wave: 'square',   drums: true,  seed: 73 },
    sky:    { bpm: 92,  scale: 'major', root: 60, prog: [0, 5, 3, 4],    wave: 'triangle', drums: false, seed: 88 },
  };

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 64-step (4 bar) melody, generated once per track with a fixed seed
  function makeLead(t) {
    const r = rng(t.seed), out = [];
    let deg = 2;
    for (let i = 0; i < 64; i++) {
      if (r() < (i % 8 === 0 ? 0.1 : 0.42)) { out.push(null); continue; }
      deg = Math.max(0, Math.min(9, deg + Math.floor(r() * 5) - 2));
      out.push(deg);
    }
    return out;
  }

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const leadMidi = (t, d) => t.root + 12 + 12 * Math.floor(d / 5) + SCALES[t.scale][d % 5];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.02);
    musicBus.gain.setTargetAtTime((ducked ? 0.35 : 1) * musicVol * 0.9, now, 0.05);
    sfxBus.gain.setTargetAtTime(sfxVol, now, 0.02);
  }

  function tone(f, t0, dur, type, vol, dest, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, hp, dest) {
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 0.4);
    src.stop(t0 + dur + 0.02);
  }

  function kick(t0, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
    g.gain.setValueAtTime(0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    o.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + 0.2);
  }

  // ---------- music sequencer ----------
  function step(s, when) {
    const t = tr, sp = 60 / t.bpm / 4;
    const bar = Math.floor(s / 16) % t.prog.length;
    if (s % 2 === 0) {
      tone(mtof(t.root - 12 + t.prog[bar]), when, sp * 1.9,
        t.wave === 'sawtooth' ? 'sawtooth' : 'triangle', 0.14, musicBus);
    }
    const d = pat[s % 64];
    if (d !== null) tone(mtof(leadMidi(t, d)), when, sp * 1.5, t.wave, 0.045, musicBus);
    if (t.drums) {
      if (s % 8 === 0) kick(when, musicBus);
      if (s % 8 === 4) noise(when, 0.12, 0.22, 1800, musicBus);
      if (s % 2 === 1) noise(when, 0.03, 0.04, 7000, musicBus);
    }
  }

  function pump() {
    if (!ctx || !tr) return;
    const sp = 60 / tr.bpm / 4;
    while (nextT < ctx.currentTime + 0.12) {
      step(sIdx, nextT);
      nextT += sp;
      sIdx++;
    }
  }

  function music(name) {
    if (!ensure() || cur === name) return;
    stopMusic();
    const t = TRACKS[name];
    if (!t) return;
    cur = name; tr = t; pat = makeLead(t);
    sIdx = 0; nextT = ctx.currentTime + 0.08;
    timer = setInterval(pump, 25);
    pump();
  }

  function stopMusic() {
    clearInterval(timer);
    timer = null; tr = null; cur = null;
  }

  // ---------- sound effects ----------
  function arp(notes, gap, t) {
    notes.forEach((n, i) => tone(n, t + i * gap, gap * 1.6, 'square', 0.14, sfxBus));
  }

  const SFX = {
    jump:    (t) => tone(320, t, 0.14, 'square', 0.16, sfxBus, 720),
    land:    (t) => noise(t, 0.05, 0.1, 300, sfxBus),
    coin:    (t) => { tone(988, t, 0.07, 'square', 0.13, sfxBus); tone(1319, t + 0.06, 0.16, 'square', 0.13, sfxBus); },
    stomp:   (t) => tone(420, t, 0.12, 'square', 0.2, sfxBus, 110),
    dash:    (t) => tone(900, t, 0.18, 'sawtooth', 0.1, sfxBus, 200),
    smash:   (t) => { noise(t, 0.12, 0.25, 500, sfxBus); tone(260, t, 0.15, 'square', 0.15, sfxBus, 80); },
    hurt:    (t) => { tone(300, t, 0.3, 'sawtooth', 0.2, sfxBus, 60); noise(t, 0.2, 0.14, 800, sfxBus); },
    death:   (t) => tone(440, t, 0.8, 'triangle', 0.25, sfxBus, 55),
    check:   (t) => arp([523, 659, 784], 0.07, t),
    heart:   (t) => arp([659, 784, 988, 1319], 0.05, t),
    spring:  (t) => tone(200, t, 0.3, 'square', 0.18, sfxBus, 1200),
    crumble: (t) => noise(t, 0.3, 0.18, 200, sfxBus),
    shot:    (t) => tone(700, t, 0.1, 'square', 0.07, sfxBus, 300),
    boss:    (t) => { kick(t, sfxBus); tone(120, t, 0.4, 'square', 0.16, sfxBus, 40); },
    bossWin: (t) => arp([392, 523, 659, 784, 1047], 0.12, t),
    win:     (t) => arp([523, 659, 784, 1047, 1319], 0.11, t),
    click:   (t) => tone(880, t, 0.04, 'triangle', 0.14, sfxBus),
    move:    (t) => tone(600, t, 0.03, 'triangle', 0.07, sfxBus),
    pause:   (t) => tone(500, t, 0.08, 'triangle', 0.12, sfxBus, 350),
  };

  function sfx(name) {
    if (!ensure()) return;
    const f = SFX[name];
    if (f) f(ctx.currentTime);
  }

  NQ.audio = {
    unlock() { ensure(); },
    music, stopMusic, sfx,
    duck(on) { ducked = !!on; applyVolumes(); },
    set(music, effects, mute) {
      musicVol = music; sfxVol = effects; muted = !!mute; applyVolumes();
    },
    toggleMute() { muted = !muted; applyVolumes(); return muted; },
    get muted() { return muted; },
  };
})(window.NQ = window.NQ || {});
