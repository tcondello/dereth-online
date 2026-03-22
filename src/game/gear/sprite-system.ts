// sprite-system.ts — 4-directional animated character sprite system
// Pure canvas logic (no Phaser, no React).
// Extracted from pixel-armor-gen.tsx with race-parameterized skin colors.

export const SPRITE_SIZE = 16;
const S = SPRITE_SIZE;
const DIRS = ["down", "up", "left", "right"] as const;
export type Dir = typeof DIRS[number];

// Base character colors (non-skin parts)
const HR = "#5a3a1a"; // hair
const EY = "#222";    // eye
const TN = "#7a7a8a"; // tunic
const TD = "#5a5a6a"; // tunic dark
const PT = "#6a6a7a"; // pants
const PD = "#4a4a5a"; // pants dark
const BT = "#5a4a3a"; // boot

// Race-specific skin colors: skin (light), shadow (dark)
export const RACE_SPRITE_COLORS: Record<string, { skin: string; shadow: string }> = {
  aluvian:    { skin: "#e8c88a", shadow: "#c49a60" },
  gharundim:  { skin: "#b8c8e0", shadow: "#7898b8" },
  sho:        { skin: "#b8d8a8", shadow: "#78a878" },
  viamontian: { skin: "#d8a8a8", shadow: "#a87878" },
  umbraen:    { skin: "#c8b8d8", shadow: "#9878b8" },
};

// Build base 16×16 character sprite grid for a direction + frame
// race: one of aluvian/gharundim/sho/viamontian/umbraen — controls skin color
export function charSprite(dir: string, frame: number, race = 'aluvian'): (string | null)[][] {
  const g: (string | null)[][] = Array.from({ length: S }, () => Array(S).fill(null));
  const f = dir;
  const { skin: SK, shadow: SD } = RACE_SPRITE_COLORS[race] ?? RACE_SPRITE_COLORS.aluvian;

  // ── HEAD (rows 1–5) ──
  if (f === "down" || f === "up") {
    for (let r = 1; r <= 5; r++) for (let c = 5; c <= 10; c++) {
      if (r === 1 && (c === 5 || c === 10)) continue;
      if (r <= 2) g[r][c] = HR;
      else if (f === "down" && r === 3 && (c === 6 || c === 9)) g[r][c] = EY;
      else g[r][c] = SK;
    }
    if (f === "up") for (let c = 5; c <= 10; c++) g[3][c] = HR;
  } else {
    const xo = f === "right" ? 1 : 0;
    for (let r = 1; r <= 5; r++) for (let c = 6 - xo; c <= 10 - xo; c++) {
      if (r === 1 && (c === 6 - xo || c === 10 - xo)) continue;
      if (r <= 2) g[r][c] = HR;
      else if (r === 3 && c === (f === "right" ? 9 : 7)) g[r][c] = EY;
      else g[r][c] = SK;
    }
  }

  // ── BODY (rows 6–9) ──
  for (let r = 6; r <= 9; r++) {
    for (let c = 5; c <= 10; c++) g[r][c] = (c === 5 || c === 10) ? TD : TN;
    if (f === "down" || f === "up") { g[r][4] = SD; g[r][11] = SD; }
    else if (f === "left") { g[r][4] = SD; }
    else { g[r][11] = SD; }
  }

  // ── LEGS + FEET (direction + frame aware) ──
  if (f === "down" || f === "up") {
    if (frame === 0) {
      for (let r = 10; r <= 12; r++) { g[r][6] = PT; g[r][7] = PD; g[r][8] = PT; g[r][9] = PD; }
      for (let r = 13; r <= 14; r++) { g[r][6] = BT; g[r][7] = BT; g[r][8] = BT; g[r][9] = BT; }
    } else {
      for (let r = 11; r <= 13; r++) { g[r][6] = PT; g[r][7] = PD; }
      g[14][6] = BT; g[14][7] = BT;
      for (let r = 10; r <= 11; r++) { g[r][8] = PT; g[r][9] = PD; }
      g[12][8] = BT; g[12][9] = BT;
    }
  } else if (f === "left") {
    if (frame === 0) {
      for (let r = 10; r <= 12; r++) { g[r][6] = PT; g[r][7] = PD; }
      g[13][6] = BT; g[13][7] = BT;
    } else {
      g[10][7] = PD; g[11][7] = PD; g[12][7] = BT;
      g[11][5] = PT; g[12][5] = PT; g[13][5] = BT;
    }
  } else {
    if (frame === 0) {
      for (let r = 10; r <= 12; r++) { g[r][8] = PT; g[r][9] = PD; }
      g[13][8] = BT; g[13][9] = BT;
    } else {
      g[10][8] = PD; g[11][8] = PD; g[12][8] = BT;
      g[11][10] = PT; g[12][10] = PT; g[13][10] = BT;
    }
  }

  return g;
}

