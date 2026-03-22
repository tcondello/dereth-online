// enemy-sprites.ts — Pixel art sprite generators for enemies.
// Ported from creature-lab.tsx, typed for use in Phaser texture baking.

const S = 16;
type Grid = (string | null)[][];

// ═══ ELEMENT PALETTES ═══
export const ELEMENTS: Record<string, { colors: string[]; proj: string; accent: string }> = {
  slime:  { colors: ["#1a3a1a","#2a5c2a","#4a8a3a","#6aba4a","#8ade6a","#c0ff90"], proj: "#6aba4a", accent: "#8ade6a" },
  ice:    { colors: ["#0a1828","#1a3858","#3a6888","#5a98b8","#80c8e8","#c0e8ff"], proj: "#80c8e8", accent: "#5a98b8" },
  fire:   { colors: ["#3a0a0a","#6a1a0a","#aa3a10","#dd6620","#ff9930","#ffdd60"], proj: "#ff9930", accent: "#dd6620" },
  shadow: { colors: ["#0a0a18","#1a1a30","#2a2a4a","#4a3a6a","#6a4a8a","#9a6aba"], proj: "#6a4a8a", accent: "#9a6aba" },
  earth:  { colors: ["#1a1408","#3a2a10","#5a4a28","#8a7a48","#b0a060","#d8cc90"], proj: "#8a7a48", accent: "#b0a060" },
  pink:   { colors: ["#3a1028","#6a2048","#aa4078","#dd60a8","#ff88cc","#ffc0e8"], proj: "#ff88cc", accent: "#dd60a8" },
};

// ═══ AC ENEMY TYPE → ARCHETYPE + ELEMENT ═══
export const ENEMY_ARCHETYPE: Record<string, { spriteFn: string; element: string }> = {
  drudge:    { spriteFn: "blob",    element: "earth"  },
  larva:     { spriteFn: "blob",    element: "slime"  },
  shadow:    { spriteFn: "flyer",   element: "shadow" },
  virindi:   { spriteFn: "flyer",   element: "ice"    },
  banderling:{ spriteFn: "blob",    element: "earth"  },
  olthoi:    { spriteFn: "rock",    element: "slime"  },
  tusker:    { spriteFn: "dragon",  element: "fire"   },
  unicorn:   { spriteFn: "unicorn", element: "pink"   },
};

// ═══ SPRITE GENERATORS ═══

function blobSprite(pal: string[], frame: number, dir: string, state: string): Grid {
  const g: Grid = Array.from({ length: S }, () => Array(S).fill(null));
  const pl = pal.length;
  const dk = pal[0], md = pal[Math.floor(pl * 0.4)], lt = pal[Math.floor(pl * 0.65)], hi = pal[pl - 1], ol = pal[Math.max(0, Math.floor(pl * 0.15))];
  const cx = 8, cy = 8;
  const squish = Math.sin(frame * Math.PI / 2) * 0.15;
  const hw = 5 + squish * 3, hh = 6 - squish * 2;

  for (let r = 0; r < S; r++) for (let c = 0; c < S; c++) {
    const nr = (r - cy) / hh, nc = (c - cx) / hw, d = nr * nr + nc * nc;
    if (d > 1) continue;
    g[r][c] = d > 0.75 ? ol : nr < -0.5 && Math.abs(nc) < 0.3 ? hi : nr < -0.3 ? lt : md;
  }
  const eo = dir === "left" ? -1 : dir === "right" ? 1 : 0, ey = cy - 1;
  g[ey][cx - 2 + eo] = "#fff"; g[ey][cx - 1 + eo] = "#fff"; g[ey + 1][cx - 2 + eo] = "#fff"; g[ey][cx - 1 + eo] = "#111";
  g[ey][cx + 2 + eo] = "#fff"; g[ey][cx + 1 + eo] = "#fff"; g[ey + 1][cx + 2 + eo] = "#fff"; g[ey][cx + 1 + eo] = "#111";
  if (state === "attack") { g[cy + 1][cx - 1] = dk; g[cy + 1][cx] = dk; g[cy + 1][cx + 1] = dk; g[cy + 2][cx] = dk; }
  if (state === "move" && (frame === 1 || frame === 3)) {
    if (cy + Math.round(hh) < S) g[cy + Math.round(hh)][cx - 1] = lt;
    if (cy + Math.round(hh) + 1 < S) g[cy + Math.round(hh) + 1][cx] = md;
  }
  return g;
}

