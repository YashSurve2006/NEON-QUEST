/* NEON QUEST - entities.js
 * Player physics (run, variable jump, coyote time, jump buffer, dash), enemies,
 * boss, projectiles and particles.
 */
(function (NQ) {
  'use strict';

  const T = NQ.TILE, FLOOR = NQ.FLOOR, TL = NQ.TILES;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const P = {
    G: 0.62, MAXFALL: 15, RUN: 5.0, ACC_G: 0.9, ACC_A: 0.5,
    FRIC_G: 0.72, FRIC_A: 0.97, JV: -12.8, CUT: 0.82,
    DASH_V: 11, DASH_T: 10, DASH_CD: 50, SPRING_V: -19,
    COYOTE: 6, BUF: 7, INV: 100,
  };

  // ------------------------------------------------------------ player
  class Player {
    constructor(world, col, row) {
      this.w = 26; this.h = 36;
      this.respawn(col, row);
      this.anim = 0;
      this.face = 1;
      this.trail = [];
    }

    respawn(col, row) {
      this.x = col * T + 7;
      this.y = row * T + 4;
      this.vx = 0; this.vy = 0;
      this.onGround = false; this.standOn = null;
      this.coyote = 0; this.jbuf = 0;
      this.dashT = 0; this.dashCD = 0; this.dashDir = 1;
      this.inv = P.INV;
      this.squash = 0;
      this.dead = false;
      this.trail = [];
    }

    get cx() { return this.x + this.w / 2; }
    get cy() { return this.y + this.h / 2; }
    get dashing() { return this.dashT > 0; }

    // inp: {left, right, jumpPressed, jumpHeld, dashPressed}
    // ev:  callbacks {jump, dash, land, crumble(c,r)}
    step(inp, world, ev) {
      if (this.inv > 0) this.inv--;
      if (this.dashCD > 0) this.dashCD--;
      if (this.squash > 0) this.squash--;
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir) this.face = dir;

      if (inp.dashPressed && this.dashCD === 0 && !this.dashing) {
        this.dashT = P.DASH_T;
        this.dashCD = P.DASH_CD;
        this.dashDir = dir || this.face;
        this.inv = Math.max(this.inv, P.DASH_T + 6);
        ev.dash && ev.dash();
      }

      if (this.dashing) {
        this.dashT--;
        this.vx = this.dashDir * P.DASH_V;
        this.vy = 0;
        this.trail.push({ x: this.x, y: this.y, t: 14 });
        if (this.dashT === 0) this.vx = this.dashDir * P.RUN * 0.8;
      } else {
        const target = dir * P.RUN;
        const acc = this.onGround ? P.ACC_G : P.ACC_A;
        if (dir) this.vx += clamp(target - this.vx, -acc, acc);
        else this.vx *= this.onGround ? P.FRIC_G : P.FRIC_A;
        if (Math.abs(this.vx) < 0.05) this.vx = 0;

        if (inp.jumpPressed) this.jbuf = P.BUF;
        if (this.onGround) this.coyote = P.COYOTE;
        else if (this.coyote > 0) this.coyote--;

        if (this.jbuf > 0 && this.coyote > 0) {
          this.vy = P.JV;
          this.jbuf = 0; this.coyote = 0;
          this.onGround = false;
          this.squash = 8;
          ev.jump && ev.jump();
        } else if (this.jbuf > 0) {
          this.jbuf--;
        }
        if (!inp.jumpHeld && this.vy < -4) this.vy *= P.CUT;
        this.vy = Math.min(this.vy + P.G, P.MAXFALL);
      }

      // horizontal
      if (this.standOn && this.onGround) this.x += this.standOn.dx;
      this.x += this.vx;
      this.moveX(world);
      // vertical
      this.moveY(world, ev);

      this.x = clamp(this.x, 0, world.pxW - this.w);
      if (this.onGround && this.vx !== 0) this.anim += Math.abs(this.vx) * 0.25;
      for (const t of this.trail) t.t--;
      this.trail = this.trail.filter((t) => t.t > 0);
    }

    moveX(world) {
      const r0 = Math.floor(this.y / T), r1 = Math.floor((this.y + this.h - 1) / T);
      if (this.vx > 0) {
        const c = Math.floor((this.x + this.w - 1) / T);
        for (let r = r0; r <= r1; r++) {
          if (world.isSolid(c, r)) { this.x = c * T - this.w; this.vx = 0; break; }
        }
      } else if (this.vx < 0) {
        const c = Math.floor(this.x / T);
        for (let r = r0; r <= r1; r++) {
          if (world.isSolid(c, r)) { this.x = (c + 1) * T; this.vx = 0; break; }
        }
      }
    }

    moveY(world, ev) {
      const prevB = this.y + this.h;
      this.y += this.vy;
      this.onGround = false;
      this.standOn = null;
      const c0 = Math.floor((this.x + 3) / T), c1 = Math.floor((this.x + this.w - 4) / T);

      if (this.vy >= 0) {
        const R = Math.ceil(prevB / T);
        if (this.y + this.h >= R * T) {
          let hit = false;
          for (let c = c0; c <= c1 && !hit; c++) {
            const t = world.get(c, R);
            if (t === TL.SOLID || t === TL.CRUMBLE || t === TL.ONEWAY) {
              hit = true;
              this.y = R * T - this.h;
              if (t === TL.CRUMBLE) {
                const cr = world.crumbleAt(c, R);
                if (cr) cr.trigger();
              }
            }
          }
          if (!hit) {
            for (const m of world.movers) {
              const over = this.x + this.w > m.x + 4 && this.x < m.x + m.w - 4;
              if (over && prevB <= m.y + 3 && this.y + this.h >= m.y) {
                hit = true;
                this.y = m.y - this.h;
                this.standOn = m;
                break;
              }
            }
          }
          if (hit) {
            if (this.vy > 7 && ev.land) ev.land(this.cx, this.y + this.h);
            this.vy = 0;
            this.onGround = true;
          }
        }
      } else {
        const R = Math.floor(this.y / T);
        for (let c = c0; c <= c1; c++) {
          if (world.isSolid(c, R) && this.y < (R + 1) * T) {
            this.y = (R + 1) * T;
            this.vy = 0;
            break;
          }
        }
      }
    }

    bounce() {
      this.vy = P.SPRING_V;
      this.onGround = false;
      this.squash = 10;
    }

    hurtKnock(fromX) {
      this.vx = (this.cx < fromX ? -1 : 1) * 4;
      this.vy = -7;
      this.inv = P.INV;
      this.dashT = 0;
    }
  }

  // ------------------------------------------------------------ enemies
  class Walker {
    constructor(c, a, b) {
      this.kind = 'walker';
      this.w = 28; this.h = 26;
      this.x = c * T + 6;
      this.y = FLOOR * T - this.h;
      this.min = a * T;
      this.max = (b + 1) * T - this.w;
      this.dir = -1;
      this.alive = true;
      this.t = Math.random() * 100;
    }
    update(world) {
      if (!this.alive) return;
      this.t++;
      const nx = this.x + this.dir * 1.1;
      const footC = this.dir > 0 ? Math.floor((nx + this.w + 1) / T) : Math.floor((nx - 1) / T);
      const ground = world.isSolid(footC, FLOOR);
      const wall = world.isSolid(footC, FLOOR - 1);
      if (!ground || wall || nx < this.min || nx > this.max) this.dir *= -1;
      else this.x = nx;
    }
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Bat {
    constructor(c, r, range) {
      this.kind = 'bat';
      this.w = 30; this.h = 20;
      this.cx = c * T + T / 2;
      this.cy = r * T + T / 2;
      this.range = range * T;
      this.t = Math.random() * 200;
      this.alive = true;
      this.x = this.cx - this.w / 2; this.y = this.cy - this.h / 2;
    }
    update() {
      if (!this.alive) return;
      this.t++;
      this.x = this.cx + Math.sin(this.t * 0.02) * this.range - this.w / 2;
      this.y = this.cy + Math.sin(this.t * 0.07) * 16 - this.h / 2;
    }
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Turret {
    constructor(c) {
      this.kind = 'turret';
      this.w = 30; this.h = 32;
      this.x = c * T + 5;
      this.y = FLOOR * T - this.h;
      this.cd = 80;
      this.alive = true;
    }
    update(p, shots) {
      if (!this.alive) return;
      if (this.cd > 0) this.cd--;
      const sx = this.x + 15, sy = this.y + 10;
      const dx = p.cx - sx, dy = p.cy - sy, d = Math.hypot(dx, dy);
      if (this.cd === 0 && d < 420 && !p.dead) {
        this.cd = 130;
        shots.push(new Shot(sx, sy, (dx / d) * 4, (dy / d) * 4, 'shot'));
      }
    }
    get rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  class Shot {
    constructor(x, y, vx, vy, kind) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.kind = kind; this.r = kind === 'rock' ? 11 : 6;
      this.life = 320; this.alive = true; this.spin = 0;
    }
    update(world) {
      if (!this.alive) return;
      this.spin += 0.3;
      if (this.kind === 'rock') this.vy += 0.25;
      this.x += this.vx; this.y += this.vy;
      this.life--;
      if (this.life <= 0 || this.y > world.pxH + 40 || this.x < -60 || this.x > world.pxW + 60) this.alive = false;
      else if (this.kind !== 'rock' && world.isSolid(Math.floor(this.x / T), Math.floor(this.y / T))) this.alive = false;
    }
    get rect() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
  }

  class Boss {
    constructor(def) {
      this.kind = 'boss';
      this.w = 80; this.h = 100;
      this.minX = def.a * T;
      this.maxX = def.b * T;
      this.x = def.col * T;
      this.y = FLOOR * T - this.h;
      this.hp = def.hp; this.maxHp = def.hp;
      this.dir = -1;
      this.state = 'sleep';
      this.inv = 0; this.cd = 120; this.charge = 0;
      this.alive = true; this.t = 0;
      this.dying = 0;
    }
    activate() { if (this.state === 'sleep') this.state = 'fight'; }
    update(p, shots) {
      if (this.dying > 0) this.dying--;
      if (!this.alive || this.state === 'sleep') return;
      this.t++;
      if (this.inv > 0) this.inv--;
      const phase = 3 - this.hp;                       // gets faster as it loses HP
      if (this.inv > 0 && this.inv > 40) { /* stunned */ }
      else if (this.charge > 0) {
        this.charge--;
        this.x += this.dir * (4.2 + phase * 0.4);
        if (this.charge === 0) this.cd = 110 - phase * 15;
      } else {
        this.x += this.dir * (1.1 + phase * 0.35);
      }
      if (this.x <= this.minX) { this.x = this.minX; this.dir = 1; this.charge = 0; }
      if (this.x >= this.maxX) { this.x = this.maxX; this.dir = -1; this.charge = 0; }

      if (this.charge === 0 && this.inv <= 40 && --this.cd <= 0) {
        if (Math.random() < 0.5) {
          this.dir = p.cx < this.x + this.w / 2 ? -1 : 1;
          this.charge = 50;
        } else {
          const sx = this.x + this.w / 2, sy = this.y + 20;
          const dx = p.cx - sx, dy = p.cy - sy, d = Math.hypot(dx, dy) || 1;
          shots.push(new Shot(sx, sy, (dx / d) * 4.6, (dy / d) * 4.6 - 1.4, 'rock'));
          this.cd = 130 - phase * 20;
        }
      }
    }
    hit() {
      this.hp--;
      this.inv = 80;
      this.charge = 0;
      if (this.hp <= 0) { this.alive = false; this.dying = 70; }
    }
    get rect() { return { x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 6 }; }
  }

  // ------------------------------------------------------------ particles
  class Particles {
    constructor() { this.list = []; }
    burst(x, y, color, n = 10, speed = 3, grav = 0.12, life = 30, size = 3) {
      for (let i = 0; i < n && this.list.length < 500; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 0.7) * speed;
        this.list.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: grav,
          life: life * (0.7 + Math.random() * 0.6), max: life, color,
          size: size * (0.6 + Math.random() * 0.8),
        });
      }
    }
    text(x, y, str, color) {
      this.list.push({ x, y, vx: 0, vy: -0.9, g: 0, life: 50, max: 50, color, size: 0, text: str });
    }
    update() {
      for (const p of this.list) {
        p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
      }
      this.list = this.list.filter((p) => p.life > 0);
    }
  }

  NQ.Player = Player;
  NQ.Walker = Walker;
  NQ.Bat = Bat;
  NQ.Turret = Turret;
  NQ.Shot = Shot;
  NQ.Boss = Boss;
  NQ.Particles = Particles;
  NQ.PHYS = P;
  NQ.clamp = clamp;
})(window.NQ = window.NQ || {});
