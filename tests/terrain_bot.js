// Terrain reachability check: campaign levels AND generated endless stages.
// A run-and-jump bot drives the REAL player physics (no enemies). Before each jump
// it simulates the jump forward and only jumps if it would land beyond the next gap,
// so passing means every gap / moving platform is reachable with correct timing.
global.window = {};
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'js');
for (const f of ['levels', 'generator', 'world', 'entities']) eval(fs.readFileSync(path.join(root, f + '.js'), 'utf8'));
const NQ = window.NQ, T = NQ.TILE, FLOOR = NQ.FLOOR;

// Would a jump started now land us beyond x = target within maxF frames?
function jumpLands(p, w, target, maxF = 80) {
  const q = new NQ.Player(w, 0, 0);
  Object.assign(q, { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, coyote: p.coyote,
    jbuf: 0, dashT: 0, dashCD: 99, inv: 0, face: 1, standOn: p.standOn, squash: 0, trail: [] });
  const saved = w.movers.map((m) => ({ m, x: m.x, dir: m.dir, dx: m.dx }));
  const noop = { jump() {}, dash() {}, land() {} };
  let ok = false;
  for (let f = 0; f < maxF; f++) {
    const inp = { left: false, right: true, jumpPressed: f === 0, jumpHeld: f < 22, dashPressed: false };
    for (const m of w.movers) m.update();
    q.step(inp, w, noop);
    if (q.y + q.h > 14 * T + 12) break;
    if (f > 8 && q.onGround && q.x > target) { ok = true; break; }
  }
  for (const s of saved) { s.m.x = s.x; s.m.dir = s.dir; s.m.dx = s.dx; }
  return ok;
}

// Runs the bot over one level. Returns { reached, dead, bestX, jumps }.
function runBot(L) {
  const w = new NQ.World(L);
  const p = new NQ.Player(w, L.start[0], L.start[1]);
  const ev = { jump() {}, dash() {}, land() {} };
  let jumpFrames = 0, bestX = 0, stuck = 0, dead = false, jumps = 0, wait = false;
  for (let f = 0; f < 60 * 150; f++) {
    if (p.onGround && jumpFrames === 0) {
      const feet = Math.floor((p.y + p.h - 2) / T);
      // find the next pit / wall / ledge within 4 tiles
      let hazardAt = -1;
      for (let s = 0; s <= 160; s += 8) {
        const col = Math.floor((p.x + p.w + s) / T);
        if (!w.isSolid(col, FLOOR) || w.isSolid(col, feet)) { hazardAt = col * T; break; }
      }
      const pitEdgeDist = hazardAt < 0 ? 999 : hazardAt - (p.x + p.w);
      // a moving platform near this pit: wait at the edge for it, like a player would
      const moverNear = hazardAt >= 0 && w.movers.some((m) => m.min < hazardAt + 6 * T && m.max + m.w > hazardAt - 2 * T);
      wait = false;
      if (hazardAt >= 0 && jumpLands(p, w, hazardAt + 2 * T)) {
        jumpFrames = 22; jumps++;
      } else if (hazardAt >= 0 && moverNear && pitEdgeDist < 6) {
        wait = true;
      } else if (hazardAt >= 0 && pitEdgeDist < 6) {
        jumpFrames = 22; jumps++;
      }
      // moving platform ahead: jump when a jump would land on it / beyond it
      for (const m of w.movers) {
        const dy = (p.y + p.h) - m.y;
        if (!p.standOn && dy > 0 && dy < 124 && m.x > p.x + p.w - 8 && m.x < p.x + p.w + 200 && jumpFrames === 0) {
          if (jumpLands(p, w, m.x + m.w - 8)) { jumpFrames = 22; jumps++; }
        }
      }
    }
    const inp = { left: false, right: !wait, jumpPressed: jumpFrames === 22, jumpHeld: jumpFrames > 0, dashPressed: false };
    if (jumpFrames > 0) jumpFrames--;
    w.update();                      // same order as game.js: platforms move, then the player
    p.step(inp, w, ev);
    if (p.y + p.h > 14 * T + 12) { dead = true; break; }
    if (p.x > bestX + 1) { bestX = p.x; stuck = 0; } else stuck++;
    if (p.x >= L.flag * T - 40) break;
    if (stuck > 300) break;
  }
  return { reached: bestX >= L.flag * T - 60, dead, bestX, jumps };
}

function report(label, L, quiet) {
  const r = runBot(L);
  const ok = r.reached;
  if (!quiet || !ok) {
    console.log(`${label.padEnd(16)} flag@${L.flag * T}px  bot reached x=${Math.round(r.bestX)}  ` +
      `${ok ? 'REACHED FLAG' : (r.dead ? 'fell in pit' : 'stuck')}  (jumps ${r.jumps})`);
  }
  return ok;
}

// ---- 1. the hand-made campaign levels
let fails = 0;
for (const L of NQ.LEVELS) if (!report(L.name, L, false)) fails++;

// ---- 2. generated endless stages: 4 runs x 12 stages, every theme and mix should show up
const seen = { themes: new Set(), mixes: new Set() };
let total = 0, ok = 0;
for (const seed of [11, 22, 33, 44]) {
  const run = NQ.endless.newRun(seed);
  for (let n = 1; n <= 12; n++) {
    const L = NQ.endless.stage(run, n);
    seen.themes.add(L.theme); seen.mixes.add(L.sub);
    total++;
    if (report(`seed ${seed} stage ${String(n).padStart(2)} ${L.name}`, L, true)) ok++;
    else fails++;
  }
}
console.log(`\nEndless stages reached the flag: ${ok}/${total}`);
console.log(`Themes used: ${[...seen.themes].join(', ')}`);
console.log(`Obstacle mixes used: ${[...seen.mixes].join(', ')}`);
console.log(fails ? `\nFAILED: ${fails} level(s) not reachable` : '\nAll levels reachable.');
process.exitCode = fails ? 1 : 0;