function flyerSprite(pal: string[], frame: number, dir: string, _state: string): Grid {
  const g: Grid = Array.from({ length: S }, () => Array(S).fill(null));
  const pl = pal.length;
  const dk = pal[0], md = pal[Math.floor(pl * 0.4)], lt = pal[Math.floor(pl * 0.65)], hi = pal[pl - 1], ol = pal[Math.max(0, Math.floor(pl * 0.15))];
  const cx = 8, cy = 7, wP = Math.sin(frame * Math.PI / 1.5), bob = Math.round(Math.sin(frame * Math.PI / 2));

  for (let r = cy - 2 + bob; r <= cy + 2 + bob; r++) for (let c = cx - 2; c <= cx + 2; c++) {
    const d = ((r - cy - bob) / 2.5) ** 2 + ((c - cx) / 2.5) ** 2;
    if (d > 1) continue;
    if (r >= 0 && r < S && c >= 0 && c < S) g[r][c] = d > 0.6 ? ol : (r - cy - bob) < 0 ? lt : md;
  }
  const wU = Math.round(wP * 3);
  for (let i = 0; i < 4; i++) {
    const wy = cy - 1 + bob - wU + Math.round(i * wU / 4);
    [cx - 3 - i, cx + 3 + i].forEach(wc => {
      if (wy >= 0 && wy < S && wc >= 0 && wc < S) {
        g[wy][wc] = lt;
        const adj = wc < cx ? wc + 1 : wc - 1;
        if (adj >= 0 && adj < S) g[wy][adj] = i < 2 ? hi : md;
      }
    });
  }
  const eO = dir === "left" ? -1 : dir === "right" ? 1 : 0, ey2 = cy - 1 + bob;
  if (ey2 >= 0 && ey2 < S) { g[ey2][cx - 1 + eO] = "#ff3333"; g[ey2][cx + 1 + eO] = "#ff3333"; }
  const ty = cy + 2 + bob;
  if (ty >= 0 && ty < S) { g[ty][cx] = md; if (ty + 1 < S) g[ty + 1][cx] = ol; if (ty + 2 < S) g[ty + 2][cx + (frame % 2 ? 1 : -1)] = dk; }
  return g;
}

function rockSprite(pal: string[], frame: number, dir: string, state: string): Grid {
  const g: Grid = Array.from({ length: S }, () => Array(S).fill(null));
  const pl = pal.length;
  const dk = pal[0], md = pal[Math.floor(pl * 0.35)], lt = pal[Math.floor(pl * 0.6)], hi = pal[pl - 1];
  const stomp = state === "attack" ? (frame % 2 === 0 ? 1 : 0) : 0;

  const shape = [
    [0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0],
  ];
  const yOff = 2 + stomp;
  for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++) {
    if (!shape[r][c]) continue;
    const pr = r + yOff;
    if (pr >= S || c >= S) continue;
    const nr = r / shape.length;
    const isEdge = r === 0 || r === shape.length - 1 || !shape[r][c - 1] || !shape[r][c + 1];
    const crack = Math.sin(r * 5 + c * 3) > 0.8 || Math.sin(r * 3 - c * 7) > 0.85;
    g[pr][c] = isEdge ? dk : crack ? dk : nr < 0.25 ? lt : nr < 0.5 ? (c < 8 ? md : lt) : md;
    if (!isEdge && Math.sin(r * 7 + c * 11) > 0.9) g[pr][c] = hi;
  }
  const ey = 5 + yOff, eO = dir === "left" ? -1 : dir === "right" ? 1 : 0;
  if (ey >= 0 && ey < S) {
    g[ey][5 + eO] = "#ff4400"; g[ey][6 + eO] = "#ff6600";
    g[ey][10 + eO] = "#ff6600"; g[ey][11 + eO] = "#ff4400";
  }
  if (state === "move" && frame % 2 === 1) {
    const lY = yOff + shape.length - 2;
    if (lY < S) { g[lY][3] = md; g[lY][4] = null; g[lY][11] = null; g[lY][12] = md; }
  }
  return g;
}

