/* NEON QUEST - game.js
 * Game controller: state machine, input (keyboard / gamepad / touch), level
 * construction, collisions, scoring, boss fight and the fixed-step main loop.
 */
(function (NQ) {
  'use strict';

  const T = NQ.TILE, FLOOR = NQ.FLOOR, TL = NQ.TILES, P = NQ.PHYS, clamp = NQ.clamp;
  const W = 960, H = 600, STEP = 1 / 60;
  const MAX_LIVES = 9, START_LIVES = 4;

  // ------------------------------------------------------------ storage
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('nq.' + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('nq.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ }
    },
  };
  NQ.store = store;

  // Touch buttons write into this object (see ui.js)
  NQ.touch = { left: false, right: false, jump: false, dash: false };

  // ------------------------------------------------------------ input
  const KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    jump: ['Space', 'ArrowUp', 'KeyW', 'KeyZ'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyJ', 'KeyK', 'KeyX'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR'],
  };
  const down = new Set();
  const prevAct = {};

  function gamepadState() {
    const s = { left: false, right: false, jump: false, dash: false, pause: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const b = gp.buttons, ax = gp.axes[0] || 0;
      const pr = (i) => !!(b[i] && b[i].pressed);
      s.left = s.left || ax < -0.4 || pr(14);
      s.right = s.right || ax > 0.4 || pr(15);
      s.jump = s.jump || pr(0);
      s.dash = s.dash || pr(1) || pr(2);
      s.pause = s.pause || pr(9);
    }
    return s;
  }

  function heldAction(name, gp) {
    return KEYS[name].some((k) => down.has(k)) || !!NQ.touch[name] || !!gp[name];
  }

  // Key taps are latched so a quick press (down+up between two ticks) is never lost
  const tapped = new Set();
  const Input = {
    read() {
      const gp = gamepadState();
      const cur = {
        left: heldAction('left', gp), right: heldAction('right', gp),
        jump: heldAction('jump', gp), dash: heldAction('dash', gp), pause: heldAction('pause', gp),
      };
      const tap = (n) => KEYS[n].some((k) => tapped.has(k));
      const out = {
        left: cur.left, right: cur.right, jumpHeld: cur.jump,
        jumpPressed: (cur.jump && !prevAct.jump) || tap('jump'),
        dashPressed: (cur.dash && !prevAct.dash) || tap('dash'),
        pausePressed: (cur.pause && !prevAct.pause) || tap('pause') || !!gp.pause && !prevAct.gpPause,
        restartPressed: tap('restart'),
      };
      tapped.clear();
      Object.assign(prevAct, cur);
      prevAct.gpPause = gp.pause;
      return out;
    },
    clear() { down.clear(); tapped.clear(); for (const k in NQ.touch) NQ.touch[k] = false; },
  };

  addEventListener('keydown', (e) => {
    down.add(e.code);
    // typing in a text box (player name) must not pause or restart the game
    if (!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) tapped.add(e.code);
    const playing = G.state === 'play' || G.state === 'intro';
    if (playing && (KEYS.jump.includes(e.code) || KEYS.left.includes(e.code) ||
        KEYS.right.includes(e.code) || e.code === 'Space')) e.preventDefault();
    if (KEYS.dash.includes(e.code) && playing) e.preventDefault();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => { Input.clear(); if (G.state === 'play') G.pause(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Input.clear(); if (G.state === 'play') G.pause(); }
  });

  // ------------------------------------------------------------ helpers
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // ------------------------------------------------------------ game
  const G = (NQ.game = {
    state: 'menu',          // menu | intro | play | paused | dying | clear | over | win
    t: 0,
    mode: 'campaign',       // campaign | endless
    run: null,              // endless: the current run (seed, themes, cleared stages)
    stage: 0, levelLabel: '',
    levelNo: 1,
    level: null, world: null, p: null,
    walkers: [], bats: [], turrets: [], boss: null, shots: [],
    coins: [], hearts: [], springs: [], spikes: [], signs: [], checkpoint: null, flag: null,
    lives: START_LIVES, score: 0, levelStartScore: 0, coinsGot: 0, coinsTotal: 0,
    runCoins: 0,            // coins collected this run (every 30 gives a bonus life)
    time: 0, combo: 0, cam: 0, shake: 0, intro: 0, dyingT: 0,
    msg: '', msgT: 0, flagHint: 0,
    stats: null, summary: null,
    particles: new NQ.Particles(),
    cpCol: null,

    // ---------- public API used by the UI ----------
    newGame(n = 1) {          // campaign level n (from level select)
      this.mode = 'campaign';
      this.lives = START_LIVES; this.score = 0; this.runCoins = 0;
      this.startLevel(n);
    },
    newRun() {                // endless: a fresh run, score 0, new random worlds and obstacles
      this.mode = 'endless';
      this.run = NQ.endless.newRun();
      this.lives = START_LIVES; this.score = 0; this.runCoins = 0;
      this.startStage(1);
    },
    startLevel(n) {
      this.mode = 'campaign';
      this.levelNo = n;
      this.beginLevel(NQ.LEVELS[n - 1], 'LEVEL ' + n);
    },
    startStage(n) {
      this.mode = 'endless';
      this.stage = n; this.levelNo = n;
      this.beginLevel(NQ.endless.stage(this.run, n), 'STAGE ' + n);
    },
    beginLevel(L, label) {
      build(L);
      this.levelLabel = label;
      this.levelStartScore = this.score;
      this.setState('intro');
      this.intro = 150;
      NQ.audio.music(L.music);
      NQ.audio.duck(false);
    },
    pause() {
      if (this.state !== 'play' && this.state !== 'intro') return;
      Input.clear();
      this.setState('paused');
      NQ.audio.sfx('pause');
      NQ.audio.duck(true);
    },
    resume() {
      if (this.state !== 'paused') return;
      this.setState('play');
      NQ.audio.duck(false);
    },
    retry() {                 // after game over
      if (this.mode === 'endless') { this.newRun(); return; }
      this.lives = START_LIVES;
      this.score = this.levelStartScore;
      this.startLevel(this.levelNo);
    },
    restartStage() {          // pause menu or R key: keeps your lives and coins
      this.score = this.levelStartScore;
      if (this.mode === 'endless') this.startStage(this.stage);
      else this.startLevel(this.levelNo);
    },
    next() {
      if (this.mode === 'endless') this.startStage(this.stage + 1);
      else if (this.levelNo < NQ.LEVELS.length) this.startLevel(this.levelNo + 1);
      else this.newGame();
    },
    quit() {
      this.setState('menu');
      NQ.audio.music('menu');
      NQ.audio.duck(false);
    },
    setState(s) {
      this.state = s;
      if (NQ.ui) NQ.ui.onState(s);
    },
  });

  // ---------- level construction ----------
  function build(L) {
    const w = new NQ.World(L);
    G.level = L;
    G.world = w;
    G.p = new NQ.Player(w, L.start[0], L.start[1]);
    G.cpCol = null;
    G.walkers = L.walkers.map((d) => new NQ.Walker(d[0], d[1], d[2]));
    G.bats = L.bats.map((d) => new NQ.Bat(d[0], d[1], d[2]));
    G.turrets = L.turrets.map((c) => new NQ.Turret(c));
    G.boss = L.boss ? new NQ.Boss(L.boss) : null;
    G.shots = [];
    G.particles = new NQ.Particles();

    // coins: explicit rows, above platforms, and arcs over the pits
    G.coins = [];
    for (const [r, a, b] of L.coins) for (let c = a; c < b; c++) G.coins.push({ x: c * T + T / 2, y: r * T + T / 2, got: false });
    for (const [r, a, b] of [...L.plats, ...L.crumble]) {
      for (let c = a; c < b; c++) G.coins.push({ x: c * T + T / 2, y: (r - 1) * T + T / 2, got: false });
    }
    const gs = L.ground.slice().sort((x, y) => x[0] - y[0]);
    for (let i = 0; i < gs.length - 1; i++) {
      const a = gs[i][1], len = gs[i + 1][0] - a;
      for (let k = 0; k < len; k++) {
        const row = FLOOR - 1.6 - 2.2 * Math.sin(Math.PI * (k + 0.5) / len);
        G.coins.push({ x: (a + k) * T + T / 2, y: row * T, got: false });
      }
    }
    G.coinsTotal = G.coins.length;
    G.coinsGot = 0;

    G.hearts = L.hearts.map(([c, r]) => ({ x: c * T + T / 2, y: r * T + T / 2, got: false }));
    G.springs = L.springs.map((c) => ({ x: c * T, y: FLOOR * T - 12, w: T, h: 12, cool: 0 }));
    G.spikes = L.spikes.map(([a, b]) => ({ x: a * T + 4, y: FLOOR * T - 22, w: (b - a) * T - 8, h: 22 }));
    G.signs = L.signs.map(([c, text]) => ({ x: c * T, text }));
    G.checkpoint = { x: L.checkpoint * T, active: false };
    G.flag = { x: L.flag * T, y: FLOOR * T - 130, w: 34, h: 130 };

    G.cam = 0; G.combo = 0; G.time = 0; G.shake = 0;
    G.msg = ''; G.msgT = 0;
    G.stats = { stomps: 0, smashes: 0, hits: 0, deaths: 0 };
    G.summary = null;
    G.flagHint = 0;
    w.onCrumbleFall = (c, r) => {
      G.particles.burst((c + 0.5) * T, (r + 0.5) * T, '#bfe9ff', 8, 2.5, 0.2, 40, 3);
      NQ.audio.sfx('crumble');
    };
  }

  function message(text, frames = 120) { G.msg = text; G.msgT = frames; }

  // ---------- respawn / damage ----------
  function respawnAtCheckpoint() {
    const p = G.p;
    if (G.checkpoint.active) p.respawn(G.cpCol, FLOOR - 1);
    else p.respawn(G.level.start[0], G.level.start[1]);
    G.cam = clamp(p.cx - W / 2, 0, G.world.pxW - W);
  }

  function lethal(cause) {
    const p = G.p;
    G.lives--;
    G.stats.deaths++;
    G.combo = 0;
    G.shake = 16;
    NQ.audio.sfx('death');
    G.particles.burst(p.cx, p.cy, '#ff7a7a', 30, 5, 0.15, 40, 4);
    if (G.lives <= 0) {
      G.lives = 0;
      G.setState('dying');
      G.dyingT = 80;
      return;
    }
    message(cause, 110);
    respawnAtCheckpoint();
  }

  function hurt(fromX) {
    const p = G.p;
    if (p.inv > 0 || p.dashing || p.dead) return;
    G.lives--;
    G.stats.hits++;
    G.combo = 0;
    G.shake = 12;
    NQ.audio.sfx('hurt');
    G.particles.burst(p.cx, p.cy, '#ff6a6a', 22, 4);
    if (G.lives <= 0) {
      G.lives = 0;
      G.setState('dying');
      G.dyingT = 80;
      return;
    }
    p.hurtKnock(fromX);
  }

  // ---------- enemy interactions ----------
  function playerRect() {
    const p = G.p;
    return { x: p.x + 4, y: p.y + 4, w: p.w - 8, h: p.h - 6 };
  }

  function stomp(e, rect) {
    const p = G.p;
    G.combo = Math.min(G.combo + 1, 5);
    const pts = 100 * G.combo;
    G.score += pts;
    G.stats.stomps++;
    e.alive = false;
    NQ.audio.sfx('stomp');
    G.particles.burst(rect.x + rect.w / 2, rect.y, '#fff', 14, 3.5);
    G.particles.text(rect.x + rect.w / 2, rect.y - 10, '+' + pts + (G.combo > 1 ? '  x' + G.combo : ''), '#ffe27a');
    p.vy = Input.lastJumpHeld ? -11.5 : -8.5;      // bounce higher if jump is held
    p.onGround = false;
    p.coyote = 0;
  }

  function smash(e, rect) {
    e.alive = false;
    G.score += 150;
    G.stats.smashes++;
    G.shake = 6;
    NQ.audio.sfx('smash');
    G.particles.burst(rect.x + rect.w / 2, rect.y + rect.h / 2, '#7af6ff', 26, 5);
    G.particles.text(rect.x + rect.w / 2, rect.y - 6, '+150 SMASH', '#7af6ff');
  }

  function checkEnemy(e, rect) {
    if (!e.alive) return;
    const p = G.p, pr = playerRect();
    if (!overlap(pr, rect)) return;
    if (p.dashing) { smash(e, rect); return; }
    const prevBottom = p.y + p.h - p.vy;
    if (p.vy > 0 && prevBottom <= rect.y + 14) { stomp(e, rect); return; }
    hurt(rect.x + rect.w / 2);
  }

  function hitBoss() {
    const b = G.boss;
    b.hit();
    G.score += 250;
    G.shake = 18;
    NQ.audio.sfx('boss');
    G.particles.burst(b.x + b.w / 2, b.y + 30, '#ffb35c', 36, 6, 0.1, 40, 4);
    G.particles.text(b.x + b.w / 2, b.y - 16, '+250 HIT!', '#ffb35c');
    if (!b.alive) {
      G.score += 1000;
      G.world.setLock(false);
      NQ.audio.sfx('bossWin');
      G.particles.burst(b.x + b.w / 2, b.y + 40, '#ffe27a', 90, 7, 0.12, 60, 4);
      message('STONE GOLEM DEFEATED! The gate is open', 220);
    } else {
      message('Golem hit! ' + b.hp + ' HP left', 100);
    }
  }

  function checkBoss() {
    const b = G.boss, p = G.p;
    if (!b || !b.alive || b.state === 'sleep') return;
    const r = b.rect, pr = playerRect();
    if (!overlap(pr, r)) return;
    if (p.dashing && b.inv === 0) { hitBoss(); return; }
    const prevBottom = p.y + p.h - p.vy;
    if (p.vy > 0 && prevBottom <= r.y + 16) {
      if (b.inv === 0) hitBoss();
      p.vy = -11;
      p.onGround = false;
      return;
    }
    hurt(r.x + r.w / 2);
  }

  // ---------- main per-frame logic ----------
  function tick() {
    const act = Input.read();
    G.t++;
    if (G.shake > 0) G.shake--;
    if (G.msgT > 0) G.msgT--;
    G.particles.update();

    if (act.pausePressed) {
      if (G.state === 'play' || G.state === 'intro') G.pause();
      else if (G.state === 'paused') G.resume();
    }
    if (act.restartPressed && (G.state === 'play' || G.state === 'intro' || G.state === 'paused')) {
      G.restartStage();
      return;
    }

    if (G.state === 'intro') {
      updateCamera();
      if (--G.intro <= 0) G.setState('play');
      return;
    }
    if (G.state === 'dying') {
      if (--G.dyingT <= 0) {
        G.setState('over');
        saveRun('over');
      }
      return;
    }
    if (G.state === 'play') play(act);
  }

  function play(act) {
    const w = G.world, p = G.p, L = G.level;
    G.time++;
    w.update();
    for (const e of G.walkers) e.update(w);
    for (const e of G.bats) e.update();
    for (const e of G.turrets) e.update(p, G.shots);
    if (G.boss && G.boss.state === 'sleep' && p.cx > (L.boss.lock[0] + 2) * T) {
      G.boss.activate();
      w.setLock(true);
      message('BOSS: STONE GOLEM. Stomp its head 3 times!', 180);
      NQ.audio.music(3);
    }
    if (G.boss) G.boss.update(p, G.shots);

    const ev = {
      jump: () => NQ.audio.sfx('jump'),
      dash: () => { NQ.audio.sfx('dash'); G.particles.burst(p.cx, p.cy, '#7af6ff', 6, 2.5, 0, 14, 2); },
      land: (x, y) => { NQ.audio.sfx('land'); G.particles.burst(x, y, '#ddd', 6, 2, 0.05, 14, 2); },
    };
    Input.lastJumpHeld = act.jumpHeld;
    p.step(act, w, ev);

    // springs (bounce when standing on them)
    for (const s of G.springs) {
      if (s.cool > 0) s.cool--;
      if (p.onGround && s.cool === 0 && p.cx > s.x && p.cx < s.x + s.w) {
        p.bounce();
        s.cool = 20;
        NQ.audio.sfx('spring');
        G.particles.burst(s.x + T / 2, s.y, '#8cff9c', 12, 4);
      }
    }

    // checkpoint
    if (!G.checkpoint.active && p.cx > G.checkpoint.x) {
      G.checkpoint.active = true;
      G.cpCol = L.checkpoint;
      NQ.audio.sfx('check');
      message('CHECKPOINT SAVED', 100);
      G.particles.burst(G.checkpoint.x + 8, FLOOR * T - 60, '#7ff9f0', 24, 3.5, 0.05, 40, 3);
    }

    // enemies
    for (const e of G.walkers) checkEnemy(e, e.rect);
    for (const e of G.bats) checkEnemy(e, e.rect);
    for (const e of G.turrets) checkEnemy(e, e.rect);
    checkBoss();

    // projectiles
    const pr = playerRect();
    for (const s of G.shots) {
      s.update(w);
      if (!s.alive) continue;
      if (p.dashing && overlap(pr, s.rect)) { s.alive = false; continue; }
      if (overlap(pr, s.rect)) {
        s.alive = false;
        G.particles.burst(s.x, s.y, '#ffb35c', 12, 3);
        hurt(s.x);
      }
    }
    G.shots = G.shots.filter((s) => s.alive);

    // spikes
    for (const s of G.spikes) if (overlap(pr, s)) { hurt(s.x + s.w / 2); break; }

    // pits / lava
    if (p.y + p.h > 14 * T + 12 || p.y > w.pxH) {
      lethal('Oops! Back to your checkpoint');
      return;
    }

    // coins
    for (const c of G.coins) {
      if (c.got) continue;
      if (Math.abs(c.x - p.cx) < 24 && Math.abs(c.y - p.cy) < 28) {
        c.got = true;
        G.coinsGot++;
        G.score += 10;
        G.runCoins++;
        if (G.runCoins % 30 === 0) {
          G.lives = Math.min(MAX_LIVES, G.lives + 1);
          message('30 COINS: +1 LIFE', 120);
          NQ.audio.sfx('heart');
        }
        NQ.audio.sfx('coin');
        G.particles.burst(c.x, c.y, '#ffd84a', 6, 2.2, 0.04, 22, 3);
      }
    }
    // hearts
    for (const h of G.hearts) {
      if (h.got) continue;
      if (Math.abs(h.x - p.cx) < 26 && Math.abs(h.y - p.cy) < 28) {
        h.got = true;
        G.lives = Math.min(MAX_LIVES, G.lives + 1);
        NQ.audio.sfx('heart');
        message('+1 LIFE', 90);
        G.particles.burst(h.x, h.y, '#ff6a9a', 18, 3.5);
      }
    }

    // flag
    if (overlap(pr, G.flag)) {
      if (G.boss && G.boss.alive) {
        if (G.flagHint <= 0) message('The gate is locked. Defeat the Golem!', 140);
        G.flagHint = 180;
      } else {
        levelComplete();
        return;
      }
    }
    if (G.flagHint > 0) G.flagHint--;

    G.particles.update();
    updateCamera();
  }

  function updateCamera() {
    const p = G.p, w = G.world;
    if (!p || !w) return;
    const target = p.cx - W / 2 + p.face * 90;
    G.cam += (clamp(target, 0, w.pxW - W) - G.cam) * 0.14;
    G.cam = clamp(G.cam, 0, w.pxW - W);
  }

  // ---------- level finished ----------
  function levelComplete() {
    const secs = G.time / 60;
    const timeBonus = Math.max(0, Math.round((120 - secs) * 15));
    const noHit = G.stats.hits === 0 ? 500 : 0;
    const perfect = G.coinsGot === G.coinsTotal ? 300 : 0;
    G.score += timeBonus + noHit + perfect + 500;
    G.summary = {
      level: G.level.name, levelNo: G.levelNo, secs: Math.round(secs),
      coins: G.coinsGot, coinsTotal: G.coinsTotal, timeBonus, noHit, perfect,
      levelScore: G.score - G.levelStartScore, stats: { ...G.stats }, total: G.score,
    };
    if (G.mode === 'endless') {
      G.run.cleared++;
      NQ.audio.sfx('win');
      G.particles.burst(G.flag.x + 20, G.flag.y, '#ffe27a', 60, 6, 0.1, 50, 4);
      G.setState('clear');
      return;
    }
    const best = store.get('best', {});
    const key = 'L' + G.levelNo;
    if (!best[key] || G.summary.levelScore > best[key].score) {
      best[key] = { score: G.summary.levelScore, secs: G.summary.secs };
      store.set('best', best);
    }
    NQ.audio.sfx('win');
    G.particles.burst(G.flag.x + 20, G.flag.y, '#ffe27a', 60, 6, 0.1, 50, 4);
    if (G.levelNo >= NQ.LEVELS.length) {
      NQ.audio.music('win');
      G.setState('win');
      saveRun('win');
    } else {
      G.setState('clear');
    }
  }

  // ---------- high scores ----------
  function saveRun(kind) {
    const list = store.get('scores', []);
    list.push({
      name: (NQ.settings && NQ.settings.name) || 'PLAYER',
      score: G.score, level: G.levelNo, mode: G.mode, kind: G.mode === 'endless' ? 'endless' : kind,
      secs: Math.round(G.time / 60), date: new Date().toISOString().slice(0, 10),
    });
    list.sort((a, b) => b.score - a.score);
    store.set('scores', list.slice(0, 10));
    G.summary = G.summary || { total: G.score, levelNo: G.levelNo, level: G.level.name, stats: { ...G.stats }, coins: G.coinsGot, coinsTotal: G.coinsTotal, secs: Math.round(G.time / 60) };
  }

  // ---------- main loop ----------
  let acc = 0, last = 0;
  function frame(now) {
    if (!last) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { tick(); acc -= STEP; n++; }
    if (n >= 6) acc = 0;
    NQ.render.draw(G, now);
    requestAnimationFrame(frame);
  }

  NQ.boot = function () {
    NQ.audio.unlock();
    G.setState('menu');
    NQ.audio.music('menu');
    requestAnimationFrame((t) => { last = t; frame(t); });
  };

  // Keep a reference for helpers
  NQ.message = message;
})(window.NQ = window.NQ || {});
