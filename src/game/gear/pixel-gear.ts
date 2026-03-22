// pixel-gear.ts — pure logic extracted from pixel-armor-gen.tsx
// No React, no DOM, no Phaser — usable on server-generated data.

// ═══ PALETTE DATA ═══
export const GP: Record<string, Array<{ game: string; colors: string[]; accent: string; mod: { bonus: string; bonusAmt: number; penalty: string; penaltyAmt: number } }>> = {
  "Game Boy": [
    { game: "My Own Summer", colors: ["#242520","#445640","#51626c","#daab5c"], accent: "#daab5c", mod: { bonus: "Tank", bonusAmt: .12, penalty: "DPS", penaltyAmt: .08 } },
    { game: "Lava-GB", colors: ["#051f39","#4a2480","#c53a9d","#ff8e80"], accent: "#c53a9d", mod: { bonus: "DPS", bonusAmt: .15, penalty: "Tank", penaltyAmt: .10 } },
  ],
  "Game Boy Color": [
    { game: "Oil 6", colors: ["#fbf5ef","#f2d3ab","#c69fa5","#8b6d9c","#494d7e","#272744"], accent: "#8b6d9c", mod: { bonus: "Support", bonusAmt: .15, penalty: "DPS", penaltyAmt: .08 } },
    { game: "Curiosities", colors: ["#46425e","#15788c","#00b9be","#ffeecc","#ffb0a3","#ff6973"], accent: "#00b9be", mod: { bonus: "DPS", bonusAmt: .12, penalty: "Tank", penaltyAmt: .08 } },
  ],
  "NES": [
    { game: "Modern Interface", colors: ["#ececd3","#d5d49b","#8ead58","#3b633d","#b8b5d0","#908e9e","#534a68","#303245"], accent: "#8ead58", mod: { bonus: "Support", bonusAmt: .12, penalty: "DPS", penaltyAmt: .06 } },
    { game: "SLSO8", colors: ["#0d2b45","#203c56","#544e68","#8d697a","#d08159","#ffaa5e","#ffd4a3","#ffecd6"], accent: "#ffaa5e", mod: { bonus: "DPS", bonusAmt: .15, penalty: "Support", penaltyAmt: .10 } },
  ],
  "SNES": [
    { game: "Japanese Woodblock", colors: ["#2b2821","#624c3c","#d9ac8b","#e3cfb4","#243d5c","#5d7275","#5c8b93","#b1a58d","#b03a48","#d4804d","#e0c872","#3e6958"], accent: "#b03a48", mod: { bonus: "Tank", bonusAmt: .18, penalty: "Support", penaltyAmt: .10 } },
    { game: "NOPAL-12", colors: ["#e2e4df","#c5cfc4","#a8b5ae","#92929c","#ffeced","#fbd4d2","#f1b4b4","#cca3a3","#f1eab6","#e4dba0","#cac18a","#aba47b"], accent: "#f1b4b4", mod: { bonus: "Support", bonusAmt: .18, penalty: "DPS", penaltyAmt: .12 } },
  ],
  "N64": [
    { game: "Retro 8-Bit", colors: ["#1a0a2e","#2e1044","#3c2060","#5a3888","#8860b0","#b898d8","#ddc8f0","#ffffff","#ffdd00","#ff8800","#ff4444","#44ddff","#2288cc","#44cc44","#ff44aa","#884400"], accent: "#ff8800", mod: { bonus: "DPS", bonusAmt: .18, penalty: "Support", penaltyAmt: .12 } },
    { game: "Deep Sea", colors: ["#020810","#040e1e","#061828","#082535","#0a3848","#0d5068","#1080a0","#20b0d0","#00d4ff","#00ff9d","#80ffcc","#ff6090","#ff9040","#ffe060","#c0e8f8","#ffffff"], accent: "#00d4ff", mod: { bonus: "Support", bonusAmt: .15, penalty: "Tank", penaltyAmt: .10 } },
    { game: "Vinik24", colors: ["#000000","#6f6776","#9a9a97","#c5ccb8","#8b5580","#c38890","#a593a5","#666092","#9a4f50","#c28d75","#7ca1c0","#416aa3","#8d6268","#be955c","#68aca9","#387080"], accent: "#c28d75", mod: { bonus: "Tank", bonusAmt: .15, penalty: "DPS", penaltyAmt: .10 } },
    { game: "Fantasy 24", colors: ["#1f240a","#39571c","#a58c27","#efac28","#efd8a1","#ab5c1c","#183f39","#ef692f","#efb775","#a56243","#773421","#724113","#276468","#ef3a0c","#3c9f9c","#9b1a0a"], accent: "#ef692f", mod: { bonus: "DPS", bonusAmt: .20, penalty: "Support", penaltyAmt: .15 } },
  ],
};