function dragonSprite(pal: string[], frame: number, dir: string, state: string): Grid {
  const g: Grid = Array.from({ length: S }, () => Array(S).fill(null));
  const pl = pal.length;
  const dk = pal[0], md = pal[Math.floor(pl * 0.35)], lt = pal[Math.floor(pl * 0.6)], hi = pal[pl - 1], ol = pal[Math.max(0, Math.floor(pl * 0.18))];
  const s = (r: number, c: number, col: string | null) => { if (r >= 0 && r < S && c >= 0 && c < S && col) g[r][c] = col; };
  const wF = Math.sin(frame * Math.PI / 1.5), bob = state === "move" ? Math.round(Math.sin(frame * Math.PI / 2) * 0.8) : 0;

  const by = 6 + bob;
  // Body
  for (let r = by; r <= by + 4; r++) for (let c = 2; c <= 12; c++) {
    if (r < 0 || r >= S) continue;
    const nr = (r - by) / 4, nc = (c - 2) / 10;
    if (nr < 0.15 && (nc < 0.1 || nc > 0.9)) continue;
    if (nr > 0.85 && (nc < 0.05 || nc > 0.95)) continue;
    const isScale = nr > 0.6 && Math.sin(c * 3) > 0.3, isSpine = nr < 0.15;
    s(r, c, isSpine ? hi : isScale ? ol : nr < 0.35 ? lt : md);
  }
  for (let c = 4; c <= 10; c += 2) s(by - 1, c, hi);
  // Neck
  s(by - 1, 11, lt); s(by - 1, 12, md); s(by - 2, 12, lt); s(by - 2, 13, md);
  s(by - 3, 12, lt); s(by - 3, 13, ol); s(by - 4, 13, lt); s(by - 4, 14, md);
  s(by - 1, 13, ol); s(by - 2, 14, ol); s(by - 3, 14, dk);
  // Head
  const hx = 13, hy = by - 6;
  s(hy, hx, md); s(hy, hx + 1, lt); s(hy, hx + 2, md);
  s(hy + 1, hx - 1, ol); s(hy + 1, hx, lt); s(hy + 1, hx + 1, lt); s(hy + 1, hx + 2, md); s(hy + 1, hx + 3, ol);
  s(hy, hx + 3, ol); s(hy + 2, hx, ol); s(hy + 2, hx + 1, md); s(hy + 2, hx + 2, md); s(hy + 2, hx + 3, dk);
  // Eye
  s(hy + 1, hx + 1 + (dir === "right" ? 1 : 0), "#ff2200");
  s(hy + 1, hx + 3, dk); // nostril
  s(hy - 1, hx, ol); s(hy - 1, hx + 1, md); // crest
  // Fire breath on attack
  if (state === "attack") {
    s(hy + 2, hx + 2, "#fff"); s(hy + 2, hx + 3, "#fff");
    const fc = ["#ff4400", "#ff8800", "#ffcc00"];
    for (let i = 0; i < 3; i++) { s(hy + 3 + i, hx + 3 + i, fc[i % fc.length]); s(hy + 2 + i, hx + 4 + i, fc[(i + 1) % fc.length]); }
  }
  // Wings
  const wU = Math.round(wF * 3), wB = by - 1;
  for (let i = 0; i < 5; i++) {
    const wy = wB - wU - Math.round(i * 0.6), wc = 8 - i;
    s(wy, wc, i < 2 ? lt : md);
    if (i > 0) for (let fr = wy + 1; fr <= wB; fr++) {
      const mc = wc + Math.round((fr - wy) / (wB - wy + 1) * i * 0.5);
      s(fr, mc, ol); if (mc + 1 <= 8) s(fr, mc + 1, dk);
    }
    if (i === 4) { s(wy - 1, wc, md); s(wy, wc - 1, ol); }
    if (i >= 2 && i <= 4) s(wy + 1, wc - 1, md);
  }
  for (let i = 0; i < 4; i++) {
    const wy = wB - wU - Math.round(i * 0.5), wc = 10 + i;
    if (wc < 13) { s(wy, wc, md); if (i > 0 && wy + 1 <= wB) for (let fr = wy + 1; fr <= wB; fr++) s(fr, wc, dk); }
  }
  // Legs
  const lT = by + 5, fL = 9, bL = 4;
  if (state === "move") {
    const f1 = frame % 2 === 0;
    for (let r = 0; r < (f1 ? 3 : 2); r++) { s(lT + r, fL, md); s(lT + r, fL + 1, ol); }
    s(lT + (f1 ? 3 : 2), fL, dk); s(lT + (f1 ? 3 : 2), fL + 1, dk); s(lT + (f1 ? 3 : 2), fL + 2, dk);
    for (let r = 0; r < (f1 ? 2 : 3); r++) { s(lT + r, bL, md); s(lT + r, bL + 1, ol); }
    s(lT + (f1 ? 2 : 3), bL, dk); s(lT + (f1 ? 2 : 3), bL + 1, dk); s(lT + (f1 ? 2 : 3), bL - 1, dk);
  } else {
    for (let r = 0; r < 3; r++) { s(lT + r, fL, md); s(lT + r, fL + 1, ol); s(lT + r, bL, md); s(lT + r, bL + 1, ol); }
    s(lT + 3, fL, dk); s(lT + 3, fL + 1, dk); s(lT + 3, fL + 2, dk);
    s(lT + 3, bL, dk); s(lT + 3, bL + 1, dk); s(lT + 3, bL - 1, dk);
  }
  // Tail
  const tY = by + 2;
  for (let i = 0; i < 5; i++) {
    const tr = tY + Math.round(Math.sin(i * 0.8 + frame * 0.7) * (i > 2 ? 1.2 : 0.5)), tc = 1 - i;
    s(tr, tc, i < 2 ? md : ol); if (i < 2) s(tr + 1, tc, ol);
    if (i === 4) { s(tr - 1, tc, md); s(tr + 1, tc, md); s(tr, tc - 1, dk); }
  }
  return g;
}

