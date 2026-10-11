/* NEON QUEST - world.js
 * Tile grid, crumbling platforms, moving platforms and dynamic boss-arena walls.
 */
(function (NQ) {
  'use strict';

  const T = 40;          // tile size in pixels
  const ROWS = 15;       // rows per level (600px tall)
  const FLOOR = 13;      // row index of the top ground row
  const EMPTY = 0, SOLID = 1, LIQUID = 2, ONEWAY = 3, CRUMBLE = 4;

  class Crumble {
    constructor(c, r) {
      this.c = c; this.r = r;
      this.state = 'idle';   // idle -> shake -> gone -> idle
      this.t = 0;
    }
    trigger() {
      if (this.state === 'idle') { this.state = 'shake'; this.t = 36; }
    }
    update(w) {
      if (this.state === 'shake' && --this.t <= 0) {
        this.state = 'gone';
        this.t = 190;
        w.set(this.c, this.r, EMPTY);
        if (w.onCrumbleFall) w.onCrumbleFall(this.c, this.r);
      } else if (this.state === 'gone' && --this.t <= 0) {
        this.state = 'idle';
        w.set(this.c, this.r, CRUMBLE);
      }
    }
  }

  class Mover {
    constructor(def) {
      this.row = def.row;
      this.min = def.a * T;
      this.max = def.b * T;
      this.w = def.w * T;
      this.h = 14;
      this.sp = def.sp;
      this.x = this.min;
      this.y = this.row * T;
      this.dir = 1;
      this.dx = 0;
    }
    update() {
      const old = this.x;
      this.x += this.dir * this.sp;
      if (this.x >= this.max) { this.x = this.max; this.dir = -1; }
      if (this.x <= this.min) { this.x = this.min; this.dir = 1; }
      this.dx = this.x - old;
    }
  }

  class World {
    constructor(level) {
      this.level = level;
      this.cols = level.width;
      this.rows = ROWS;
      this.pxW = this.cols * T;
      this.pxH = ROWS * T;
      this.g = new Uint8Array(this.cols * ROWS);
      this.crumbles = [];
      this.movers = [];
      this.lockOn = false;
      this.onCrumbleFall = null;

      const inGround = new Uint8Array(this.cols);
      for (const [a, b] of level.ground) {
        for (let c = a; c < b; c++) {
          inGround[c] = 1;
          this.set(c, FLOOR, SOLID);
          this.set(c, FLOOR + 1, SOLID);
        }
      }
      // Anything without ground is a lava/water pit
      for (let c = 0; c < this.cols; c++) {
        if (!inGround[c]) this.set(c, FLOOR + 1, LIQUID);
      }
      for (const [r, a, b] of level.plats) {
        for (let c = a; c < b; c++) if (this.get(c, r) === EMPTY) this.set(c, r, ONEWAY);
      }
      for (const [r, a, b] of level.crumble) {
        for (let c = a; c < b; c++) {
          this.set(c, r, CRUMBLE);
          this.crumbles.push(new Crumble(c, r));
        }
      }
      for (const m of level.movers) this.movers.push(new Mover(m));
    }

    get(c, r) {
      if (c < 0 || c >= this.cols) return SOLID;     // level edges are walls
      if (r < 0 || r >= ROWS) return EMPTY;
      return this.g[r * this.cols + c];
    }

    set(c, r, t) {
      if (c < 0 || c >= this.cols || r < 0 || r >= ROWS) return;
      this.g[r * this.cols + c] = t;
    }

    isSolid(c, r) {
      const t = this.get(c, r);
      return t === SOLID || t === CRUMBLE;
    }

    // Arena walls for the boss fight (solid rows 0..12 at the lock columns)
    setLock(on) {
      const boss = this.level.boss;
      if (!boss) return;
      this.lockOn = on;
      for (const c of boss.lock) {
        for (let r = 0; r < FLOOR; r++) this.set(c, r, on ? SOLID : EMPTY);
      }
    }

    crumbleAt(c, r) {
      return this.crumbles.find((cr) => cr.c === c && cr.r === r);
    }

    update() {
      for (const m of this.movers) m.update();
      for (const cr of this.crumbles) cr.update(this);
    }
  }

  NQ.World = World;
  NQ.TILE = T;
  NQ.ROWS = ROWS;
  NQ.FLOOR = FLOOR;
  NQ.TILES = { EMPTY, SOLID, LIQUID, ONEWAY, CRUMBLE };
})(window.NQ = window.NQ || {});