// Tier palette game names indexed by forge tier (0–4)
export const TIER_PALETTE_GAMES: string[][] = [
  ['My Own Summer', 'Lava-GB'],
  ['Oil 6', 'Curiosities'],
  ['Modern Interface', 'SLSO8'],
  ['Japanese Woodblock', 'NOPAL-12'],
  ['Retro 8-Bit', 'Deep Sea', 'Vinik24', 'Fantasy 24'],
];

export const ROLES: Record<string, { primary: string[]; secondary: string[]; penalty: string[] }> = {
  Tank:    { primary: ["DEF","HP"],           secondary: ["MAG","LCK"], penalty: ["SPD","CRT"] },
  DPS:     { primary: ["ATK","CRT"],          secondary: ["SPD","LCK"], penalty: ["DEF","HP"] },
  Support: { primary: ["MAG","SPD","LCK"],    secondary: ["HP"],        penalty: ["ATK","DEF"] },
};

export const TB = [28, 48, 75, 105, 140]; // tier bases (forge tier 0–4)

export interface ItemArchetype {
  role: string; lean: number; pen: number; sub: string | null; slot: string;
}

export const IA: Record<string, ItemArchetype> = {
  Helmet:     { role: "Tank",    lean: .7,  pen: .15, sub: "Support", slot: "Head" },
  Chestplate: { role: "Tank",    lean: .85, pen: .25, sub: null,       slot: "Chest" },
  Gauntlets:  { role: "DPS",     lean: .5,  pen: .1,  sub: "Tank",    slot: "Arms" },
  Leggings:   { role: "Tank",    lean: .6,  pen: .12, sub: "Support", slot: "Legs" },
  Boots:      { role: "Support", lean: .65, pen: .1,  sub: "DPS",     slot: "Feet" },
  Shield:     { role: "Tank",    lean: .9,  pen: .3,  sub: null,       slot: "OffHand" },
  Sword:      { role: "DPS",     lean: .7,  pen: .15, sub: "Tank",    slot: "MainHand" },
  Axe:        { role: "DPS",     lean: .85, pen: .25, sub: null,       slot: "MainHand" },
  Spear:      { role: "DPS",     lean: .6,  pen: .1,  sub: "Support", slot: "MainHand" },
  Dagger:     { role: "DPS",     lean: .8,  pen: .3,  sub: null,       slot: "MainHand" },
  Staff:      { role: "Support", lean: .85, pen: .2,  sub: null,       slot: "MainHand" },
  Bow:        { role: "DPS",     lean: .65, pen: .12, sub: "Support", slot: "MainHand" },
};

export const AS = ["DEF","HP","ATK","CRT","MAG","SPD","LCK"];
export const CATS = {
  Armor:   ["Helmet","Chestplate","Gauntlets","Leggings","Boots","Shield"],
  Weapons: ["Sword","Axe","Spear","Dagger","Staff","Bow"],
};
export const ALL = [...CATS.Armor, ...CATS.Weapons];

export interface TierDef {
  name: string; label: string; color: string; bg: string;
  gs: number; ps: number; dr: number; stars: number; dl: number;
}