function unicornSprite(pal: string[], frame: number, dir: string, state: string): Grid {
  const g: Grid = Array.from({ length: S }, () => Array(S).fill(null));
  const pl = pal.length;
  const dk = pal[0], md = pal[Math.floor(pl * 0.4)], lt = pal[Math.floor(pl * 0.65)], hi = pal[pl - 1], ol = pal[Math.max(0, Math.floor(pl * 0.15))];
  const s = (r: number, c: number, col: string | null) => { if (r >= 0 && r < S && c >= 0 && c < S && col) g[r][c] = col; };
  const MANE = ["#ffaadd", "#ff88cc", "#dd60a8"];
  const bob = state === "move" ? Math.round(Math.sin(frame * Math.PI / 1.5) * 1.5) : 0;
  const atkGlow = state === "attack" && frame % 2 === 0;

  const by = 5 + bob;
  // Horn
  for (let i = 0; i < 4; i++) {
    const hr = by - 6 - i, hc = 12;
    s(hr, hc, i < 1 ? (atkGlow ? "#ffffff" : "#ffe888") : i < 3 ? "#fff8cc" : "#ffffff");
  }
  if (state === "attack") { s(by - 10, 12, frame % 2 === 0 ? "#ffffff" : "#ffee88"); s(by - 9, 11, "#ffffff"); s(by - 9, 13, "#ffffff"); }
  // Head
  s(by - 5, 11, lt); s(by - 5, 12, lt); s(by - 5, 13, md);
  s(by - 4, 11, hi); s(by - 4, 12, lt); s(by - 4, 13, md); s(by - 4, 14, ol);
  s(by - 4, 14, dk); // nostril
  const eyeC = 12 + (dir === "right" ? 1 : 0); s(by - 5, eyeC, "#111");
  s(by - 6, 12, md); // ear
  // Neck
  s(by - 3, 11, lt); s(by - 3, 12, md); s(by - 2, 11, lt); s(by - 2, 12, ol); s(by - 1, 11, hi); s(by - 1, 12, lt);
  // Body
  for (let r = by; r <= by + 3; r++) for (let c = 3; c <= 12; c++) {
    if (r < 0 || r >= S) continue;
    if (r === by && (c <= 3 || c >= 12)) continue;
    if (r === by + 3 && (c === 3 || c === 12)) continue;
    s(r, c, r === by ? hi : r === by + 1 ? (c < 7 ? lt : hi) : r === by + 3 ? ol : lt);
  }
  // Spine
  for (let c = 4; c <= 10; c += 2) s(by - 1, c, hi);
  // Mane
  s(by - 5, 10, MANE[0]); s(by - 6, 11, MANE[1]);
  const mW = Math.sin(frame * Math.PI / 2) * 0.8;
  for (let i = 0; i < 4; i++) {
    const mr = by - 3 + i, mc = 10 + Math.round(mW * (i > 1 ? 1 : 0));
    s(mr, mc, MANE[i % MANE.length]); if (i > 0) s(mr, mc - 1, MANE[(i + 1) % MANE.length]);
  }
  for (let c = 5; c <= 10; c++) s(by - 1, c, MANE[(c + frame) % MANE.length]);
  // Legs
  const lT = by + 4, fL = 10, bL = 4;
  if (state === "move") {
    const f1 = frame % 2 === 0;
    for (let r = 0; r < (f1 ? 3 : 2); r++) s(lT + r, fL, md); s(lT + (f1 ? 3 : 2), fL, dk);
    for (let r = 0; r < (f1 ? 2 : 3); r++) s(lT + r, fL + 1, ol); s(lT + (f1 ? 2 : 3), fL + 1, dk);
    for (let r = 0; r < (f1 ? 2 : 3); r++) s(lT + r, bL, md); s(lT + (f1 ? 2 : 3), bL, dk);
    for (let r = 0; r < (f1 ? 3 : 2); r++) s(lT + r, bL + 1, ol); s(lT + (f1 ? 3 : 2), bL + 1, dk);
  } else {
    for (let r = 0; r < 3; r++) { s(lT + r, fL, r === 2 ? dk : md); s(lT + r, fL + 1, r === 2 ? dk : ol); s(lT + r, bL, r === 2 ? dk : md); s(lT + r, bL + 1, r === 2 ? dk : ol); }
    s(lT + 3, fL, dk); s(lT + 3, fL + 1, dk); s(lT + 3, bL, dk); s(lT + 3, bL + 1, dk);
  }
  // Tail
  const tY = by + 1, tW = Math.sin(frame * Math.PI / 2 + 1) * 1.5;
  for (let i = 0; i < 4; i++) {
    const tr = tY + Math.round(Math.sin(i * 0.7 + frame * 0.8) * 0.7), tc = 2 - i + Math.round(tW * (i / 4));
    s(tr, tc, MANE[i % MANE.length]); s(tr + 1, tc, MANE[(i + 1) % MANE.length]);
  }
  return g;
}