// Direction-aware gear overlay — returns pixel list to draw on top of charSprite
export function gearOverlay(itemType: string, dir: string, frame: number, pal: string[]): Array<{ r: number; c: number; color: string }> {
  const px: Array<{ r: number; c: number; color: string }> = [];
  const pl = pal.length;
  const h  = () => pal[pl - 1];
  const md = () => pal[Math.floor(pl * .5)];
  const lo = () => pal[Math.max(1, Math.floor(pl * .25))];
  const dk = () => pal[0];
  const bob = frame === 1 ? 1 : 0;

  switch (itemType) {
    case "Helmet": {
      const hy = bob;
      if (dir === "down") {
        for (let r = hy; r <= hy + 5; r++) for (let c = 4; c <= 11; c++) {
          if (r === hy && (c < 6 || c > 9)) continue;
          if (r === hy + 5 && (c < 5 || c > 10)) continue;
          px.push({ r, c, color: r <= hy + 1 ? h() : r === hy + 5 ? dk() : (c === 4 || c === 11) ? dk() : md() });
        }
      } else if (dir === "up") {
        for (let r = hy; r <= hy + 5; r++) for (let c = 4; c <= 11; c++) {
          if (r === hy && (c < 6 || c > 9)) continue;
          px.push({ r, c, color: r <= hy + 1 ? h() : (c === 4 || c === 11) ? dk() : r <= hy + 3 ? md() : lo() });
        }
      } else {
        const xo = dir === "right" ? 1 : -1;
        for (let r = hy; r <= hy + 5; r++) for (let c = 4; c <= 11; c++) {
          if (r === hy && (c < 6 || c > 9)) continue;
          const shifted = c + xo; if (shifted < 3 || shifted > 12) continue;
          px.push({ r, c: shifted, color: r <= hy + 1 ? h() : (shifted <= 5 || shifted >= 11) ? dk() : md() });
        }
      }
      break;
    }
    case "Chestplate": {
      if (dir === "down" || dir === "up") {
        for (let r = 6; r <= 9; r++) for (let c = 3; c <= 12; c++) {
          if (r === 6 && (c < 4 || c > 11)) continue;
          px.push({ r, c, color: (c <= 3 || c >= 12) ? dk() : (c === 7 || c === 8) ? (dir === "down" ? h() : md()) : md() });
        }
      } else {
        const w = dir === "right" ? [4, 11] : [5, 12];
        for (let r = 6; r <= 9; r++) for (let c = w[0]; c <= w[1]; c++) {
          px.push({ r, c, color: (c === w[0] || c === w[1]) ? dk() : r < 8 ? h() : md() });
        }
      }
      break;
    }
    case "Gauntlets": {
      if (dir === "down") { for (let r = 6; r <= 10; r++) { px.push({ r, c: 3, color: dk() }); px.push({ r, c: 4, color: h() }); px.push({ r, c: 11, color: h() }); px.push({ r, c: 12, color: dk() }); } }
      else if (dir === "up") { for (let r = 6; r <= 10; r++) { px.push({ r, c: 3, color: dk() }); px.push({ r, c: 4, color: md() }); px.push({ r, c: 11, color: md() }); px.push({ r, c: 12, color: dk() }); } }
      else if (dir === "left") { for (let r = 6; r <= 10; r++) { px.push({ r, c: 3, color: dk() }); px.push({ r, c: 4, color: h() }); } }
      else { for (let r = 6; r <= 10; r++) { px.push({ r, c: 11, color: h() }); px.push({ r, c: 12, color: dk() }); } }
      break;
    }
    case "Leggings": {
      if (dir === "down" || dir === "up") {
        if (frame === 0) {
          for (let r = 10; r <= 12; r++) { px.push({ r, c: 5, color: dk() }); px.push({ r, c: 6, color: md() }); px.push({ r, c: 7, color: lo() }); px.push({ r, c: 8, color: md() }); px.push({ r, c: 9, color: lo() }); px.push({ r, c: 10, color: dk() }); }
        } else {
          for (let r = 11; r <= 13; r++) { px.push({ r, c: 5, color: dk() }); px.push({ r, c: 6, color: md() }); px.push({ r, c: 7, color: dk() }); }
          for (let r = 10; r <= 11; r++) { px.push({ r, c: 8, color: dk() }); px.push({ r, c: 9, color: md() }); px.push({ r, c: 10, color: dk() }); }
        }
      } else {
        const cx = dir === "left" ? 6 : 9;
        if (frame === 0) {
          for (let r = 10; r <= 12; r++) { px.push({ r, c: cx - 1, color: dk() }); px.push({ r, c: cx, color: md() }); px.push({ r, c: cx + 1, color: dk() }); }
        } else {
          for (let r = 10; r <= 11; r++) px.push({ r, c: cx + (dir === "left" ? 1 : 0), color: md() });
          px.push({ r: 12, c: cx + (dir === "left" ? 1 : 0), color: dk() });
          for (let r = 11; r <= 12; r++) px.push({ r, c: cx + (dir === "left" ? -1 : 1), color: md() });
          px.push({ r: 13, c: cx + (dir === "left" ? -1 : 1), color: dk() });
        }
      }
      break;
    }
    case "Boots": {
      if (dir === "down" || dir === "up") {
        if (frame === 0) {
          for (let r = 13; r <= 14; r++) for (let c = 5; c <= 10; c++) px.push({ r, c, color: (c === 5 || c === 10) ? dk() : r === 13 ? h() : md() });
          for (let c = 6; c <= 9; c++) px.push({ r: 15, c, color: lo() });
        } else {
          px.push({ r: 14, c: 5, color: dk() }); px.push({ r: 14, c: 6, color: h() }); px.push({ r: 14, c: 7, color: md() });
          px.push({ r: 15, c: 6, color: lo() }); px.push({ r: 15, c: 7, color: lo() });
          px.push({ r: 12, c: 8, color: h() }); px.push({ r: 12, c: 9, color: md() }); px.push({ r: 12, c: 10, color: dk() });
          px.push({ r: 13, c: 8, color: lo() }); px.push({ r: 13, c: 9, color: lo() });
        }
      } else {
        const cx = dir === "left" ? 5 : 9;
        if (frame === 0) {
          px.push({ r: 13, c: cx, color: h() }); px.push({ r: 13, c: cx + 1, color: md() });
          px.push({ r: 14, c: cx, color: lo() }); px.push({ r: 14, c: cx + 1, color: lo() });
        } else {
          px.push({ r: 12, c: cx + (dir === "left" ? 1 : 0), color: md() });
          px.push({ r: 13, c: cx + (dir === "left" ? -1 : 1), color: h() });
          px.push({ r: 14, c: cx + (dir === "left" ? -1 : 1), color: lo() });
        }
      }
      break;
    }
    case "Shield": {
      const shieldSide = dir === "right" ? [1, 3] : dir === "left" ? [12, 14] : [0, 3];
      if (dir === "down" || dir === "up") {
        for (let r = 5; r <= 11; r++) for (let c = shieldSide[0]; c <= shieldSide[1]; c++) {
          if ((r === 5 || r === 11) && c === shieldSide[0]) continue;
          px.push({ r, c, color: (c === shieldSide[0] || c === shieldSide[1] || r === 5 || r === 11) ? dk() : r === 8 ? h() : md() });
        }
      } else {
        const sc = dir === "left" ? 3 : 12;
        for (let r = 5; r <= 11; r++) px.push({ r, c: sc, color: r === 8 ? h() : md() });
      }
      break;
    }
    default: { // Weapons
      if (dir === "down") {
        for (let r = 1; r <= 13; r++) px.push({ r, c: 13, color: r < 3 ? h() : r < 9 ? md() : lo() });
        if (["Sword", "Axe"].includes(itemType)) { px.push({ r: 9, c: 12, color: md() }); px.push({ r: 9, c: 14, color: md() }); }
        if (itemType === "Staff") { px.push({ r: 0, c: 12, color: h() }); px.push({ r: 0, c: 13, color: h() }); px.push({ r: 0, c: 14, color: h() }); }
        if (itemType === "Axe") { for (let r = 1; r <= 5; r++) { px.push({ r, c: 14, color: h() }); px.push({ r, c: 15, color: md() }); } }
      } else if (dir === "up") {
        for (let r = 1; r <= 13; r++) px.push({ r, c: 13, color: r < 3 ? lo() : r < 9 ? md() : h() });
      } else if (dir === "left") {
        for (let r = 1; r <= 13; r++) px.push({ r, c: 2, color: r < 3 ? h() : r < 9 ? md() : lo() });
      } else {
        for (let r = 1; r <= 13; r++) px.push({ r, c: 13, color: r < 3 ? h() : r < 9 ? md() : lo() });
      }
      break;
    }
  }
  return px;
}

// Determine facing direction from movement delta
export function getFacing(dx: number, dy: number): Dir {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

// Gear overlay render order (back to front)
export const LAYER_ORDER = [
  "Boots", "Leggings", "Chestplate", "Gauntlets", "Helmet",
  "Shield", "Sword", "Axe", "Spear", "Dagger", "Staff", "Bow",
];
