/* NEON QUEST - generator.js
 * Endless mode: an unlimited supply of stages in the same schema as levels.js.
 *
 * A run is a random seed. Each run shuffles its own theme order and obstacle mixes
 * (never the same theme or mix twice in a row). Every stage is generated from
 * (run seed, stage number), so a restarted stage is exactly the same layout.
 */
(function (NQ) {
  'use strict';

  // Palettes and backgrounds live in render.js (PAL, buildBg); music in audio.js (TRACKS).
  const THEMES = {
    meadow:  { name: 'Sunny Meadows',  music: 1 },
    cavern:  { name: 'Frozen Caverns', music: 2 },
    volcano: { name: 'Volcano Keep',   music: 3 },
    desert:  { name: 'Dune Sands',     music: 'desert' },
    night:   { name: 'Neon Skyline',   music: 'night' },
    sky:     { name: 'Cloud Isles',    music: 'sky' },
  };

  // Obstacle mixes. Each multiplier scales how often that kind of thing appears.
  // pit > 0 makes wide (4-tile) gaps more likely.
  const FLAVORS = [
    { name: 'Mixed bag', hint: 'Everything at once: read the ground',
      m: { walk: 1, bat: 1, turret: 1, spike: 1, plat: 1, mover: 1, crumble: 1, spring: 1, pit: 0 } },
    { name: 'Pit run', hint: 'Wide gaps: ride the movers across',
      m: { walk: 0.5, bat: 0.5, turret: 0, spike: 0.3, plat: 1.4, mover: 2.2, crumble: 0.3, spring: 0.5, pit: 1 } },
    { name: 'Spike field', hint: 'Spikes everywhere: jump them, never land on them',
      m: { walk: 0.5, bat: 0.5, turret: 0.5, spike: 3, plat: 1, mover: 0.5, crumble: 0.3, spring: 0.5, pit: 0 } },
    { name: 'Bat swarm', hint: 'Bats swoop: stomp them or dash through',
      m: { walk: 0.5, bat: 2.5, turret: 0.2, spike: 0.5, plat: 1, mover: 1, crumble: 0.5, spring: 0.5, pit: 0 } },
    { name: 'Turret gallery', hint: 'Turrets fire: dash into them to smash',
      m: { walk: 0.5, bat: 0.5, turret: 2.5, spike: 0.5, plat: 1, mover: 1, crumble: 0.5, spring: 0.5, pit: 0 } },
    { name: 'Slime patrol', hint: 'Slimes patrol: stomp them for a combo',
      m: { walk: 2.5, bat: 0.5, turret: 0.3, spike: 0.5, plat: 1, mover: 1, crumble: 0.5, spring: 0.5, pit: 0 } },
    { name: 'Crumble bridge', hint: 'Crumbling ground falls: keep moving',
      m: { walk: 0.5, bat: 0.5, turret: 0.3, spike: 0.5, plat: 2, mover: 0.3, crumble: 3, spring: 0.5, pit: 0 } },
    { name: 'Spring jumps', hint: 'Spring pads launch you up to high ledges',
      m: { walk: 0.6, bat: 0.8, turret: 0.5, spike: 0.6, plat: 1.2, mover: 1, crumble: 0.5, spring: 3, pit: 0 } },
  ];

  // Small seeded random number generator (mulberry32)
  function rng(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Mix two integers into a well-spread seed
  function mix(a, b) {
    let h = (a ^ Math.imul(b + 0x9E3779B9, 0x85EBCA6B)) | 0;
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
    return (h ^ (h >>> 12)) >>> 0;
  }

  // Builds stage n of a run. Ranges follow levels.js: [a, b) half-open, rows 0..14.
  function generate(seed, n, theme, flavor) {
    const r = rng(mix(seed, n));
    const int = (a, b) => a + Math.floor(r() * (b - a + 1));   // inclusive
    const chance = (p) => r() < Math.min(0.9, p);
    const d = Math.min(1, (n - 1) / 12);                        // 0 at stage 1, 1 from stage 13
    const m = flavor.m;

    // ---- ground: a safe start, then gap / span pairs until the target length
    const want = 110 + Math.min(40, n * 3);
    const spans = [[0, 16]];
    const gaps = [];
    let x = 16;
    while (x < want) {
      const g = ((m.pit && r() < 0.6) || (d > 0.5 && r() < 0.2)) ? 4 : int(2, 3);
      gaps.push([x, x + g]);
      x += g;
      const len = int(6, 12);
      spans.push([x, x + len]);
      x += len;
    }
    // the last span is the finish ground: make sure the flag has room
    const last = spans[spans.length - 1];
    last[1] = last[0] + Math.max(10, last[1] - last[0]);
    x = last[1];

    const plats = [], crumble = [], movers = [], walkers = [], turrets = [], spikes = [];
    const springs = [], bats = [], coins = [], hearts = [];

    // ---- gaps: 4-wide gaps (and some 2-3 wide ones) get a moving platform, others a ledge
    for (const [ga, gb] of gaps) {
      if (gb - ga >= 4 || chance(0.3 * m.mover)) {
        movers.push({ row: 11, a: ga - 2, b: gb, w: 2, sp: +(1.1 + 0.25 * d + 0.15 * r()).toFixed(2) });
      } else if (chance(0.5 * m.plat)) {
        plats.push([10, ga - 1, gb + 1]);
      }
    }

    // ---- per ground span: ledges, enemies, hazards, pickups
    spans.forEach(([a, b], i) => {
      const len = b - a;

      // ledges sit 3 tiles up (row 10): one jump reaches them from the ground
      if (i > 0 && len >= 8) {
        const s = a + int(1, len - 5), w = int(3, 4);
        const roll = r();
        if (roll < 0.22 * m.crumble) crumble.push([10, s, s + w]);
        else if (roll < 0.22 * m.crumble + 0.3 * m.plat) plats.push([10, s, s + w]);
      }

      // the first span is a safe start and the last holds only the flag
      if (i > 0 && i < spans.length - 1 && len >= 6) {
        const used = new Set();
        if (chance(0.5 * m.walk * (0.5 + d))) {
          const c = int(a + 2, b - 3);
          walkers.push([c, a + 1, b - 2]);
          used.add(c);
        }
        if (len >= 9 && chance(0.28 * m.turret * (0.4 + d))) {
          const c = int(a + 3, b - 4);
          if (!used.has(c)) { turrets.push(c); used.add(c); }
        }
        if (chance(0.35 * m.spike * (0.5 + d))) {
          const c = int(a + 2, b - 4);
          spikes.push([c, c + int(1, 2)]);
        }
        if (chance(0.18 * m.spring)) {
          const c = int(a + 2, b - 3);
          if (!used.has(c)) { springs.push(c); used.add(c); }
        }
        if (chance(0.4 * m.bat * (0.6 + 0.6 * d))) {
          bats.push([int(a + 1, b - 2), int(4, 6), int(3, 4)]);
        }
        if (i % 3 === 2) hearts.push([int(a + 2, b - 3), 11]);
      }

      // coin trail, one row above the ground
      if (i > 0 && len >= 6 && chance(0.5)) {
        const c0 = int(a + 1, b - 5);
        coins.push([11, c0, c0 + int(3, 4)]);
      }
    });

    // checkpoint: middle of the level, on solid ground
    const mid = spans[Math.floor(spans.length / 2)];

    return {
      id: n, name: THEMES[theme].name, sub: flavor.name, theme, music: THEMES[theme].music,
      endless: true,
      width: x, start: [2, 12], flag: x - 5, checkpoint: mid[0] + 2,
      ground: spans, plats, crumble, movers, coins, hearts, spikes, springs,
      walkers, bats, turrets,
      signs: [[3, flavor.hint]],
    };
  }

  NQ.endless = {
    THEMES,
    FLAVORS: FLAVORS.map((f) => f.name),

    // A new run. Pass a seed to replay a run exactly (used by the tests).
    newRun(seed) {
      const s = seed != null ? (seed | 0) : ((Math.random() * 0x7fffffff) | 0);
      return { seed: s, themes: [], flavors: [], cleared: 0, pickT: rng(mix(s, 1)), pickF: rng(mix(s, 2)) };
    },

    // Stage n (1-based) of a run. Themes and mixes are drawn once per run, in order.
    stage(run, n) {
      const keys = Object.keys(THEMES);
      while (run.themes.length < n) {
        const i = run.themes.length;
        const pool = keys.filter((k) => k !== run.themes[i - 1]);
        run.themes.push(pool[Math.floor(run.pickT() * pool.length)]);
        if (i === 0) {
          run.flavors.push(0);                                   // stage 1 is always the gentle mix
        } else {
          const fpool = FLAVORS.map((_, k) => k).filter((k) => k !== run.flavors[i - 1]);
          run.flavors.push(fpool[Math.floor(run.pickF() * fpool.length)]);
        }
      }
      return generate(run.seed, n, run.themes[n - 1], FLAVORS[run.flavors[n - 1]]);
    },
  };
})(window.NQ = window.NQ || {});