export const TIERS: TierDef[] = [
  { name: "Game Boy",       label: "Common",    color: "#9bbc0f", bg: "#0f380f", gs: 10, ps: 5, dr: .35, stars: 1, dl: 3 },
  { name: "Game Boy Color", label: "Uncommon",  color: "#5b9bd5", bg: "#1a1a2e", gs: 12, ps: 4, dr: .28, stars: 2, dl: 2 },
  { name: "NES",            label: "Rare",      color: "#f5794e", bg: "#1c1c1c", gs: 14, ps: 4, dr: .20, stars: 3, dl: 1 },
  { name: "SNES",           label: "Epic",      color: "#c77dff", bg: "#0d1117", gs: 16, ps: 3, dr: .12, stars: 4, dl: 0 },
  { name: "N64",            label: "Legendary", color: "#ffd700", bg: "#0a0a14", gs: 20, ps: 3, dr: .05, stars: 5, dl: 0 },
];

// Map game rarity (0–5) to forge tier (0–4)
export function rarityToForgeTier(rarity: number): number {
  return Math.min(rarity, 4);
}

// ═══ PIXEL ART ENGINE ═══

export function matShade(mat: string, nr: number, nc: number, g: number): number {
  switch (mat) {
    case "metal":   return Math.max(0, Math.min(1, (1 - nr * .5) * (1 - Math.pow(Math.abs(nc - .5) * 2, 1.5) * .3) + Math.sin(nr * Math.PI * 6) * .1));
    case "leather": return Math.max(0, Math.min(1, .5 + (1 - nr) * .3 + Math.sin(nc * g * 2.5) * .06));
    case "crystal": { const f = 1 - Math.max(Math.abs(nc - .5) * 2, Math.abs(nr - .5) * 2); return Math.max(0, Math.min(1, f * .6 + .3 + Math.sin(nr * 12) * Math.sin(nc * 12) * .15)); }
    case "steel":   return Math.max(0, Math.min(1, Math.pow(1 - nr, .7) * .7 + .2));
    case "cloth":   return Math.max(0, Math.min(1, .4 + (1 - nr) * .35 + Math.sin(nc * Math.PI * 3) * .08));
    default: return .5;
  }
}

export function getMat(s: Record<string, number>, r: string): string {
  const d = Math.max(0, s.DEF || 0), a = Math.max(0, s.ATK || 0),
        m = Math.max(0, s.MAG || 0), sp = Math.max(0, s.SPD || 0),
        mx = Math.max(d, a, m, sp, 1);
  if (d / mx > .6) return "metal";
  if (a / mx > .6) return "steel";
  if (m / mx > .5) return "crystal";
  if (sp / mx > .5) return "leather";
  return r === "Tank" ? "metal" : r === "DPS" ? "steel" : "cloth";
}

