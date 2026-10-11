/* NEON QUEST - render.js
 * All graphics are drawn in code: parallax skies, tiles, characters,
 * particles, ambient weather and the HUD. Nothing to download.
 */
(function (NQ) {
  'use strict';

  const T = NQ.TILE, FLOOR = NQ.FLOOR, TL = NQ.TILES;
  const W = 960, H = 600, LW = 1920;
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  let scale = 1, ox = 0, oy = 0, dpr = 1, vignette = null;

  // ---------------------------------------------------------- sizing
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = innerWidth, h = innerHeight;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    cvs.style.width = w + 'px';
    cvs.style.height = h + 'px';
    scale = Math.min(w / W, h / H);
    ox = (w - W * scale) / 2;
    oy = (h - H * scale) / 2;
    vignette = null;
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------- helpers
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  // Seamless horizontal wave band (period = LW)
  function wave(g, color, base, amp, k, phase) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= LW; x += 8) {
      const a = (x / LW) * Math.PI * 2;
      const y = base + amp * Math.sin(a * k + phase) + amp * 0.4 * Math.sin(a * (k * 2 + 1) + phase * 1.7);
      g.lineTo(x, y);
    }
    g.lineTo(LW, H);
    g.closePath();
    g.fill();
  }

  // ---------------------------------------------------------- themes
  const PAL = {
    meadow: {
      sky: ['#4fb8ff', '#d4f3ff'], top: '#6fd16f', topDark: '#3f9e4a', face: '#a0703f', faceDark: '#7a5230',
      plat: '#c79a5e', platDark: '#8a6234', crumble: '#b98d55', liquid: '#2a84dc', liquidHi: '#9fd8ff',
      accent: '#ffe27a', fx: 'petal',
    },
    cavern: {
      sky: ['#0a1330', '#24457d'], top: '#eaf8ff', topDark: '#9ccde9', face: '#5a7bb0', faceDark: '#3a5485',
      plat: '#8fcaf2', platDark: '#4d7fb0', crumble: '#a6dcf8', liquid: '#1b4a96', liquidHi: '#8fd4ff',
      accent: '#7af6ff', fx: 'snow',
    },
    volcano: {
      sky: ['#24050e', '#c4441c'], top: '#ff8a3a', topDark: '#c2441a', face: '#4a3038', faceDark: '#2b1b22',
      plat: '#7a5358', platDark: '#44292e', crumble: '#8a6258', liquid: '#ff5a18', liquidHi: '#ffd166',
      accent: '#ffb347', fx: 'ember',
    },
    desert: {
      sky: ['#ff9e5e', '#ffe6b0'], top: '#f5cf84', topDark: '#c98f45', face: '#d9a05b', faceDark: '#a8732f',
      plat: '#e6b971', platDark: '#a57438', crumble: '#ccae7a', liquid: '#2aa6c7', liquidHi: '#bff3ff',
      accent: '#fff1a8', fx: 'dust',
    },
    night: {
      sky: ['#07061a', '#2c1458'], top: '#49f0ff', topDark: '#1d7ea0', face: '#2b2f5e', faceDark: '#171a3b',
      plat: '#6a5bd6', platDark: '#3a2f8a', crumble: '#8a7de0', liquid: '#9a1fb0', liquidHi: '#ff8ae8',
      accent: '#ff4fd8', fx: 'glow',
    },
    sky: {
      sky: ['#5fbcff', '#eaf9ff'], top: '#ffffff', topDark: '#bfe6ff', face: '#cfe8ff', faceDark: '#8fb9e0',
      plat: '#ffd6a8', platDark: '#e0a06a', crumble: '#ffe2c2', liquid: '#3e9be0', liquidHi: '#e8f6ff',
      accent: '#ffe27a', fx: 'petal',
    },
  };

  // Pre-rendered parallax backgrounds and tile sprites per theme
  const bgCache = {}, tileCache = {};

  function buildBg(name) {
    const r = rng({ meadow: 3, cavern: 9, volcano: 17, desert: 23, night: 29, sky: 31 }[name]);
    const p = PAL[name];
    const sky = canvas(W, H), sg = sky.getContext('2d');
    const grad = sg.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, p.sky[0]); grad.addColorStop(1, p.sky[1]);
    sg.fillStyle = grad; sg.fillRect(0, 0, W, H);

    const layers = [];
    const make = (f) => { const c = canvas(LW, H); f(c.getContext('2d')); return c; };

    if (name === 'meadow') {
      sky.getContext('2d').fillStyle = '#fff6c2';
      for (const [rad, a] of [[120, 0.12], [80, 0.2], [52, 1]]) {
        sg.globalAlpha = a; sg.beginPath(); sg.arc(790, 110, rad, 0, 7); sg.fill();
      }
      sg.globalAlpha = 1;
      layers.push([make((g) => {
        for (let i = 0; i < 16; i++) {
          const x = r() * LW, y = 60 + r() * 150, s = 0.7 + r() * 0.8;
          g.fillStyle = 'rgba(255,255,255,0.92)';
          for (const [dx, dy, rr] of [[0, 0, 22], [28, -6, 28], [58, 0, 20], [-26, 4, 16]]) {
            for (const off of [-LW, 0, LW]) {
              g.beginPath(); g.arc(x + (dx) * s + off, y + dy * s, rr * s, 0, 7); g.fill();
            }
          }
        }
      }), 0.08]);
      layers.push([make((g) => wave(g, '#a4e6b0', 330, 36, 2, 0.5)), 0.18]);
      layers.push([make((g) => wave(g, '#70c98a', 385, 30, 3, 1.3)), 0.34]);
      layers.push([make((g) => {
        for (let i = 0; i < 90; i++) {
          const x = r() * LW, base = 420 + r() * 20, s = 0.7 + r() * 0.7;
          g.fillStyle = '#3f9a5c';
          for (const off of [-LW, 0, LW]) {
            g.beginPath();
            g.moveTo(x - 14 * s + off, base); g.lineTo(x + off, base - 60 * s); g.lineTo(x + 14 * s + off, base);
            g.closePath(); g.fill();
          }
        }
      }), 0.6]);
    } else if (name === 'cavern') {
      sg.fillStyle = '#fff';
      for (let i = 0; i < 120; i++) { sg.globalAlpha = 0.3 + r() * 0.7; sg.fillRect(r() * W, r() * H * 0.5, 2, 2); }
      sg.globalAlpha = 1;
      layers.push([make((g) => wave(g, '#22396b', 330, 60, 2, 0.4)), 0.15]);
      layers.push([make((g) => {
        wave(g, '#1a2d59', 390, 40, 3, 1.1);
        for (let i = 0; i < 60; i++) {
          const x = r() * LW, base = 400 + r() * 30, h = 30 + r() * 60;
          g.fillStyle = 'rgba(120,200,255,0.55)';
          for (const off of [-LW, 0, LW]) {
            g.beginPath(); g.moveTo(x - 8 + off, base); g.lineTo(x + off, base - h); g.lineTo(x + 8 + off, base);
            g.closePath(); g.fill();
          }
        }
      }), 0.32]);
      layers.push([make((g) => {
        for (let i = 0; i < 40; i++) {
          const x = r() * LW, h = 80 + r() * 90;
          for (const off of [-LW, 0, LW]) {
            g.fillStyle = 'rgba(12,28,60,0.95)';
            g.beginPath(); g.moveTo(x - 30 + off, 0); g.lineTo(x + off, h); g.lineTo(x + 30 + off, 0);
            g.closePath(); g.fill();
          }
        }
      }), 0.55]);
    } else if (name === 'desert') {
      sg.fillStyle = '#fff3c4';
      sg.beginPath(); sg.arc(300, 110, 56, 0, 7); sg.fill();
      sg.fillStyle = 'rgba(255,240,190,0.3)';
      sg.beginPath(); sg.arc(300, 110, 96, 0, 7); sg.fill();
      layers.push([make((g) => wave(g, '#e9be78', 330, 40, 2, 0.9)), 0.14]);
      layers.push([make((g) => {
        wave(g, '#d69a4f', 400, 26, 3, 2.1);
        for (let i = 0; i < 14; i++) {
          const x = r() * LW, base = 400 + r() * 14, s = 0.7 + r() * 0.6;
          g.fillStyle = '#5f8f4a';
          for (const off of [-LW, 0, LW]) {
            g.fillRect(x - 5 * s + off, base - 60 * s, 10 * s, 60 * s);
            g.fillRect(x - 16 * s + off, base - 38 * s, 12 * s, 6 * s);
            g.fillRect(x - 16 * s + off, base - 50 * s, 6 * s, 18 * s);
          }
        }
      }), 0.42]);
    } else if (name === 'night') {
      sg.fillStyle = '#fff';
      for (let i = 0; i < 90; i++) { sg.globalAlpha = 0.25 + r() * 0.75; sg.fillRect(r() * W, r() * H * 0.55, 2, 2); }
      sg.globalAlpha = 1;
      sg.fillStyle = '#ece6ff';
      sg.beginPath(); sg.arc(800, 120, 42, 0, 7); sg.fill();
      sg.fillStyle = 'rgba(236,230,255,0.12)';
      sg.beginPath(); sg.arc(800, 120, 76, 0, 7); sg.fill();
      layers.push([make((g) => {
        for (let i = 0; i < 46; i++) {
          const x = r() * LW, w = 26 + r() * 30, top = 290 + r() * 130;
          for (const off of [-LW, 0, LW]) {
            g.fillStyle = '#231d52'; g.fillRect(x + off, top, w, H - top);
            g.fillStyle = 'rgba(255,220,120,0.55)';
            for (let y = top + 10; y < H - 20; y += 14) if (r() < 0.35) g.fillRect(x + off + 6, y, 4, 6);
          }
        }
      }), 0.2]);
      layers.push([make((g) => {
        for (let i = 0; i < 26; i++) {
          const x = r() * LW, w = 40 + r() * 36, top = 370 + r() * 70;
          const neon = r() < 0.5 ? '#ff4fd8' : '#49f0ff';
          for (const off of [-LW, 0, LW]) {
            g.fillStyle = '#120e33'; g.fillRect(x + off, top, w, H - top);
            g.fillStyle = neon; g.fillRect(x + off, top, w, 3);
            g.globalAlpha = 0.5; g.fillRect(x + off + w / 2 - 1, top - 14, 2, 14); g.globalAlpha = 1;
          }
        }
      }), 0.55]);
    } else if (name === 'sky') {
      sg.fillStyle = '#fff3b0';
      sg.beginPath(); sg.arc(820, 110, 44, 0, 7); sg.fill();
      sg.fillStyle = 'rgba(255,243,176,0.25)';
      sg.beginPath(); sg.arc(820, 110, 80, 0, 7); sg.fill();
      layers.push([make((g) => {
        for (let i = 0; i < 18; i++) {
          const x = r() * LW, y = 70 + r() * 200, s = 0.8 + r() * 0.9;
          g.fillStyle = 'rgba(255,255,255,0.95)';
          for (const off of [-LW, 0, LW]) {
            for (const [dx, dy, rr] of [[0, 0, 26], [34, -8, 32], [72, 0, 24], [-30, 4, 18]]) {
              g.beginPath(); g.arc(x + dx * s + off, y + dy * s, rr * s, 0, 7); g.fill();
            }
          }
        }
      }), 0.1]);
      layers.push([make((g) => wave(g, '#bfe6ff', 350, 40, 2, 0.8)), 0.25]);
      layers.push([make((g) => {
        wave(g, '#86c9f5', 440, 30, 3, 2.6);
        for (let i = 0; i < 10; i++) {
          const x = r() * LW, y = 250 + r() * 130, s = 0.8 + r() * 0.8;
          for (const off of [-LW, 0, LW]) {
            g.fillStyle = '#7fbf6a';
            g.beginPath(); g.ellipse(x + off, y, 36 * s, 8 * s, 0, 0, 7); g.fill();
            g.fillStyle = '#8c6a4a';
            g.beginPath(); g.moveTo(x - 30 * s + off, y + 4 * s); g.lineTo(x + off, y + 30 * s); g.lineTo(x + 30 * s + off, y + 4 * s); g.closePath(); g.fill();
          }
        }
      }), 0.45]);
    } else {
      sg.fillStyle = 'rgba(255,200,120,0.9)';
      sg.beginPath(); sg.arc(780, 150, 70, 0, 7); sg.fill();
      sg.fillStyle = 'rgba(255,240,200,0.5)';
      sg.beginPath(); sg.arc(780, 150, 110, 0, 7); sg.fill();
      layers.push([make((g) => wave(g, '#5a1d26', 340, 60, 2, 2.2)), 0.16]);
      layers.push([make((g) => wave(g, '#3d1219', 390, 42, 3, 0.2)), 0.34]);
      layers.push([make((g) => {
        wave(g, '#26090f', 440, 26, 5, 1.7);
        for (let i = 0; i < 24; i++) {
          const x = r() * LW, y = 470 + r() * 20;
          g.strokeStyle = 'rgba(255,120,40,0.8)'; g.lineWidth = 3;
          for (const off of [-LW, 0, LW]) {
            g.beginPath(); g.moveTo(x + off, y); g.lineTo(x + 30 + off, y - 60 - r() * 40); g.stroke();
          }
        }
      }), 0.6]);
    }
    return { sky, layers, fx: null };
  }

  function getBg(name) {
    if (!bgCache[name]) bgCache[name] = buildBg(name);
    return bgCache[name];
  }

  function drawBg(name, cam, t) {
    const bg = getBg(name);
    ctx.drawImage(bg.sky, 0, 0);
    for (const [img, f] of bg.layers) {
      const x = -((cam * f) % LW);
      ctx.drawImage(img, x, 0);
      ctx.drawImage(img, x + LW, 0);
      ctx.drawImage(img, x - LW, 0);
    }
  }

  function tileSprites(name) {
    if (tileCache[name]) return tileCache[name];
    const p = PAL[name], r = rng(name.length * 91);
    const make = (f) => { const c = canvas(T, T); f(c.getContext('2d')); return c; };
    const dots = (g, col, n) => {
      g.fillStyle = col;
      for (let i = 0; i < n; i++) g.fillRect(r() * T, r() * T, 2, 2);
    };
    const S = {};
    S.body = make((g) => {
      g.fillStyle = p.face; g.fillRect(0, 0, T, T);
      dots(g, p.faceDark, 14);
      g.strokeStyle = p.faceDark; g.lineWidth = 2;
      g.strokeRect(1, 1, T - 2, T - 2);
    });
    S.top = make((g) => {
      g.fillStyle = p.face; g.fillRect(0, 0, T, T);
      dots(g, p.faceDark, 10);
      g.fillStyle = p.top; g.fillRect(0, 0, T, 11);
      g.fillStyle = p.topDark; g.fillRect(0, 9, T, 3);
      for (let x = 2; x < T; x += 6) {
        g.fillStyle = name === 'meadow' ? p.top : p.topDark;
        g.fillRect(x, 0, 3, 5 + r() * 4);
      }
      if (name === 'volcano') {
        g.strokeStyle = 'rgba(255,220,120,0.8)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(6, 16); g.lineTo(14, 24); g.lineTo(22, 18); g.stroke();
      }
      g.strokeStyle = p.faceDark; g.lineWidth = 2; g.strokeRect(1, 1, T - 2, T - 2);
    });
    S.plat = make((g) => {
      g.fillStyle = p.plat; rrect(g, 1, 4, T - 2, T - 8, 6); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(4, 7, T - 8, 4);
      g.fillStyle = p.platDark;
      g.fillRect(4, 22, T - 8, 3);
      g.beginPath(); g.arc(7, 17, 2, 0, 7); g.arc(T - 7, 17, 2, 0, 7); g.fill();
    });
    S.crumble = make((g) => {
      g.fillStyle = p.crumble; rrect(g, 1, 4, T - 2, T - 8, 6); g.fill();
      g.strokeStyle = p.platDark; g.lineWidth = 2;
      g.beginPath(); g.moveTo(8, 6); g.lineTo(18, 18); g.lineTo(14, 30); g.moveTo(26, 6); g.lineTo(30, 20); g.stroke();
    });
    tileCache[name] = S;
    return S;
  }

  // ---------------------------------------------------------- world parts
  function drawTiles(w, name, cam) {
    const S = tileSprites(name);
    const c0 = Math.max(0, Math.floor(cam / T) - 1);
    const c1 = Math.min(w.cols - 1, Math.floor((cam + W) / T) + 1);
    for (let c = c0; c <= c1; c++) {
      for (let r = 0; r < NQ.ROWS; r++) {
        const t = w.get(c, r);
        if (t === TL.EMPTY || t === TL.LIQUID) continue;
        const x = c * T - cam, y = r * T;
        if (t === TL.ONEWAY) ctx.drawImage(S.plat, x, y);
        else if (t === TL.CRUMBLE) {
          const cr = w.crumbleAt(c, r);
          if (cr && cr.state === 'idle') ctx.drawImage(S.crumble, x, y);
          else if (cr && cr.state === 'shake') {
            const j = (NQ.game.t % 2 ? 1.5 : -1.5);
            ctx.drawImage(S.crumble, x + j, y);
          }
        } else if (t === TL.SOLID) {
          ctx.drawImage(w.get(c, r - 1) === TL.SOLID ? S.body : S.top, x, y);
        }
      }
    }
  }

  function drawLiquid(w, name, cam, t) {
    const p = PAL[name];
    const c0 = Math.max(0, Math.floor(cam / T) - 1);
    const c1 = Math.min(w.cols - 1, Math.floor((cam + W) / T) + 1);
    const y = 14 * T;
    for (let c = c0; c <= c1; c++) {
      if (w.get(c, 14) !== TL.LIQUID) continue;
      ctx.fillStyle = p.liquid;
      ctx.fillRect(c * T - cam, y, T, H - y);
      ctx.fillStyle = p.liquidHi;
      for (let i = 0; i < 2; i++) {
        const wy = y + 6 + Math.sin(c * 0.9 + t * 0.12 + i * 2) * 3;
        ctx.fillRect(c * T - cam, wy, T, 2);
      }
    }
  }

  function drawLock(w, name, cam) {
    const boss = w.level.boss;
    if (!boss) return;
    for (const c of boss.lock) {
      if (!w.lockOn) continue;
      const x = c * T - cam;
      ctx.fillStyle = '#4b4150';
      ctx.fillRect(x, 0, T, FLOOR * T);
      ctx.fillStyle = '#ffb347';
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 9, 0, 4, FLOOR * T);
      ctx.fillStyle = '#2c2430';
      ctx.fillRect(x, 0, T, 6);
    }
  }

  function drawSpikes(list, cam, name) {
    for (const s of list) {
      const x0 = s.x - cam;
      if (x0 > W + 40 || x0 + s.w < -40) continue;
      for (let x = 0; x < s.w; x += 14) {
        ctx.fillStyle = '#d5dbe8';
        ctx.beginPath();
        ctx.moveTo(x0 + x, s.y + s.h); ctx.lineTo(x0 + x + 7, s.y); ctx.lineTo(x0 + x + 14, s.y + s.h);
        ctx.fill();
        ctx.fillStyle = '#7c8499';
        ctx.beginPath();
        ctx.moveTo(x0 + x + 7, s.y); ctx.lineTo(x0 + x + 14, s.y + s.h); ctx.lineTo(x0 + x + 9, s.y + s.h);
        ctx.fill();
      }
    }
  }

  function drawSprings(list, cam, name, t) {
    const p = PAL[name];
    for (const s of list) {
      const x = s.x - cam, squash = s.cool > 14 ? 5 : 0;
      ctx.fillStyle = '#3ddc84';
      rrect(ctx, x + 4, s.y + 4 + squash, T - 8, 8 - squash, 3); ctx.fill();
      ctx.strokeStyle = '#1f9c5b'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = s.y + 4 + squash - (i % 2) * 3;
        ctx.lineTo(x + 8 + i * 6, yy);
      }
      ctx.stroke();
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 0.2);
      ctx.fillRect(x + 12, s.y + 2, 16, 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawCheckpoint(cp, cam, t) {
    if (!cp) return;
    const x = cp.x - cam;
    ctx.fillStyle = '#d7dbe6';
    ctx.fillRect(x, FLOOR * T - 84, 4, 84);
    const col = cp.active ? '#7ff9f0' : '#8a8f9c';
    ctx.fillStyle = col;
    const wv = Math.sin(t * 0.15) * 3;
    ctx.beginPath();
    ctx.moveTo(x + 4, FLOOR * T - 84); ctx.lineTo(x + 36, FLOOR * T - 74 + wv); ctx.lineTo(x + 4, FLOOR * T - 62);
    ctx.fill();
  }

  function drawFlag(f, cam, t, bossAlive) {
    const x = f.x - cam;
    ctx.fillStyle = '#e8ecf5';
    ctx.fillRect(x + 6, f.y, 5, f.h);
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(x + 8, f.y - 4, 7, 0, 7); ctx.fill();
    ctx.fillStyle = bossAlive ? '#6d6878' : '#48e077';
    const wv = Math.sin(t * 0.12) * 5;
    ctx.beginPath();
    ctx.moveTo(x + 11, f.y + 6); ctx.lineTo(x + 50, f.y + 18 + wv); ctx.lineTo(x + 11, f.y + 36);
    ctx.fill();
    if (bossAlive) {
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(x + 14, f.y + 80, 18, 14);
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + 23, f.y + 80, 7, Math.PI, 0); ctx.stroke();
    }
  }

  function drawSigns(list, cam, p) {
    for (const s of list) {
      const x = s.x - cam + 8;
      if (x < -200 || x > W + 200) continue;
      ctx.fillStyle = '#8a5a34'; ctx.fillRect(x - 2, FLOOR * T - 88, 4, 40);
      ctx.fillStyle = '#c99a5e'; rrect(ctx, x - 22, FLOOR * T - 110, 44, 26, 4); ctx.fill();
      ctx.fillStyle = '#4a2c16'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('i', x, FLOOR * T - 92);
      ctx.textAlign = 'left';
      const near = Math.abs(s.x - p.cx) < 300;
      if (near) {
        const txt = s.text;
        ctx.font = 'bold 16px system-ui, sans-serif';
        const tw = ctx.measureText(txt).width + 26;
        const bx = Math.min(W - tw - 10, Math.max(10, x - tw / 2));
        ctx.fillStyle = 'rgba(10,14,30,0.82)'; rrect(ctx, bx, FLOOR * T - 152, tw, 30, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(txt, bx + 13, FLOOR * T - 132);
      }
    }
  }

  function drawCoins(list, cam, t) {
    for (const c of list) {
      if (c.got) continue;
      const x = c.x - cam;
      if (x < -30 || x > W + 30) continue;
      const bob = Math.sin(t * 0.07 + c.x * 0.05) * 3;
      const sx = Math.abs(Math.cos(t * 0.08 + c.x * 0.05)) * 9 + 2;
      const y = c.y + bob;
      ctx.fillStyle = '#e8a817';
      ctx.beginPath(); ctx.ellipse(x, y, sx, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.ellipse(x - sx * 0.25, y - 3, sx * 0.5, 6, 0, 0, 7); ctx.fill();
    }
  }

  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y - s * 0.2, x - s * 0.5, y - s * 0.3, x - s * 0.5, y + s * 0.05);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.4, x, y + s * 0.6, x, y + s * 0.75);
    ctx.bezierCurveTo(x, y + s * 0.6, x + s * 0.5, y + s * 0.4, x + s * 0.5, y + s * 0.05);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.3, x, y - s * 0.2, x, y + s * 0.3);
    ctx.closePath();
  }

  function drawHearts(list, cam, t) {
    for (const h of list) {
      if (h.got) continue;
      const x = h.x - cam;
      const pulse = 1 + Math.sin(t * 0.12 + h.y) * 0.08;
      ctx.fillStyle = '#ff5a86';
      heartPath(x, h.y - 2, 26 * pulse); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(x - 6, h.y - 8, 3, 0, 7); ctx.fill();
    }
  }

  function drawMovers(list, cam, name) {
    const p = PAL[name];
    for (const m of list) {
      const x = m.x - cam;
      if (x > W + 100 || x + m.w < -100) continue;
      ctx.fillStyle = p.plat; rrect(ctx, x, m.y, m.w, m.h + 6, 5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 4, m.y + 2, m.w - 8, 3);
      ctx.fillStyle = p.platDark;
      ctx.beginPath(); ctx.arc(x + 8, m.y + 8, 2, 0, 7); ctx.arc(x + m.w - 8, m.y + 8, 2, 0, 7); ctx.fill();
    }
  }

  // ---------------------------------------------------------- characters
  function drawWalker(e, cam, t) {
    const x = e.x - cam + e.w / 2, y = e.y + e.h / 2;
    const wob = Math.sin(t * 0.3 + e.t) * 2;
    ctx.fillStyle = '#7a3fb8';
    ctx.beginPath(); ctx.ellipse(x, y + 2, e.w / 2 + 2, e.h / 2 + wob * 0.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b06cf0';
    ctx.beginPath(); ctx.ellipse(x, y, e.w / 2, e.h / 2 - 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(x - 5, y - 6, 4, 3, 0, 0, 7); ctx.fill();
    for (const dx of [-6, 6]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + dx, y - 3, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#1b0f2a';
      ctx.beginPath(); ctx.arc(x + dx + e.dir * 2, y - 2, 2.4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#5a2a8a';
    ctx.fillRect(x - 10 + wob, e.y + e.h - 3, 7, 4);
    ctx.fillRect(x + 4 - wob, e.y + e.h - 3, 7, 4);
  }

  function drawBat(e, cam, t) {
    const x = e.x - cam + e.w / 2, y = e.y + e.h / 2;
    const fl = Math.sin(e.t * 0.4) * 11;
    ctx.fillStyle = '#3e3054';
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 24, y - 8 + fl); ctx.lineTo(x - 28, y + 6 + fl); ctx.lineTo(x - 14, y + 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 24, y - 8 + fl); ctx.lineTo(x + 28, y + 6 + fl); ctx.lineTo(x + 14, y + 3); ctx.fill();
    ctx.fillStyle = '#4a3a6e';
    ctx.beginPath(); ctx.ellipse(x, y, 11, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath(); ctx.arc(x - 4, y - 2, 2.6, 0, 7); ctx.arc(x + 4, y - 2, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x - 3, y + 5); ctx.lineTo(x - 1, y + 8); ctx.lineTo(x + 1, y + 5); ctx.fill();
  }

  function drawTurret(e, cam, t, target) {
    const x = e.x - cam, y = e.y;
    const bx = x + 15, by = y + 10;
    let ang = -Math.PI / 2;
    if (target) ang = Math.atan2(target.cy - by, target.cx - bx);
    ctx.fillStyle = '#5b6276';
    rrect(ctx, x + 2, y + 12, 26, 20, 4); ctx.fill();
    ctx.save();
    ctx.translate(bx, by); ctx.rotate(ang);
    ctx.fillStyle = '#7d869c'; ctx.fillRect(0, -4, 20, 8);
    ctx.restore();
    ctx.fillStyle = e.cd < 25 ? '#ffb347' : '#ff4d4d';
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill();
  }

  function drawShot(s, cam, t) {
    const x = s.x - cam, y = s.y;
    if (s.kind === 'rock') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.spin);
      ctx.fillStyle = '#8c8496';
      ctx.beginPath(); ctx.arc(0, 0, s.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4e4758'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-5, -3); ctx.lineTo(2, 2); ctx.lineTo(6, -4); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(255,120,30,0.35)';
      ctx.beginPath(); ctx.arc(x, y, s.r + 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff7a1f';
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(x, y, s.r * 0.5, 0, 7); ctx.fill();
    }
  }

  function drawBoss(b, cam, t) {
    if (b.state === 'sleep') { /* still drawn, dormant */ }
    if (b.inv > 0 && (b.inv >> 2) % 2 === 0 && b.alive) return;
    const x = b.x - cam, y = b.y;
    const alpha = b.dying > 0 ? b.dying / 70 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    const shakeY = b.charge > 0 ? Math.sin(t * 0.8) * 2 : 0;
    const sw = Math.sin(b.t * 0.15) * 4;
    ctx.fillStyle = '#5c5566';
    rrect(ctx, x - 12, y + 34 + sw, 20, 46, 8); ctx.fill();
    rrect(ctx, x + b.w - 8, y + 34 - sw, 20, 46, 8); ctx.fill();
    ctx.fillStyle = b.charge > 0 ? '#8b4a52' : '#7b7384';
    rrect(ctx, x, y + shakeY, b.w, b.h, 16); ctx.fill();
    ctx.strokeStyle = '#2c2734'; ctx.lineWidth = 3;
    rrect(ctx, x, y + shakeY, b.w, b.h, 16); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,25,36,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 22, y + 46); ctx.lineTo(x + 36, y + 64); ctx.lineTo(x + 30, y + 80); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 58, y + 52); ctx.lineTo(x + 50, y + 74); ctx.stroke();
    const eyeCol = b.hp > 1 ? '#ff7a3a' : '#ff2d2d';
    for (const ex of [x + 24, x + b.w - 24]) {
      ctx.fillStyle = eyeCol;
      ctx.beginPath(); ctx.arc(ex, y + 30 + shakeY, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9a6';
      ctx.beginPath(); ctx.arc(ex, y + 30 + shakeY, 4, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#2b2530';
    ctx.fillRect(x + 20, y + 58 + shakeY, b.w - 40, 7);
    ctx.restore();
  }

  function drawPlayer(p, cam, t, state) {
    if (!p) return;
    // Dash afterimages
    for (const tr of p.trail) {
      ctx.fillStyle = 'rgba(122,246,255,' + (tr.t / 14 * 0.35).toFixed(3) + ')';
      rrect(ctx, tr.x - cam, tr.y, p.w, p.h, 10); ctx.fill();
    }
    if (state === 'dying') return;
    if (p.inv > 0 && !p.dashing && (Math.floor(t / 3) % 2 === 0)) return;
    const x = p.x - cam, y = p.y;
    const sq = p.squash ? 1 + p.squash * 0.012 : 1;
    const sqY = p.squash ? 1 - p.squash * 0.015 : 1;
    const f = p.face;
    const run = p.onGround && Math.abs(p.vx) > 0.5 ? Math.sin(p.anim) * 3 : 0;
    ctx.save();
    ctx.translate(x + p.w / 2, y + p.h);
    ctx.scale(sq, sqY);
    ctx.translate(-(p.w / 2), -p.h);
    // scarf
    ctx.fillStyle = '#ff5a5a';
    const sway = Math.sin(t * 0.25) * 3 - f * 6;
    ctx.beginPath(); ctx.moveTo(4, 12); ctx.lineTo(-10 + sway, 8); ctx.lineTo(-8 + sway, 14); ctx.lineTo(4, 16); ctx.fill();
    // legs
    ctx.fillStyle = '#2a64b8';
    ctx.fillRect(4, 30 - run, 7, 6 + run);
    ctx.fillRect(15, 30 + run, 7, 6 - run);
    // body
    ctx.fillStyle = '#4ac8ff';
    rrect(ctx, 0, 0, p.w, 32, 10); ctx.fill();
    ctx.strokeStyle = '#1f6fb3'; ctx.lineWidth = 2;
    rrect(ctx, 1, 1, p.w - 2, 30, 10); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(8, 8, 4, 2.5, -0.4, 0, 7); ctx.fill();
    // eyes
    for (const ex of [9 + f * 2, 18 + f * 2]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, 13, 4.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#16203a';
      ctx.beginPath(); ctx.arc(ex + f * 1.5, 13.6, 2.2, 0, 7); ctx.fill();
    }
    if (p.dashing) { ctx.fillStyle = '#fff'; ctx.fillRect(-4, 14, 4, 2); }
    ctx.restore();
  }

  // ---------------------------------------------------------- ambient
  const fxState = {};
  function ambient(name, t) {
    const p = PAL[name];
    if (!fxState[name]) {
      const r = rng(name.length * 31 + 7);
      fxState[name] = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, s: 0.5 + r() * 1.2, p: r() * 6.28 }));
    }
    const list = fxState[name];
    for (const f of list) {
      if (p.fx === 'ember') {
        f.y -= 0.7 * f.s; f.x += Math.sin(t * 0.03 + f.p) * 0.6;
        if (f.y < -10) { f.y = H + 10; f.x = Math.random() * W; }
        ctx.fillStyle = `rgba(255,${150 + Math.floor(f.s * 80)},60,0.9)`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 1.6 + f.s, 0, 7); ctx.fill();
      } else if (p.fx === 'dust') {
        f.x -= 1.4 * f.s; f.y += Math.sin(t * 0.02 + f.p) * 0.3;
        if (f.x < -10) { f.x = W + 10; f.y = Math.random() * H; }
        ctx.fillStyle = 'rgba(255,236,190,0.6)';
        ctx.fillRect(f.x, f.y, 2 + f.s, 2);
      } else if (p.fx === 'glow') {
        f.y -= 0.25 * f.s; f.x += Math.sin(t * 0.02 + f.p) * 0.4;
        if (f.y < -10) { f.y = H + 10; f.x = Math.random() * W; }
        const a = 0.5 + 0.5 * Math.sin(t * 0.08 + f.p);
        ctx.fillStyle = 'rgba(160,255,255,' + (0.25 + a * 0.6).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(f.x, f.y, 1.5 + f.s * 0.8, 0, 7); ctx.fill();
      } else if (p.fx === 'snow') {
        f.y += 0.9 * f.s; f.x += Math.sin(t * 0.03 + f.p) * 0.5;
        if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
        ctx.fillStyle = 'rgba(240,250,255,0.85)';
        ctx.beginPath(); ctx.arc(f.x, f.y, 1.4 + f.s, 0, 7); ctx.fill();
      } else {
        f.y += 0.6 * f.s; f.x += Math.sin(t * 0.02 + f.p) * 1.2 - 0.3;
        if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
        ctx.fillStyle = 'rgba(255,190,220,0.85)';
        ctx.beginPath(); ctx.ellipse(f.x, f.y, 4, 2.5, f.p, 0, 7); ctx.fill();
      }
    }
  }

  // ---------------------------------------------------------- particles
  function drawParticles(list, cam) {
    for (const q of list) {
      const a = Math.max(0, q.life / q.max);
      if (q.text) {
        ctx.globalAlpha = a;
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(q.text, q.x - cam, q.y);
        ctx.fillStyle = q.color; ctx.fillText(q.text, q.x - cam, q.y);
        ctx.textAlign = 'left'; ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x - cam, q.y, Math.max(0.6, q.size * a), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------- HUD
  function fmtTime(frames) {
    const s = Math.floor(frames / 60);
    return String(Math.floor(s / 60)).padStart(1, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  let shownScore = 0;
  function drawHUD(G) {
    // top bar
    const bar = ctx.createLinearGradient(0, 0, 0, 58);
    bar.addColorStop(0, 'rgba(8,12,28,0.78)');
    bar.addColorStop(1, 'rgba(8,12,28,0.3)');
    ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 58);

    // lives
    const lives = Math.min(G.lives, 9);
    for (let i = 0; i < lives; i++) {
      ctx.fillStyle = '#ff5a86';
      heartPath(24 + i * 26, 28, 20); ctx.fill();
    }
    if (G.lives > 9) text('+' + (G.lives - 9), 258, 33, 16, '#ff9ab5', 'left');
    if (G.lives === 0) text('0 LIVES', 24, 33, 16, '#ff9ab5', 'left');

    // coins
    ctx.fillStyle = '#e8a817';
    ctx.beginPath(); ctx.ellipse(302, 28, 9, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath(); ctx.ellipse(300, 25, 3, 3, 0, 0, 7); ctx.fill();
    text(G.coinsGot + ' / ' + G.coinsTotal, 318, 34, 19, '#fff', 'left');

    // level title (center)
    text(G.levelLabel + '  ·  ' + G.level.name.toUpperCase(), W / 2, 84, 15, 'rgba(255,255,255,0.95)', 'center');

    // score (count-up) and time
    shownScore += (G.score - shownScore) * 0.25;
    if (Math.abs(G.score - shownScore) < 1) shownScore = G.score;
    text('SCORE ' + Math.round(shownScore), W - 18, 26, 21, '#ffe27a', 'right');
    text('⏱ ' + fmtTime(G.time), W - 18, 48, 15, '#cfe6ff', 'right');

    if (G.combo > 1) {
      const pulse = 1 + Math.sin(G.t * 0.3) * 0.06;
      ctx.save();
      ctx.translate(W - 110, 70); ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255,90,40,0.9)'; rrect(ctx, -60, -15, 120, 28, 14); ctx.fill();
      text('COMBO x' + G.combo, 0, 5, 16, '#fff', 'center');
      ctx.restore();
    }

    // boss health
    if (G.boss && G.boss.state !== 'sleep' && G.boss.alive) {
      const bw = 420, bx = (W - bw) / 2, by = H - 42;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; rrect(ctx, bx - 4, by - 22, bw + 8, 40, 10); ctx.fill();
      text('STONE GOLEM', W / 2, by - 4, 14, '#ffd0a0', 'center');
      ctx.fillStyle = '#3a2f36'; rrect(ctx, bx, by + 2, bw, 14, 6); ctx.fill();
      ctx.fillStyle = '#ff6a3a';
      rrect(ctx, bx, by + 2, bw * (G.boss.hp / G.boss.maxHp), 14, 6); ctx.fill();
    }

    // message
    if (G.msgT > 0 && G.msg) {
      const a = Math.min(1, G.msgT / 20);
      ctx.globalAlpha = a;
      text(G.msg, W / 2, H * 0.24, 26, '#fff', 'center');
      ctx.globalAlpha = 1;
    }

    // level intro banner
    if (G.state === 'intro') {
      const k = 1 - G.intro / 150;
      const a = Math.min(1, k * 4, G.intro / 30);
      ctx.fillStyle = 'rgba(4,6,18,' + (0.55 * a).toFixed(3) + ')';
      ctx.fillRect(0, H * 0.36, W, 150);
      ctx.globalAlpha = a;
      const slide = Math.max(0, 1 - k * 5) * 60;
      text(G.levelLabel, W / 2 - slide, H * 0.36 + 44, 26, '#ffe27a', 'center');
      text(G.level.name.toUpperCase(), W / 2 + slide, H * 0.36 + 98, 56, '#fff', 'center');
      text(G.level.sub, W / 2, H * 0.36 + 134, 18, '#cfe6ff', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function text(s, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px system-ui, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(s, x + 2, y + 2);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.textAlign = 'left';
  }

  // ---------------------------------------------------------- main draw
  function drawVignette() {
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function draw(G, now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    const sh = (G.shake > 0 && (!NQ.settings || NQ.settings.shake !== false)) ? G.shake : 0;
    const jx = sh ? (Math.random() - 0.5) * sh * 1.2 : 0;
    const jy = sh ? (Math.random() - 0.5) * sh * 1.2 : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + jx * scale), dpr * (oy + jy * scale));
    ctx.imageSmoothingEnabled = true;

    if (!G.world || G.state === 'menu') {
      const t = G.t;
      drawBg('meadow', (t * 0.5) % (LW - W), t);
      ctx.fillStyle = 'rgba(10,20,40,0.25)';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const w = G.world, name = G.level.theme, cam = Math.round(G.cam), t = G.t;
    drawBg(name, cam, t);
    ambient(name, t);
    drawLiquid(w, name, cam, t);
    drawTiles(w, name, cam);
    drawLock(w, name, cam);
    drawSpikes(G.spikes, cam, name);
    drawSprings(G.springs, cam, name, t);
    drawCheckpoint(G.checkpoint, cam, t);
    drawFlag(G.flag, cam, t, G.boss && G.boss.alive);
    drawSigns(G.signs, cam, G.p);
    drawMovers(w.movers, cam, name);
    drawCoins(G.coins, cam, t);
    drawHearts(G.hearts, cam, t);
    for (const e of G.walkers) if (e.alive) drawWalker(e, cam, t);
    for (const e of G.bats) if (e.alive) drawBat(e, cam, t);
    for (const e of G.turrets) if (e.alive) drawTurret(e, cam, t, G.p);
    if (G.boss) drawBoss(G.boss, cam, t);
    for (const s of G.shots) drawShot(s, cam, t);
    drawPlayer(G.p, cam, t, G.state);
    drawParticles(G.particles.list, cam);
    drawVignette();
    drawHUD(G);
  }

  NQ.render = { draw, resize };
})(window.NQ = window.NQ || {});
