/* NEON QUEST - levels.js
 * Level layouts. Tiles are 40px. Row 0 is the top of the screen, rows 13-14 are the ground.
 * Ranges are [startCol, endCol) and are half-open.
 *
 *   ground   solid floor on rows 13-14; any gap between spans is a lava/water pit
 *   plats    one-way platforms (jump up through them, stand on top)
 *   crumble  platforms that fall ~0.6s after you stand on them, then respawn
 *   movers   horizontal moving platforms {row, a, b, w (tiles wide), sp (px/frame)}
 *   coins    rows of coins
 *   hearts   extra life pickups [col, row]
 *   spikes   hazards on the floor [c1, c2)
 *   springs  bounce pads on the floor [col]
 *   walkers  patrolling enemies [col, minCol, maxCol]
 *   bats     flying enemies [col, row, range]
 *   turrets  shooting enemies standing on the floor [col]
 *   signs    tutorial hints [col, text]
 *   boss     optional boss arena: lock walls appear around the fight
 */
(function (NQ) {
  'use strict';

  NQ.LEVELS = [
    {
      id: 1, name: 'Sunny Meadows', sub: 'Learn the ropes', theme: 'meadow', music: 1,
      width: 124, start: [2, 12], flag: 116, checkpoint: 62,
      ground: [[0, 21], [24, 44], [47, 70], [73, 92], [95, 124]],
      plats: [[10, 26, 30], [9, 33, 37], [10, 50, 54], [7, 57, 61], [10, 66, 69],
              [10, 76, 80], [6, 84, 88], [10, 100, 104], [10, 108, 112]],
      crumble: [], movers: [],
      coins: [[11, 4, 16], [11, 28, 30], [11, 48, 68], [11, 96, 122]],
      hearts: [[38, 6], [59, 5], [86, 4]],
      spikes: [[40, 42], [66, 68]],
      springs: [84],
      walkers: [[14, 8, 21], [30, 24, 44], [52, 47, 70], [78, 73, 92], [104, 95, 118]],
      bats: [[35, 5, 3], [80, 4, 3], [108, 6, 3]],
      turrets: [],
      signs: [
        [2, 'Arrows / A D to move  ·  SPACE to jump'],
        [18, 'Hold SPACE for a higher jump'],
        [36, 'SHIFT / J / K = DASH: smashes enemies'],
        [60, 'Checkpoint ahead: it saves your spot'],
        [82, 'Spring pads launch you high!'],
      ],
    },
    {
      id: 2, name: 'Frozen Caverns', sub: 'Moving platforms & crumbling ice', theme: 'cavern', music: 2,
      width: 132, start: [2, 12], flag: 126, checkpoint: 66,
      ground: [[0, 18], [22, 38], [42, 58], [62, 76], [80, 100], [104, 128]],
      plats: [[10, 4, 9], [10, 26, 30], [10, 46, 50], [10, 64, 70], [10, 84, 90], [10, 110, 116]],
      crumble: [[10, 50, 53], [8, 70, 73], [10, 96, 99]],
      movers: [
        { row: 11, a: 16, b: 22, w: 2, sp: 1.1 },
        { row: 10, a: 37, b: 43, w: 2, sp: 1.3 },
        { row: 9, a: 56, b: 62, w: 2, sp: 1.3 },
        { row: 8, a: 74, b: 80, w: 2, sp: 1.4 },
        { row: 9, a: 98, b: 104, w: 2, sp: 1.2 },
      ],
      coins: [[11, 4, 16], [11, 24, 36], [11, 44, 56], [11, 82, 98], [11, 106, 126]],
      hearts: [[26, 6], [60, 4], [120, 10]],
      spikes: [[10, 12], [30, 32], [64, 66], [90, 92], [118, 120]],
      springs: [32],
      walkers: [[8, 2, 16], [28, 22, 36], [50, 44, 56], [70, 64, 74], [92, 82, 98], [112, 106, 124]],
      bats: [[14, 6, 3], [34, 4, 4], [54, 6, 3], [72, 3, 3], [86, 6, 4], [108, 4, 4]],
      turrets: [],
      signs: [
        [2, 'Crumbling ice falls after a moment: keep moving!'],
        [16, 'Ride the moving platforms over the gaps'],
        [30, 'Spikes hurt: jump over them'],
        [60, 'Frost bats swoop: stomp them from above'],
        [120, 'Almost there!'],
      ],
    },
    {
      id: 3, name: 'Volcano Keep', sub: 'Lava, turrets & the Stone Golem', theme: 'volcano', music: 3,
      width: 150, start: [2, 12], flag: 137, checkpoint: 90,
      ground: [[0, 14], [18, 30], [34, 46], [50, 62], [66, 80], [84, 100], [104, 110], [110, 150]],
      plats: [[10, 4, 10], [10, 22, 26], [10, 40, 44], [10, 54, 58], [10, 72, 78], [10, 88, 94]],
      crumble: [[10, 37, 40], [8, 68, 71], [10, 50, 53]],
      movers: [
        { row: 11, a: 12, b: 20, w: 2, sp: 1.3 },
        { row: 10, a: 29, b: 35, w: 2, sp: 1.4 },
        { row: 8, a: 62, b: 68, w: 2, sp: 1.5 },
        { row: 9, a: 96, b: 104, w: 2, sp: 1.4 },
      ],
      coins: [[11, 8, 12], [11, 24, 28], [11, 58, 62], [11, 88, 92]],
      hearts: [[16, 6], [56, 5], [100, 8]],
      spikes: [[6, 8], [24, 26], [52, 54], [86, 88], [106, 108]],
      springs: [44],
      walkers: [[10, 2, 12], [40, 36, 48], [70, 66, 80], [92, 86, 98]],
      bats: [[24, 4, 4], [46, 6, 3], [64, 3, 3], [90, 5, 4]],
      turrets: [28, 60, 74, 96],
      signs: [
        [2, 'Lava pits are deadly: stay on solid ground'],
        [26, 'Turrets shoot: dash into them to smash'],
        [90, 'Checkpoint! Your next life starts here'],
        [108, 'The Stone Golem awaits: stomp its head 3 times!'],
      ],
      boss: { col: 120, a: 114, b: 128, hp: 3, lock: [110, 130] },
    },
  ];
})(window.NQ = window.NQ || {});