export function genPx(tier: TierDef, it: string, stats: Record<string, number>, pal: string[], ti: number): { pixels: Array<{ r: number; c: number; color: string }>; palette: string[] } {
  const g = tier.gs, role = IA[it].role, mat = getMat(stats, role), pl = pal.length, dl = tier.dl, px: Array<{ r: number; c: number; color: string }> = [];
  const defN = Math.max(0, stats.DEF || 0) / Math.max(TB[ti] * .5, 1),
        atkN = Math.max(0, stats.ATK || 0) / Math.max(TB[ti] * .5, 1),
        magN = Math.max(0, stats.MAG || 0) / Math.max(TB[ti] * .4, 1),
        crtN = Math.max(0, stats.CRT || 0) / Math.max(TB[ti] * .4, 1);
  void atkN; void crtN;
  function sh(nr: number, nc: number, bn: number) {
    let f = bn * .4 + matShade(mat, nr, nc, g) * .6;
    if (dl > 0) f += ((Math.round(nr * g) + Math.round(nc * g)) % 2) * dl * .08 - dl * .04;
    return pal[Math.min(pl - 1, Math.max(0, Math.round(f * (pl - 1))))];
  }
  const ol = () => pal[0], hi = () => pal[pl - 1], ac = () => pal[Math.min(pl - 1, Math.floor(pl * .75))];

  switch (it) {
    case "Helmet": {
      const bul = role === "Tank" ? 1.15 : role === "DPS" ? .9 : 1;
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g, hw = (nr < .42 ? .35 + (nr - .1) * .3 : .42) * bul;
        if (nr < .1 || nr > .88 || Math.abs(nc - .5) > hw) continue;
        if (nr >= .55 && nr <= .78 && Math.abs(nc - .5) < .18) continue;
        const ie = Math.abs(nc - .5) > hw - .08 || nr < .14 || nr > .84;
        if (ie) { px.push({ r, c, color: ol() }); continue; }
        if (role === "Tank" && nr < .3 && Math.abs(nc - .5) < .04) { px.push({ r, c, color: ac() }); continue; }
        if (role === "DPS" && nr < .18 && Math.abs(nc - .5) < .06 * (1 - nr * 4)) { px.push({ r, c, color: hi() }); continue; }
        if (magN > .4 && nr > .45 && nr < .52 && Math.abs(nc - .5) < .06) { px.push({ r, c, color: hi() }); continue; }
        if (defN > .5 && nr > .35 && nr < .55 && (Math.abs(nc - .28) < .03 || Math.abs(nc - .72) < .03)) { px.push({ r, c, color: hi() }); continue; }
        px.push({ r, c, color: sh(nr, nc, .55 + (.5 - nr) * .4) });
      } break;
    }
    case "Chestplate": {
      const w = role === "Tank" ? .48 : role === "DPS" ? .38 : .42;
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .05 || nr > .92) continue;
        if (nr < .14 && Math.abs(nc - .5) < .1) continue;
        const tw = nr > .6 ? w - (nr - .6) * .3 : nr < .14 ? w + .06 : w, ww = Math.max(.1, tw);
        if (Math.abs(nc - .5) > ww) continue;
        const ie = Math.abs(nc - .5) > ww - .06 || nr < .08 || nr > .88;
        if (ie) { px.push({ r, c, color: ol() }); continue; }
        if (Math.abs(nc - .5) < .03 && nr > .15 && nr < .75) { px.push({ r, c, color: sh(nr, nc, .35) }); continue; }
        if (mat === "metal" && (Math.abs(nr - .35) < .02 || Math.abs(nr - .55) < .02)) { px.push({ r, c, color: sh(nr, nc, .3) }); continue; }
        if (magN > .4 && nr > .28 && nr < .36 && Math.abs(nc - .5) < .06) { px.push({ r, c, color: hi() }); continue; }
        px.push({ r, c, color: sh(nr, nc, .5 + (.5 - nr) * .3) });
      } break;
    }
    case "Shield": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .06) continue;
        const mw = role === "Tank" ? .46 : .38, tp = nr > .5 ? (nr - .5) / .5 * mw : 0, w = mw - tp;
        if (w <= 0 || Math.abs(nc - .5) > w) continue;
        const ie = Math.abs(nc - .5) > w - .06 || nr < .1;
        if (ie) { px.push({ r, c, color: ol() }); continue; }
        if (role === "Tank" && (Math.abs(nc - .5) < .04 || (nr > .3 && nr < .38))) { px.push({ r, c, color: ac() }); continue; }
        px.push({ r, c, color: sh(nr, nc, .55 + (.5 - nr) * .2) });
      } break;
    }
    case "Sword": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .58) { const bw = .07; if (Math.abs(nc - .5) > bw) continue; if (nr < .04) { px.push({ r, c, color: hi() }); continue; } px.push({ r, c, color: sh(nr, nc, .7 - nr * .3) }); continue; }
        if (nr <= .65) { if (Math.abs(nc - .5) > .22) continue; px.push({ r, c, color: sh(nr, nc, .45) }); continue; }
        if (nr <= .88 && Math.abs(nc - .5) < .05) { px.push({ r, c, color: sh(nr, nc, .3) }); continue; }
        if (nr > .88 && nr <= .95 && Math.abs(nc - .5) < .07) px.push({ r, c, color: sh(nr, nc, .5) });
      } break;
    }
    case "Axe": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr >= .15 && nr <= .92 && Math.abs(nc - .45) < .04) { px.push({ r, c, color: sh(nr, nc, .3) }); continue; }
        if (nr < .48 && nr > .05) { const bW = .3 * Math.sin((nr - .05) / .43 * Math.PI); if (nc > .48 && nc < .48 + bW) { px.push({ r, c, color: sh(nr, nc, .6 + (nc - .48) / bW * .3) }); } }
      } break;
    }
    case "Spear": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .22) { const tw = .14 * (1 - nr / .22); if (Math.abs(nc - .5) <= tw) px.push({ r, c, color: nr < .03 ? hi() : sh(nr, nc, .7 - nr) }); continue; }
        if (nr >= .22 && nr < .28 && Math.abs(nc - .5) < .06) { px.push({ r, c, color: sh(nr, nc, .4) }); continue; }
        if (nr <= .95 && Math.abs(nc - .5) < .03) px.push({ r, c, color: sh(nr, nc, .28) });
      } break;
    }
    case "Dagger": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .12 || nr > .88) continue;
        if (nr < .48) { const bw = .05 + (1 - nr / .48) * .06; if (Math.abs(nc - .5) <= bw) px.push({ r, c, color: nr < .16 ? hi() : sh(nr, nc, .65 - nr * .3) }); continue; }
        if (nr <= .55 && Math.abs(nc - .5) <= .16) { px.push({ r, c, color: sh(nr, nc, .4) }); continue; }
        if (nr <= .82 && Math.abs(nc - .5) < .04) { px.push({ r, c, color: sh(nr, nc, .25) }); continue; }
        if (nr > .82 && Math.abs(nc - .5) < .06) px.push({ r, c, color: sh(nr, nc, .45) });
      } break;
    }
    case "Staff": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .18) { const d = Math.sqrt((nc - .5) ** 2 + (nr - .1) ** 2); if (d <= .12) px.push({ r, c, color: d > .08 ? ol() : sh(nr, nc, .5 + (1 - d / .12) * .5) }); continue; }
        if (nr >= .14 && nr < .22 && (Math.abs(nc - .42) < .03 || Math.abs(nc - .58) < .03)) { px.push({ r, c, color: sh(nr, nc, .35) }); continue; }
        if (nr >= .2 && nr <= .95 && Math.abs(nc - .5) < .03) px.push({ r, c, color: role === "Support" && Math.abs(nr % .1) < .02 && nr > .3 ? ac() : sh(nr, nc, .28) });
      } break;
    }
    case "Bow": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g, d = Math.sqrt((nr - .5) ** 2 + (nc - .4) ** 2);
        if (d >= .34 && d <= .42 && nc <= .55) { px.push({ r, c, color: sh(nr, nc, .35) }); continue; }
        if (Math.abs(nc - .58) < .02 && nr > .15 && nr < .85) { px.push({ r, c, color: sh(nr, nc, .2) }); continue; }
        if (Math.abs(nr - .5) < .015 && nc > .45 && nc < .85) px.push({ r, c, color: nc > .78 ? ac() : sh(nr, nc, .25) });
      } break;
    }
    case "Gauntlets": {
      const hw = role === "Tank" ? .16 : .12;
      [.25, .75].forEach(cx => {
        for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
          const nr = r / g, nc = c / g;
          if (nr < .1 || nr > .9) continue;
          let w = hw; if (nr > .75) w = hw + (nr - .75) * .4;
          if (Math.abs(nc - cx) > w) continue;
          const ie = Math.abs(nc - cx) > w - .05 || nr < .13 || nr > .87;
          if (ie) { px.push({ r, c, color: ol() }); continue; }
          px.push({ r, c, color: sh(nr, nc, .5 + (.5 - nr) * .2) });
        }
      }); break;
    }
    case "Leggings": {
      for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
        const nr = r / g, nc = c / g;
        if (nr < .05 || nr > .95) continue;
        if (nr < .25) { if (Math.abs(nc - .5) <= .38) px.push({ r, c, color: nr < .14 ? sh(nr, nc, .35) : sh(nr, nc, .5) }); continue; }
        const lw = Math.max(.06, .13 - (nr - .25) * .05);
        if (Math.abs(nc - .35) < lw || Math.abs(nc - .65) < lw) px.push({ r, c, color: sh(nr, nc, .45 + (.6 - nr) * .2) });
      } break;
    }
    case "Boots": {
      [.32, .68].forEach(cx => {
        for (let r = 0; r < g; r++) for (let c = 0; c < g; c++) {
          const nr = r / g, nc = c / g;
          if (nr < .15 || nr > .95) continue;
          let w = .1; if (nr > .7) w = .1 + (nr - .7) * .5; if (nr > .85) w = .18;
          if (Math.abs(nc - cx) <= w) px.push({ r, c, color: Math.abs(nc - cx) > w - .04 || nr < .18 || nr > .93 ? ol() : sh(nr, nc, .4 + (.7 - nr) * .15) });
        }
      }); break;
    }
  }
  return { pixels: px, palette: pal };
}