// ═══ ARCHETYPE → SPRITE FUNCTION ═══
const SPRITE_FNS: Record<string, (pal: string[], frame: number, dir: string, state: string) => Grid> = {
  blob:    blobSprite,
  flyer:   flyerSprite,
  rock:    rockSprite,
  dragon:  dragonSprite,
  unicorn: unicornSprite,
};

// ═══ PUBLIC API ═══

/**
 * Get a 16×16 pixel grid for a given AC enemy type, frame, direction, and state.
 * @param type   AC enemy type key (e.g. "drudge", "tusker", "virindi")
 * @param frame  Animation frame index (0 or 1 for move)
 * @param dir    Direction: "down" | "up" | "left" | "right"
 * @param state  State: "move" | "attack" | "idle"
 */
export function getEnemyGrid(type: string, frame: number, dir: string, state: string): Grid {
  const archetype = ENEMY_ARCHETYPE[type] ?? { spriteFn: "blob", element: "earth" };
  const spriteFn = SPRITE_FNS[archetype.spriteFn] ?? blobSprite;
  const palette = ELEMENTS[archetype.element]?.colors ?? ELEMENTS.earth.colors;
  return spriteFn(palette, frame, dir, state);
}

/**
 * Get the element palette colors for a given AC enemy type.
 */
export function getEnemyPalette(type: string): string[] {
  const archetype = ENEMY_ARCHETYPE[type] ?? { spriteFn: "blob", element: "earth" };
  return ELEMENTS[archetype.element]?.colors ?? ELEMENTS.earth.colors;
}
