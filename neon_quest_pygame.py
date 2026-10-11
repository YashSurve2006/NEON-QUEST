"""
NEON QUEST - a 3-level platformer made with pygame (no external assets needed)

Setup :  pip install pygame
Run   :  python neon_quest.py

Controls
  Move ........ Arrow keys / A D
  Jump ........ SPACE / UP / W   (hold = jump higher)
  Stomp ....... land on enemies' heads
  Pause ....... P or ESC
  Restart lvl . R
  Mute ........ M

Levels
  1. Sunny Meadows  - learn the basics
  2. Frozen Caverns - moving platforms, bats, spikes
  3. Volcano Keep   - lava fireballs + the Stone Golem boss (3 stomps)
"""
import array
import math
import random
import sys

import pygame

W, H, TS, ROWS, FPS = 960, 560, 40, 14, 60
GROUND_ROW = ROWS - 2
LW = W * 2

pygame.mixer.pre_init(22050, -16, 1, 512)
pygame.init()
screen = pygame.display.set_mode((W, H))
pygame.display.set_caption("NEON QUEST")
clock = pygame.time.Clock()
canvas = pygame.Surface((W, H))

FONT = pygame.font.SysFont("segoeui,arial,helvetica", 22, bold=True)
SMALL = pygame.font.SysFont("segoeui,arial,helvetica", 17, bold=True)
MID = pygame.font.SysFont("segoeui,arial,helvetica", 36, bold=True)
BIG = pygame.font.SysFont("segoeui,arial,helvetica", 78, bold=True)


# ----------------------------------------------------------------- helpers
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def text(surf, s, font, color, pos, center=False, shadow=True):
    img = font.render(s, True, color)
    r = img.get_rect(center=pos) if center else img.get_rect(topleft=pos)
    if shadow:
        surf.blit(font.render(s, True, (0, 0, 0)), r.move(2, 2))
    surf.blit(img, r)