export function roll(): number {
  const r = Math.random();
  let c = 0;
  for (let i = 0; i < TIERS.length; i++) { c += TIERS[i].dr; if (r < c) return i; }
  return 0;
}

// ═══ STAT TRANSLATION ═══
// Converts game stats (dm/ar/hp/as/sp/xp) → Forge stats (ATK/DEF/HP/CRT/SPD/LCK)
// Used client-side to derive pixel art appearance from actual game stat values.
export function translateGameStats(
  stat: string, val: number, rarity: number,
  bonusStat?: string, bonusVal?: number,
): Record<string, number> {
  const s: Record<string, number> = { DEF: 0, HP: 0, ATK: 0, CRT: 0, MAG: 0, SPD: 0, LCK: 0 };
  function map(st: string, v: number) {
    switch (st) {
      case 'dm': s.ATK = Math.max(s.ATK, Math.round(v * 8)); break;
      case 'ar': s.DEF = Math.max(s.DEF, Math.round(v * 400)); break;
      case 'hp': s.HP  = Math.max(s.HP,  Math.round(v * 3)); break;
      case 'as': s.CRT = Math.max(s.CRT, Math.round(v * 400)); break;
      case 'sp': s.SPD = Math.max(s.SPD, Math.round(v * 400)); break;
      case 'xp': s.LCK = Math.max(s.LCK, Math.round(v * 80)); break;
    }
  }
  map(stat, val);
  if (bonusStat && bonusVal !== undefined) map(bonusStat, bonusVal);
  void rarity;
  return s;
}

// ═══ PALETTE LOOKUP ═══
export function findPaletteByGame(gameName: string): { game: string; colors: string[]; accent: string; mod: any } | null {
  for (const tierGames of Object.values(GP)) {
    const found = tierGames.find(g => g.game === gameName);
    if (found) return found;
  }
  return null;
}

// Item type options per game slot (for client-side use when server itemType not available)
export const SLOT_ITEM_TYPES: Record<string, string[]> = {
  weapon:  ['Sword', 'Axe', 'Spear', 'Dagger', 'Staff', 'Bow'],
  head:    ['Helmet'],
  chest:   ['Chestplate'],
  hands:   ['Gauntlets'],
  feet:    ['Boots', 'Leggings'],
  trinket: ['Shield'],
};

// Pick item type for slot deterministically from a 0–1 value
export function pickItemType(slot: string, rand: number): string {
  const types = SLOT_ITEM_TYPES[slot] ?? ['Sword'];
  return types[Math.floor(rand * types.length)];
}