def heart(surf, x, y, s, col):
    pygame.draw.circle(surf, col, (x - s // 4, y), s // 3 + 1)
    pygame.draw.circle(surf, col, (x + s // 4, y), s // 3 + 1)
    pygame.draw.polygon(surf, col, [(x - s // 2 + 1, y + 2), (x + s // 2 - 1, y + 2), (x, y + s // 2 + 4)])


def make_sound(f0, f1, dur, vol=0.25):
    if not pygame.mixer.get_init():
        return None
    try:
        sr = 22050
        n = int(sr * dur)
        buf = array.array("h")
        phase = 0.0
        for i in range(n):
            f = f0 + (f1 - f0) * i / n
            phase += 2 * math.pi * f / sr
            v = 1 if math.sin(phase) > 0 else -1
            buf.append(int(v * (1 - i / n) * vol * 32767))
        return pygame.mixer.Sound(buffer=buf.tobytes())
    except Exception:
        return None


SND = {
    "jump": make_sound(280, 620, 0.14),
    "coin": make_sound(900, 1500, 0.10),
    "stomp": make_sound(320, 90, 0.12),
    "hurt": make_sound(240, 50, 0.35),
    "check": make_sound(500, 900, 0.25),
    "win": make_sound(400, 1200, 0.6),
    "boss": make_sound(150, 60, 0.3),
}

# ------------------------------------------------------------------ themes
THEMES = {
    1: dict(name="Sunny Meadows", sky=((70, 150, 255), (190, 230, 255)),
            ground=(121, 85, 52), dark=(92, 62, 38), top=(86, 200, 90), plat=(176, 132, 84),
            liquid=(40, 120, 220),
            layers=[((140, 205, 175), 0.12, 330, 50, None), ((90, 170, 125), 0.28, 380, 60, None),
                    ((52, 135, 90), 0.5, 430, 40, "tree")],
            fx="petal", fxcol=(255, 190, 215)),
    2: dict(name="Frozen Caverns", sky=((8, 16, 46), (40, 72, 124)),
            ground=(70, 90, 135), dark=(48, 64, 100), top=(215, 240, 255), plat=(120, 160, 210),
            liquid=(20, 55, 120),
            layers=[((40, 62, 112), 0.12, 330, 70, None), ((30, 50, 96), 0.28, 390, 70, None),
                    ((22, 38, 78), 0.5, 440, 50, "crystal")],
            fx="snow", fxcol=(235, 245, 255)),
    3: dict(name="Volcano Keep", sky=((38, 5, 16), (210, 72, 26)),
            ground=(74, 50, 55), dark=(48, 32, 38), top=(240, 112, 40), plat=(112, 72, 74),
            liquid=(255, 112, 24),
            layers=[((98, 28, 32), 0.12, 320, 90, None), ((68, 20, 28), 0.28, 380, 90, None),
                    ((40, 12, 20), 0.5, 440, 70, None)],
            fx="ember", fxcol=(255, 175, 60)),
}

SPECS = {
    1: dict(cols=72, gaps=[(16, 19), (32, 35), (48, 51)],
            plat=[(7, 9, 3), (13, 9, 2), (21, 9, 3), (25, 7, 3), (38, 9, 3), (42, 7, 3), (54, 9, 3), (58, 7, 3),
                  (63, 9, 3)],
            coins=[(3, 5, 11), (10, 12, 11), (28, 30, 11), (66, 68, 11)],
            enemies=[("w", 10, 12, 3), ("w", 27, 12, 2), ("w", 40, 12, 3), ("w", 56, 12, 3), ("w", 22, 9, 1),
                     ("w", 64, 9, 1), ("b", 29, 8, 3)],
            spikes=[(30, 12), (45, 12), (61, 12)], movers=[], check=36, flag=68),
    2: dict(cols=76, gaps=[(12, 16), (26, 31), (42, 46), (58, 63)],
            plat=[(5, 9, 3), (19, 9, 3), (22, 7, 3), (35, 9, 3), (38, 7, 2), (50, 9, 3), (53, 7, 3), (66, 9, 3),
                  (69, 7, 3)],
            coins=[(3, 4, 11), (32, 34, 11), (47, 49, 11), (72, 74, 11)],
            enemies=[("w", 8, 12, 3), ("w", 20, 12, 2), ("w", 34, 12, 3), ("w", 48, 12, 2), ("w", 65, 12, 3),
                     ("b", 18, 8, 4), ("b", 36, 8, 4), ("b", 52, 8, 3), ("b", 68, 8, 4)],
            spikes=[(10, 12), (23, 12), (37, 12), (52, 12), (67, 12), (70, 12)],
            movers=[(12, 14, 1.4), (26, 29, 1.5), (42, 44, 1.6), (58, 61, 1.7)], check=36, flag=72),
    3: dict(cols=80, gaps=[(10, 14), (24, 29), (38, 43), (52, 57)],
            plat=[(4, 9, 3), (17, 9, 3), (20, 7, 3), (32, 9, 3), (45, 9, 3), (48, 7, 3), (59, 9, 2)],
            coins=[(2, 4, 11), (30, 31, 11), (62, 66, 11)],
            enemies=[("w", 6, 12, 3), ("w", 18, 12, 2), ("w", 33, 12, 3), ("w", 47, 12, 2), ("w", 61, 12, 1),
                     ("b", 16, 8, 4), ("b", 31, 8, 4), ("b", 46, 7, 4), ("b", 58, 8, 3)],
            spikes=[(8, 12), (19, 12), (34, 12), (36, 12), (49, 12)],
            movers=[(10, 12, 1.8), (24, 27, 1.9), (38, 41, 2.0), (52, 55, 2.1)],
            boss=(70, 64, 75), fireballs=True, check=30, flag=77),
}


# --------------------------------------------------------------- backgrounds
def make_layer(color, base, amp, seed, jag, decor):
    rnd = random.Random(seed)
    s = pygame.Surface((LW, H), pygame.SRCALPHA)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    pts = []
    for x in range(0, LW + 1, 20):
        a = x / LW * 2 * math.pi
        y = base + math.sin(a * 2 + ph[0]) * amp * 0.5 + math.sin(a * 5 + ph[1]) * amp * 0.3 \
            + math.sin(a * 9 + ph[2]) * amp * 0.15
        if jag and 0 < x < LW:
            y += rnd.uniform(-amp * 0.3, amp * 0.3)
        pts.append((x, y))
    pts[-1] = (LW, pts[0][1])
    pygame.draw.polygon(s, color, pts + [(LW, H), (0, H)])
    if decor:
        dark = tuple(max(0, c - 18) for c in color)
        for i in range(0, len(pts) - 1, 2):
            x, y = pts[i]
            if decor == "tree":
                hh = rnd.randint(34, 56)
                pygame.draw.polygon(s, dark, [(x - 12, y + 2), (x + 12, y + 2), (x, y - hh)])
                pygame.draw.polygon(s, dark, [(x - 9, y - hh // 2), (x + 9, y - hh // 2), (x, y - hh - 12)])
            else:
                hh = rnd.randint(22, 48)
                pygame.draw.polygon(s, (110, 190, 240), [(x - 6, y + 2), (x + 6, y + 2), (x, y - hh)])
                pygame.draw.polygon(s, (190, 235, 255), [(x - 1, y + 2), (x + 6, y + 2), (x, y - hh)])
    return s


def build_bg(n):
    th = THEMES[n]
    rnd = random.Random(n * 7)
    sky = pygame.Surface((W, H))
    a, b = th["sky"]
    for y in range(H):
        pygame.draw.line(sky, lerp(a, b, y / H), (0, y), (W, y))
    if n == 1:
        for r, c in ((95, (255, 245, 190)), (70, (255, 240, 150)), (48, (255, 235, 110))):
            pygame.draw.circle(sky, c, (790, 110), r)
    else:
        for _ in range(110):
            c = rnd.randint(150, 255)
            pygame.draw.circle(sky, (c, c, c), (rnd.randint(0, W), rnd.randint(0, H // 2)), rnd.choice((1, 1, 2)))
        col = (225, 235, 255) if n == 2 else (255, 120, 70)
        pygame.draw.circle(sky, col, (780, 120), 46)
        pygame.draw.circle(sky, lerp(col, a, 0.5), (794, 108), 38)
        pygame.draw.circle(sky, col, (780, 120), 46, 3)
    layers = []
    for i, (c, f, base, amp, decor) in enumerate(th["layers"]):
        layers.append((make_layer(c, base, amp, n * 10 + i, n == 3, decor), f))
    clouds = None
    if n == 1:
        clouds = pygame.Surface((LW, H), pygame.SRCALPHA)
        for _ in range(11):
            cx, cy = rnd.randint(0, LW), rnd.randint(40, 190)
            for _ in range(5):
                pygame.draw.circle(clouds, (255, 255, 255, 215),
                                   (cx + rnd.randint(-40, 40), cy + rnd.randint(-10, 10)), rnd.randint(18, 34))
    ceil = None
    if n >= 2:
        ceil = pygame.Surface((LW, H), pygame.SRCALPHA)
        col = (24, 36, 74) if n == 2 else (52, 16, 22)
        x = 0
        while x < LW:
            wdt, hh = rnd.randint(30, 70), rnd.randint(30, 120)
            pygame.draw.polygon(ceil, col, [(x, 0), (x + wdt, 0), (x + wdt // 2, hh)])
            x += wdt - rnd.randint(0, 12)
    return dict(sky=sky, layers=layers, clouds=clouds, ceil=ceil)


def draw_bg(surf, bg, camx, t):
    surf.blit(bg["sky"], (0, 0))
    if bg["clouds"]:
        x = -int((camx * 0.1 + t * 0.2) % LW)
        surf.blit(bg["clouds"], (x, 0))
        surf.blit(bg["clouds"], (x + LW, 0))
    for layer, f in bg["layers"]:
        x = -int((camx * f) % LW)
        surf.blit(layer, (x, 0))
        surf.blit(layer, (x + LW, 0))
    if bg["ceil"]:
        x = -int((camx * 0.6) % LW)
        surf.blit(bg["ceil"], (x, 0))
        surf.blit(bg["ceil"], (x + LW, 0))


def make_tiles(t):
    rnd = random.Random(3)
    gf = pygame.Surface((TS, TS))
    gf.fill(t["ground"])
    for _ in range(8):
        pygame.draw.circle(gf, t["dark"], (rnd.randint(3, TS - 3), rnd.randint(4, TS - 3)), rnd.randint(2, 4))
    pygame.draw.rect(gf, t["dark"], (0, 0, TS, TS), 1)
    gt = gf.copy()
    pygame.draw.rect(gt, t["top"], (0, 0, TS, 10))
    pygame.draw.rect(gt, tuple(max(0, c - 45) for c in t["top"]), (0, 8, TS, 3))
    for x in range(3, TS, 8):
        pygame.draw.line(gt, tuple(min(255, c + 25) for c in t["top"]), (x, 0), (x + 2, -0), 2)
    p = pygame.Surface((TS, TS))
    p.fill(t["plat"])
    pygame.draw.rect(p, tuple(min(255, c + 40) for c in t["plat"]), (0, 0, TS, 6))
    pygame.draw.rect(p, tuple(max(0, c - 50) for c in t["plat"]), (0, TS - 6, TS, 6))
    pygame.draw.rect(p, tuple(max(0, c - 70) for c in t["plat"]), (0, 0, TS, TS), 2)
    for cx, cy in ((7, 17), (TS - 8, 17)):
        pygame.draw.circle(p, tuple(max(0, c - 70) for c in t["plat"]), (cx, cy), 3)
    return dict(gt=gt, gf=gf, p=p)


# ---------------------------------------------------------------- entities
class Mover:
    def __init__(self, c1, c2, speed):
        self.x0, self.x1 = c1 * TS, c2 * TS
        self.rect = pygame.Rect(self.x0, GROUND_ROW * TS, 2 * TS, 16)
        self.fx, self.dir, self.speed, self.dx = float(self.x0), 1, speed, 0

    def update(self):
        old = self.rect.x
        self.fx += self.dir * self.speed
        if self.fx >= self.x1:
            self.fx, self.dir = self.x1, -1
        if self.fx <= self.x0:
            self.fx, self.dir = self.x0, 1
        self.rect.x = round(self.fx)
        self.dx = self.rect.x - old

    def draw(self, surf, camx, th):
        r = self.rect.move(-camx, 0)
        pygame.draw.rect(surf, th["plat"], r, border_radius=6)
        pygame.draw.rect(surf, tuple(min(255, c + 50) for c in th["plat"]), (r.x, r.y, r.w, 5), border_radius=4)
        pygame.draw.rect(surf, (20, 20, 30), r, 2, border_radius=6)
        for x in (r.x + 10, r.right - 10):
            pygame.draw.circle(surf, (255, 220, 90), (x, r.y + 9), 3)


class Walker:
    stompable = True
    is_boss = False

    def __init__(self, c, row, rng):
        self.x0 = c * TS + TS // 2
        self.x = float(self.x0)
        self.y = row * TS
        self.rng = rng * TS
        self.dir = 1
        self.rect = pygame.Rect(0, 0, 32, 28)
        self.rect.midbottom = (int(self.x), self.y)
        self.alive = True

    def update(self, g):
        self.x += self.dir * 1.3
        if abs(self.x - self.x0) > self.rng:
            self.dir *= -1
        self.rect.midbottom = (int(self.x), self.y)

    def draw(self, surf, camx, t):
        r = self.rect.move(-camx, 0)
        col = (170, 70, 210)
        pygame.draw.ellipse(surf, col, (r.x - 2, r.y, r.w + 4, r.h))
        pygame.draw.ellipse(surf, (110, 40, 150), (r.x - 2, r.y, r.w + 4, r.h), 2)
        f = math.sin(t * 0.3 + self.x0) * 3
        pygame.draw.ellipse(surf, (80, 30, 110), (r.x + 1, r.bottom - 6 + f, 12, 8))
        pygame.draw.ellipse(surf, (80, 30, 110), (r.right - 13, r.bottom - 6 - f, 12, 8))
        for ex in (r.x + 9, r.right - 9):
            pygame.draw.circle(surf, (255, 255, 255), (ex, r.y + 11), 6)
            pygame.draw.circle(surf, (0, 0, 0), (ex + self.dir * 2, r.y + 12), 3)
        pygame.draw.line(surf, (40, 10, 60), (r.x + 3, r.y + 3), (r.x + 14, r.y + 7), 3)
        pygame.draw.line(surf, (40, 10, 60), (r.right - 3, r.y + 3), (r.right - 14, r.y + 7), 3)


class Bat:
    stompable = True
    is_boss = False

    def __init__(self, c, row, rng):
        self.x0 = c * TS + TS // 2
        self.y0 = row * TS
        self.rng = rng * TS
        self.t = random.randint(0, 300)
        self.rect = pygame.Rect(0, 0, 30, 20)
        self.alive = True
        self.face = 1
        self.update(None)

    def update(self, g):
        self.t += 1
        x = self.x0 + math.sin(self.t * 0.025) * self.rng
        y = self.y0 + math.sin(self.t * 0.08) * 28
        self.face = 1 if math.cos(self.t * 0.025) > 0 else -1
        self.rect.center = (int(x), int(y))

    def draw(self, surf, camx, t):
        r = self.rect.move(-camx, 0)
        cx, cy = r.center
        fl = math.sin(self.t * 0.4) * 11
        col = (62, 48, 88)
        pygame.draw.polygon(surf, col, [(cx - 4, cy), (cx - 22, cy - 8 + fl), (cx - 27, cy + 5 + fl), (cx - 14, cy + 3)])
        pygame.draw.polygon(surf, col, [(cx + 4, cy), (cx + 22, cy - 8 + fl), (cx + 27, cy + 5 + fl), (cx + 14, cy + 3)])
        pygame.draw.ellipse(surf, (45, 34, 70), (cx - 10, cy - 9, 20, 20))
        pygame.draw.polygon(surf, (45, 34, 70), [(cx - 9, cy - 6), (cx - 5, cy - 15), (cx - 2, cy - 7)])
        pygame.draw.polygon(surf, (45, 34, 70), [(cx + 9, cy - 6), (cx + 5, cy - 15), (cx + 2, cy - 7)])
        pygame.draw.circle(surf, (255, 70, 70), (cx - 4, cy - 2), 3)
        pygame.draw.circle(surf, (255, 70, 70), (cx + 4, cy - 2), 3)


class Fireball:
    stompable = False
    is_boss = False

    def __init__(self, x):
        self.x = x
        self.y = H + 50
        self.vy = 0
        self.timer = random.randint(30, 160)
        self.active = False
        self.alive = True
        self.rect = pygame.Rect(0, 0, 20, 20)
        self.rect.center = (int(x), -999)

    def update(self, g):
        if not self.active:
            self.timer -= 1
            if self.timer <= 0:
                self.active, self.y, self.vy = True, ROWS * TS - 30, -random.uniform(17, 21)
            self.rect.center = (int(self.x), -999)
            return
        self.vy += 0.5
        self.y += self.vy
        g.parts.append([self.x + random.uniform(-4, 4), self.y, 0, 0.6, 18, 18, (255, random.randint(80, 190), 30), 4, 0])
        if self.y > H + 40 and self.vy > 0:
            self.active, self.timer = False, random.randint(50, 140)
        self.rect.center = (int(self.x), int(self.y))

    def draw(self, surf, camx, t):
        if not self.active:
            return
        x, y = int(self.x - camx), int(self.y)
        pygame.draw.circle(surf, (255, 90, 20), (x, y), 13)
        pygame.draw.circle(surf, (255, 190, 50), (x, y), 8)
        pygame.draw.circle(surf, (255, 250, 200), (x, y), 4)


class Boss:
    stompable = True
    is_boss = True

    def __init__(self, c, l, r):
        self.rect = pygame.Rect(0, 0, 84, 96)
        self.x = float(c * TS)
        self.rect.midbottom = (int(self.x), GROUND_ROW * TS)
        self.l, self.r = l * TS, r * TS
        self.dir, self.hp, self.inv, self.alive, self.t = -1, 3, 0, True, 0

    def update(self, g):
        self.t += 1
        if self.inv > 0:
            self.inv -= 1
        if g.player.rect.centerx < self.l - 350:
            return
        speed = 1.5 + (3 - self.hp) * 1.0
        if self.inv > 40:
            speed = 0
        self.x += self.dir * speed
        if self.x < self.l:
            self.x, self.dir = self.l, 1
        if self.x > self.r:
            self.x, self.dir = self.r, -1
        self.rect.midbottom = (int(self.x), GROUND_ROW * TS)

    def draw(self, surf, camx, t):
        if self.inv > 0 and (self.inv // 4) % 2 == 0:
            return
        r = self.rect.move(-camx, 0)
        sw = math.sin(self.t * 0.15) * 6
        pygame.draw.rect(surf, (88, 80, 92), (r.x - 14, r.y + 28 + sw, 20, 48), border_radius=8)
        pygame.draw.rect(surf, (88, 80, 92), (r.right - 6, r.y + 28 - sw, 20, 48), border_radius=8)
        pygame.draw.rect(surf, (112, 102, 116), r, border_radius=14)
        pygame.draw.rect(surf, (60, 54, 66), r, 3, border_radius=14)
        pygame.draw.line(surf, (70, 62, 76), (r.x + 20, r.y + 40), (r.x + 38, r.y + 62), 3)
        pygame.draw.line(surf, (70, 62, 76), (r.right - 22, r.y + 50), (r.right - 40, r.y + 74), 3)
        glow = (255, 60 + (3 - self.hp) * 20, 30)
        for ex in (r.x + 26, r.right - 26):
            pygame.draw.circle(surf, glow, (ex, r.y + 28), 9)
            pygame.draw.circle(surf, (255, 230, 120), (ex, r.y + 28), 4)
        pygame.draw.rect(surf, (50, 44, 56), (r.x + 22, r.y + 52, r.w - 44, 8), border_radius=3)
        pygame.draw.rect(surf, (92, 84, 98), (r.x - 2, r.bottom - 14, 32, 14), border_radius=4)
        pygame.draw.rect(surf, (92, 84, 98), (r.right - 30, r.bottom - 14, 32, 14), border_radius=4)
        for i in range(3):
            heart(surf, r.centerx - 28 + i * 28, r.y - 18, 20, (255, 70, 90) if i < self.hp else (60, 40, 50))


# ------------------------------------------------------------------- level
class Level:
    def __init__(self, n):
        sp = SPECS[n]
        self.n, self.spec, self.theme, self.cols = n, sp, THEMES[n], sp["cols"]
        self.tiles = {}
        gaps = set()
        for a, b in sp["gaps"]:
            gaps.update(range(a, b))
        for c in range(self.cols):
            if c not in gaps:
                self.tiles[(c, GROUND_ROW)] = "g"
                self.tiles[(c, GROUND_ROW + 1)] = "g"
        for c, r, l in sp["plat"]:
            for i in range(l):
                self.tiles[(c + i, r)] = "p"
        self.coins = []
        for c, r, l in sp["plat"]:
            for i in range(l):
                self.coins.append([(c + i) * TS + TS // 2, r * TS - 24, True])
        for c1, c2, row in sp.get("coins", []):
            for c in range(c1, c2 + 1):
                self.coins.append([c * TS + TS // 2, row * TS + TS // 2, True])
        for a, b in sp["gaps"]:
            k = b - a + 2
            for i in range(k):
                self.coins.append([(a - 1 + i) * TS + TS // 2,
                                   int((GROUND_ROW - 2.0 - 2.2 * math.sin(math.pi * i / (k - 1))) * TS), True])
        self.enemies = []
        for kind, c, row, rng in sp["enemies"]:
            self.enemies.append(Walker(c, row, rng) if kind == "w" else Bat(c, row, rng))
        if sp.get("fireballs"):
            for a, b in sp["gaps"]:
                self.enemies.append(Fireball((a + b) / 2 * TS))
        self.boss = None
        if "boss" in sp:
            self.boss = Boss(*sp["boss"])
            self.enemies.append(self.boss)
        self.locked = self.boss is not None
        self.spikes = [pygame.Rect(c * TS + 3, r * TS - 18, TS - 6, 18) for c, r in sp["spikes"]]
        self.movers = [Mover(*m) for m in sp["movers"]]
        self.flag = pygame.Rect(sp["flag"] * TS - 10, GROUND_ROW * TS - 140, 34, 140)
        self.start = (2 * TS, GROUND_ROW * TS - 38)
        self.check_x = sp["check"] * TS
        self.check_pos = (sp["check"] * TS, GROUND_ROW * TS - 38)
        self.tile_surf = make_tiles(self.theme)

    def solids_near(self, rect):
        out = []
        for c in range(rect.left // TS - 1, rect.right // TS + 2):
            for r in range(rect.top // TS - 1, rect.bottom // TS + 2):
                if (c, r) in self.tiles:
                    out.append(pygame.Rect(c * TS, r * TS, TS, TS))
        out += [m.rect for m in self.movers]
        return out

    def draw_tiles(self, surf, camx):
        c0, c1 = camx // TS, (camx + W) // TS + 1
        ts = self.tile_surf
        for c in range(c0, c1 + 1):
            for r in range(ROWS):
                k = self.tiles.get((c, r))
                if not k:
                    continue
                if k == "p":
                    img = ts["p"]
                else:
                    img = ts["gf"] if (c, r - 1) in self.tiles else ts["gt"]
                surf.blit(img, (c * TS - camx, r * TS))


# ------------------------------------------------------------------ player
class Player:
    def __init__(self, pos):
        self.rect = pygame.Rect(pos[0], pos[1], 28, 38)
        self.x, self.y = float(pos[0]), float(pos[1])
        self.vx = self.vy = 0.0
        self.on_ground = False
        self.face = 1
        self.coyote = self.buffer = self.inv = 0
        self.anim = 0.0

    def respawn(self, pos):
        self.x, self.y = float(pos[0]), float(pos[1])
        self.rect.topleft = (int(self.x), int(self.y))
        self.vx = self.vy = 0
        self.inv = 120
        self.buffer = 0

    def update(self, keys, g):
        L = g.level
        left = keys[pygame.K_LEFT] or keys[pygame.K_a]
        right = keys[pygame.K_RIGHT] or keys[pygame.K_d]
        held = keys[pygame.K_SPACE] or keys[pygame.K_UP] or keys[pygame.K_w]
        ax = int(bool(right)) - int(bool(left))
        if ax:
            self.vx += ax * 0.8
            self.face = ax
        else:
            self.vx *= 0.8
            if abs(self.vx) < 0.1:
                self.vx = 0
        self.vx = max(-5.5, min(5.5, self.vx))
        if self.inv > 0:
            self.inv -= 1
        # carried by moving platforms
        if self.on_ground:
            for m in L.movers:
                if self.rect.bottom == m.rect.top and self.rect.right > m.rect.left and self.rect.left < m.rect.right:
                    self.x += m.dx
        was_ground, prev_vy = self.on_ground, self.vy
        self.coyote = 6 if self.on_ground else self.coyote - 1
        if self.buffer > 0:
            self.buffer -= 1
        if self.buffer > 0 and self.coyote > 0:
            self.vy, self.buffer, self.coyote = -15.0, 0, 0
            g.sfx("jump")
            g.burst(self.rect.centerx, self.rect.bottom, (230, 230, 230), 6, 2, 0.1)
        if not held and self.vy < -5:
            self.vy *= 0.88
        self.vy = min(self.vy + 0.75, 16)
        self.on_ground = False
        # horizontal
        self.x = max(0, min(self.x + self.vx, L.cols * TS - self.rect.w))
        self.rect.x = int(self.x)
        for r in L.solids_near(self.rect):
            if self.rect.colliderect(r):
                if self.vx > 0 or (self.vx == 0 and self.rect.centerx < r.centerx):
                    self.rect.right = r.left
                else:
                    self.rect.left = r.right
                self.x, self.vx = float(self.rect.x), 0
        # vertical
        self.y += self.vy
        self.rect.y = int(self.y)
        for r in L.solids_near(self.rect):
            if self.rect.colliderect(r):
                if self.vy > 0:
                    self.rect.bottom = r.top
                    self.on_ground = True
                else:
                    self.rect.top = r.bottom
                self.y, self.vy = float(self.rect.y), 0
        if self.on_ground and not was_ground and prev_vy > 7:
            g.burst(self.rect.centerx, self.rect.bottom, (220, 220, 220), 7, 2, 0.1)
        if self.on_ground:
            self.anim += abs(self.vx) * 0.18

    def draw(self, surf, camx, t):
        if self.inv > 0 and (self.inv // 4) % 2 == 0:
            return
        r = self.rect.move(-camx, 0)
        f = self.face
        cx = r.centerx
        for i in range(1, 5):
            sx = cx - f * (8 + i * 7)
            sy = r.y + 14 + math.sin(t * 0.3 + i) * 3 + (0 if self.on_ground else -self.vy * 0.4 * i * 0.3)
            pygame.draw.circle(surf, (255, 90, 70), (int(sx), int(sy)), 5 - i // 2)
        lift = math.sin(self.anim) * 4 if (self.on_ground and abs(self.vx) > 0.5) else 0
        air = 0 if self.on_ground else -2
        pygame.draw.rect(surf, (35, 95, 195), (r.x + 4, r.y + 30 + max(0, lift) + air, 8, 8 - max(0, lift)),
                         border_radius=3)
        pygame.draw.rect(surf, (35, 95, 195), (r.x + 16, r.y + 30 + max(0, -lift) + air, 8, 8 - max(0, -lift)),
                         border_radius=3)
        pygame.draw.rect(surf, (70, 170, 255), (r.x, r.y, 28, 32), border_radius=10)
        pygame.draw.rect(surf, (30, 80, 170), (r.x, r.y, 28, 32), 2, border_radius=10)
        pygame.draw.rect(surf, (140, 210, 255), (r.x + 5, r.y + 4, 10, 5), border_radius=3)
        for ex in (cx - 5 + f * 3, cx + 6 + f * 3):
            pygame.draw.circle(surf, (255, 255, 255), (ex, r.y + 13), 5)
            pygame.draw.circle(surf, (20, 20, 40), (ex + f * 2, r.y + 14), 2)
        pygame.draw.arc(surf, (20, 40, 100), (cx - 5 + f * 3, r.y + 17, 12, 8), math.pi, 2 * math.pi, 2)


# -------------------------------------------------------------------- game
class Game:
    def __init__(self):
        self.state = "menu"
        self.t = 0
        self.mute = False
        self.lives, self.score, self.level_no = 5, 0, 1
        self.level_start_score = 0
        self.parts = []
        self.shake = 0
        self.msg = ("", 0)
        self.bgs = {n: build_bg(n) for n in THEMES}
        self.fx = []
        self.level = None
        self.player = None

    # ---- utilities
    def sfx(self, name):
        if not self.mute and SND.get(name):
            SND[name].play()

    def burst(self, x, y, col, n=10, speed=3.0, grav=0.15):
        for _ in range(n):
            a = random.uniform(0, 2 * math.pi)
            s = random.uniform(0.3, 1) * speed
            life = random.randint(18, 34)
            self.parts.append([x, y, math.cos(a) * s, math.sin(a) * s - 1, life, life, col, random.randint(2, 4), grav])

    def start_level(self, n):
        self.level_no = n
        self.level = Level(n)
        self.bg = self.bgs[n]
        self.player = Player(self.level.start)
        self.cam = 0.0
        self.coins_got = 0
        self.time = 0.0
        self.intro = 160
        self.check_on = False
        self.parts = []
        self.msg = ("", 0)
        self.level_start_score = self.score
        self.state = "play"
        fx = self.level.theme["fx"]
        self.fx = [[random.uniform(0, W), random.uniform(0, H), random.uniform(0.6, 1.6), random.randint(2, 4),
                    random.uniform(0, 6.28)] for _ in range(60 if fx != "snow" else 90)]

    def new_game(self):
        self.lives, self.score = 5, 0
        self.start_level(1)

    def hurt(self, splash=None):
        p = self.player
        if p.inv > 0 and splash is None:
            return
        self.lives -= 1
        self.sfx("hurt")
        self.shake = 14
        self.burst(p.rect.centerx, p.rect.centery, splash or (255, 90, 90), 22, 4)
        if self.lives <= 0:
            self.state = "gameover"
            return
        p.respawn(self.level.check_pos if self.check_on else self.level.start)

    # ---- events
    def handle(self, e):
        if e.type == pygame.QUIT:
            pygame.quit()
            sys.exit()
        if e.type != pygame.KEYDOWN:
            return
        k = e.key
        if k == pygame.K_m:
            self.mute = not self.mute
        go = k in (pygame.K_RETURN, pygame.K_SPACE)
        if self.state == "menu":
            if go:
                self.new_game()
            elif k == pygame.K_ESCAPE:
                pygame.quit()
                sys.exit()
        elif self.state == "play":
            if k in (pygame.K_SPACE, pygame.K_UP, pygame.K_w):
                self.player.buffer = 8
            elif k in (pygame.K_p, pygame.K_ESCAPE):
                self.state = "paused"
            elif k == pygame.K_r:
                self.score = self.level_start_score
                self.start_level(self.level_no)
        elif self.state == "paused":
            if k in (pygame.K_p, pygame.K_ESCAPE):
                self.state = "play"
            elif k == pygame.K_q:
                self.state = "menu"
        elif self.state == "complete":
            if go:
                if self.level_no < 3:
                    self.start_level(self.level_no + 1)
                else:
                    self.state = "win"
        elif self.state == "gameover":
            if go:
                self.lives, self.score = 5, self.level_start_score
                self.start_level(self.level_no)
            elif k == pygame.K_ESCAPE:
                self.state = "menu"
        elif self.state == "win":
            if go or k == pygame.K_ESCAPE:
                self.state = "menu"

    # ---- update
    def update(self, keys):
        self.t += 1
        if self.shake > 0:
            self.shake -= 1
        for p in self.parts:
            p[0] += p[2]
            p[1] += p[3]
            p[3] += p[8]
            p[4] -= 1
        self.parts = [p for p in self.parts if p[4] > 0]
        if self.state == "play":
            self.update_play(keys)

    def update_play(self, keys):
        L, p = self.level, self.player
        self.time += 1 / 60
        if self.intro > 0:
            self.intro -= 1
        if self.msg[1] > 0:
            self.msg = (self.msg[0], self.msg[1] - 1)
        for m in L.movers:
            m.update()
        p.update(keys, self)
        for e in L.enemies:
            if e.alive:
                e.update(self)
        # coins
        for c in L.coins:
            if c[2] and abs(c[0] - p.rect.centerx) < 24 and abs(c[1] - p.rect.centery) < 28:
                c[2] = False
                self.coins_got += 1
                self.score += 10
                self.sfx("coin")
                self.burst(c[0], c[1], (255, 220, 80), 6, 2.5, 0.05)
                if self.coins_got % 30 == 0:
                    self.lives += 1
                    self.msg = ("EXTRA LIFE!", 120)
        # enemies
        for e in L.enemies:
            if not e.alive or not p.rect.colliderect(e.rect):
                continue
            if e.is_boss and e.inv > 0:
                continue
            if e.stompable and p.vy > 1 and p.rect.bottom - e.rect.top < 26:
                self.stomp(e)
            else:
                self.hurt()
                break
        for s in L.spikes:
            if p.rect.colliderect(s):
                self.hurt()
                break
        if self.state != "play":
            return
        if p.rect.top > ROWS * TS - 30:
            self.hurt(L.theme["liquid"])
            if self.state != "play":
                return
        if not self.check_on and p.rect.centerx > L.check_x:
            self.check_on = True
            self.sfx("check")
            self.msg = ("CHECKPOINT!", 90)
            self.burst(L.check_x + 8, GROUND_ROW * TS - 60, (90, 255, 240), 18, 3, 0.05)
        if p.rect.colliderect(L.flag):
            if L.locked:
                if self.msg[1] <= 0:
                    self.msg = ("The gate is locked - defeat the Stone Golem!", 120)
            else:
                bonus = max(0, int((120 - self.time) * 5))
                self.bonus = bonus
                self.score += bonus + 200
                self.sfx("win")
                self.burst(L.flag.centerx, L.flag.y, (255, 230, 90), 40, 5, 0.1)
                self.state = "complete"
        target = p.rect.centerx - W // 2 + p.face * 60
        self.cam += (target - self.cam) * 0.1
        self.cam = max(0, min(self.cam, L.cols * TS - W))
        self.update_fx()

    def stomp(self, e):
        p = self.player
        p.vy = -12
        self.sfx("stomp")
        self.burst(e.rect.centerx, e.rect.top, (255, 255, 255), 10, 3)
        if e.is_boss:
            e.hp -= 1
            e.inv = 90
            self.shake = 12
            self.sfx("boss")
            if e.hp <= 0:
                e.alive = False
                self.level.locked = False
                self.score += 1000
                self.burst(e.rect.centerx, e.rect.centery, (255, 170, 60), 70, 6, 0.12)
                self.msg = ("GOLEM DEFEATED! The gate is open!", 200)
        else:
            e.alive = False
            self.score += 100
            self.burst(e.rect.centerx, e.rect.centery, (255, 200, 90), 14, 3.5)

    def update_fx(self):
        kind = self.level.theme["fx"]
        for f in self.fx:
            if kind == "ember":
                f[1] -= f[2]
                f[0] += math.sin(self.t * 0.03 + f[4]) * 0.6
                if f[1] < -10:
                    f[0], f[1] = random.uniform(0, W), H + 10
            else:
                f[1] += f[2] * (1.4 if kind == "snow" else 0.8)
                f[0] += math.sin(self.t * 0.03 + f[4]) * (0.5 if kind == "snow" else 1.0)
                if f[1] > H + 10:
                    f[0], f[1] = random.uniform(0, W), -10

    # ---- drawing
    def draw_world(self):
        L, th, p = self.level, self.level.theme, self.player
        camx = int(self.cam)
        draw_bg(canvas, self.bg, camx, self.t)
        # liquid
        base = ROWS * TS - 42
        pts = [(x, base + math.sin((x + camx) * 0.03 + self.t * 0.06) * 5) for x in range(0, W + 21, 20)]
        pygame.draw.polygon(canvas, th["liquid"], pts + [(W, H), (0, H)])
        pygame.draw.lines(canvas, lerp(th["liquid"], (255, 255, 255), 0.5), False, pts, 3)
        L.draw_tiles(canvas, camx)
        # checkpoint
        cx = L.check_x - camx + 8
        top = GROUND_ROW * TS - 80
        pygame.draw.rect(canvas, (200, 200, 210), (cx, top, 5, 80))
        col = (90, 255, 240) if self.check_on else (120, 120, 130)
        wv = math.sin(self.t * 0.15) * 4
        pygame.draw.polygon(canvas, col, [(cx + 5, top), (cx + 34, top + 10 + wv), (cx + 5, top + 22)])
        # flag
        fx = L.flag.x + 10 - camx
        ft = L.flag.y
        pygame.draw.rect(canvas, (230, 230, 240), (fx, ft, 6, L.flag.h))
        pygame.draw.circle(canvas, (255, 215, 70), (fx + 3, ft - 4), 7)
        col = (110, 110, 120) if L.locked else (80, 230, 120)
        wv = math.sin(self.t * 0.12) * 5
        pygame.draw.polygon(canvas, col, [(fx + 6, ft + 4), (fx + 46, ft + 16 + wv), (fx + 6, ft + 34)])
        if L.locked:
            pygame.draw.rect(canvas, (210, 170, 50), (fx - 6, ft + 80, 18, 14), border_radius=3)
            pygame.draw.arc(canvas, (210, 170, 50), (fx - 3, ft + 68, 12, 18), 0, math.pi, 3)
        # spikes
        for s in L.spikes:
            r = s.move(-camx, 0)
            for i in range(3):
                x = r.x + i * (r.w // 3)
                pygame.draw.polygon(canvas, (205, 210, 225), [(x, r.bottom), (x + r.w // 3, r.bottom), (x + r.w // 6, r.y)])
                pygame.draw.polygon(canvas, (110, 115, 135), [(x, r.bottom), (x + r.w // 3, r.bottom), (x + r.w // 6, r.y)], 2)
        # coins
        for c in L.coins:
            if c[2] and -20 < c[0] - camx < W + 20:
                w = abs(math.cos(self.t * 0.08 + c[0] * 0.05)) * 9 + 2
                y = c[1] + math.sin(self.t * 0.07 + c[0]) * 3
                pygame.draw.ellipse(canvas, (255, 200, 40), (c[0] - camx - w, y - 10, w * 2, 20))
                pygame.draw.ellipse(canvas, (255, 240, 130), (c[0] - camx - w * 0.5, y - 7, w, 14))
                pygame.draw.ellipse(canvas, (180, 120, 10), (c[0] - camx - w, y - 10, w * 2, 20), 2)
        for m in L.movers:
            m.draw(canvas, camx, th)
        for e in L.enemies:
            if e.alive and -150 < e.rect.centerx - camx < W + 150:
                e.draw(canvas, camx, self.t)
        p.draw(canvas, camx, self.t)
        for q in self.parts:
            a = q[4] / q[5]
            pygame.draw.circle(canvas, q[6], (int(q[0] - camx), int(q[1])), max(1, int(q[7] * a)))
        # ambient
        kind = th["fx"]
        for f in self.fx:
            if kind == "petal":
                pygame.draw.ellipse(canvas, th["fxcol"], (f[0], f[1], f[3] * 3, f[3] * 2))
            elif kind == "snow":
                pygame.draw.circle(canvas, th["fxcol"], (int(f[0]), int(f[1])), f[3] - 1)
            else:
                c = lerp((255, 80, 20), (255, 220, 100), (math.sin(self.t * 0.2 + f[4]) + 1) / 2)
                pygame.draw.circle(canvas, c, (int(f[0]), int(f[1])), f[3] - 1)
        if kind == "ember":
            glow = pygame.Surface((W, 90), pygame.SRCALPHA)
            for i in range(90):
                pygame.draw.line(glow, (255, 90, 20, int(70 * i / 90)), (0, i), (W, i))
            canvas.blit(glow, (0, H - 90))
        self.draw_hud()

    def draw_hud(self):
        L = self.level
        panel = pygame.Surface((W, 54), pygame.SRCALPHA)
        panel.fill((0, 0, 0, 120))
        canvas.blit(panel, (0, 0))
        if self.lives <= 8:
            for i in range(self.lives):
                heart(canvas, 28 + i * 30, 26, 24, (255, 70, 95))
        else:
            heart(canvas, 28, 26, 24, (255, 70, 95))
            text(canvas, f"x {self.lives}", FONT, (255, 255, 255), (48, 14))
        total = len(L.coins)
        pygame.draw.circle(canvas, (255, 200, 40), (300, 27), 11)
        pygame.draw.circle(canvas, (255, 240, 130), (300, 27), 6)
        text(canvas, f"{self.coins_got} / {total}", FONT, (255, 255, 255), (318, 14))
        text(canvas, f"LEVEL {L.n}: {L.theme['name']}", SMALL, (255, 255, 255), (W // 2 + 30, 18))
        text(canvas, f"SCORE {self.score}", FONT, (255, 230, 120), (W - 230, 6))
        text(canvas, f"{int(self.time // 60):d}:{int(self.time % 60):02d}", SMALL, (220, 220, 220), (W - 230, 31))
        if self.msg[1] > 0:
            text(canvas, self.msg[0], MID, (255, 255, 255), (W // 2, 110), center=True)
        if self.intro > 0:
            a = min(1, self.intro / 40)
            band = pygame.Surface((W, 130), pygame.SRCALPHA)
            band.fill((0, 0, 0, int(160 * a)))
            canvas.blit(band, (0, H // 2 - 80))
            if a > 0.05:
                text(canvas, f"LEVEL {L.n}", MID, (255, 255, 255), (W // 2, H // 2 - 40), center=True)
                text(canvas, L.theme["name"].upper(), BIG, lerp((255, 255, 255), L.theme["top"], 0.5),
                     (W // 2, H // 2 + 20), center=True)

    def overlay(self, alpha=150):
        o = pygame.Surface((W, H), pygame.SRCALPHA)
        o.fill((0, 0, 0, alpha))
        canvas.blit(o, (0, 0))

    def draw(self):
        if self.state == "menu":
            draw_bg(canvas, self.bgs[1], self.t * 2, self.t)
            self.overlay(90)
            y = 120 + math.sin(self.t * 0.05) * 8
            for i, ch in enumerate("NEON QUEST"):
                col = lerp((90, 220, 255), (255, 90, 200), (math.sin(self.t * 0.04 + i * 0.5) + 1) / 2)
                text(canvas, ch, BIG, col, (W // 2 - 300 + i * 62, y), center=False)
            text(canvas, "A 3-level platformer adventure", MID, (255, 255, 255), (W // 2, 230), center=True)
            lines = ["Arrows / A D  -  move", "SPACE / W / UP  -  jump (hold for higher)",
                     "Stomp enemies, grab coins, reach the flag", "P pause    R restart level    M mute"]
            for i, s in enumerate(lines):
                text(canvas, s, SMALL, (240, 240, 240), (W // 2, 300 + i * 28), center=True)
            if (self.t // 30) % 2 == 0:
                text(canvas, "PRESS ENTER TO START", MID, (255, 230, 120), (W // 2, 460), center=True)
        elif self.state in ("play", "paused", "complete", "gameover", "win"):
            self.draw_world()
            if self.state == "paused":
                self.overlay()
                text(canvas, "PAUSED", BIG, (255, 255, 255), (W // 2, 220), center=True)
                text(canvas, "P / ESC resume      Q quit to menu", FONT, (230, 230, 230), (W // 2, 300), center=True)
            elif self.state == "complete":
                self.overlay()
                text(canvas, "LEVEL COMPLETE!", BIG, (255, 230, 120), (W // 2, 150), center=True)
                text(canvas, f"Coins  {self.coins_got} / {len(self.level.coins)}", FONT, (255, 255, 255), (W // 2, 240), center=True)
                text(canvas, f"Time  {int(self.time)}s    Time bonus  +{self.bonus}", FONT, (255, 255, 255), (W // 2, 275), center=True)
                text(canvas, f"Score  {self.score}", MID, (255, 230, 120), (W // 2, 330), center=True)
                if (self.t // 30) % 2 == 0:
                    text(canvas, "ENTER - " + ("next level" if self.level_no < 3 else "finish"), FONT, (255, 255, 255),
                         (W // 2, 420), center=True)
            elif self.state == "gameover":
                self.overlay(180)
                text(canvas, "GAME OVER", BIG, (255, 90, 90), (W // 2, 190), center=True)
                text(canvas, f"Score  {self.score}", MID, (255, 255, 255), (W // 2, 270), center=True)
                text(canvas, "ENTER - retry level      ESC - menu", FONT, (230, 230, 230), (W // 2, 350), center=True)
            elif self.state == "win":
                self.overlay(170)
                for i in range(2):
                    if self.t % 6 == 0:
                        self.burst(random.randint(100, W - 100), random.randint(80, 300),
                                   random.choice([(255, 220, 90), (90, 220, 255), (255, 100, 200)]), 24, 5, 0.1)
                text(canvas, "YOU WIN!", BIG, (255, 230, 120), (W // 2, 170), center=True)
                text(canvas, "You conquered all 3 levels!", MID, (255, 255, 255), (W // 2, 260), center=True)
                text(canvas, f"Final score  {self.score}", MID, (120, 230, 255), (W // 2, 320), center=True)
                text(canvas, "ENTER - back to menu", FONT, (230, 230, 230), (W // 2, 420), center=True)
        sx = sy = 0
        if self.shake > 0:
            sx, sy = random.randint(-5, 5), random.randint(-5, 5)
        screen.fill((0, 0, 0))
        screen.blit(canvas, (sx, sy))


def main():
    g = Game()
    while True:
        for e in pygame.event.get():
            g.handle(e)
        g.update(pygame.key.get_pressed())
        g.draw()
        pygame.display.flip()
        clock.tick(FPS)


if __name__ == "__main__":
    main()
