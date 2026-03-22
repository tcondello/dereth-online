// projectile-sprites.ts
// Pixel-art projectile textures for each weapon category.
// Call bakeProjectileTextures(scene) once in GameScene.create().

import Phaser from 'phaser';

export type WeaponCategory = 'staff' | 'bow' | 'spear' | 'sword' | 'axe' | 'dagger' | 'unarmed';

/** Map itemType string (from server) to a weapon category. */
export function getWeaponCategory(itemType: string): WeaponCategory {
  switch (itemType.toLowerCase()) {
    case 'staff':   return 'staff';
    case 'bow':     return 'bow';
    case 'spear':   return 'spear';
    case 'sword':   return 'sword';
    case 'axe':     return 'axe';
    case 'dagger':  return 'dagger';
    default:        return 'unarmed';
  }
}

/** True = projectile travels to target; false = melee flash at attack origin. */
export function isRanged(cat: WeaponCategory): boolean {
  return cat === 'staff' || cat === 'bow' || cat === 'spear';
}

/** Animation duration in ms for each category (travel or flash). */
export const TRAVEL_MS: Record<WeaponCategory, number> = {
  staff:   310,
  bow:     175,
  spear:   220,
  sword:   140,
  axe:     160,
  dagger:   95,
  unarmed: 120,
};

/** Phaser texture key for each weapon category's projectile. */
export function projKey(cat: WeaponCategory): string {
  return `__proj_${cat}`;
}

/** Impact particle colors (Phaser 0xRRGGBB) per category. */
export const IMPACT_COLORS: Record<WeaponCategory, number[]> = {
  staff:   [0xcc66ff, 0x9933cc, 0xeeccff, 0x7722aa],
  bow:     [0xeecc88, 0xaa8844, 0xffffff, 0xddbb66],
  spear:   [0xaabbcc, 0x6688aa, 0xddeeff, 0xffffff],
  sword:   [0xddeeff, 0x88aadd, 0xffffff, 0xbbccff],
  axe:     [0xff7722, 0xcc4400, 0xffaa44, 0xee8800],
  dagger:  [0xddddff, 0x9999cc, 0xffffff, 0xbbbbee],
  unarmed: [0xffdd88, 0xffaa00, 0xffffff, 0xffcc44],
};

/** Bake all projectile textures into the Phaser scene (idempotent). */
export function bakeProjectileTextures(scene: Phaser.Scene): void {
  const defs: [WeaponCategory, (cv: HTMLCanvasElement) => void][] = [
    ['staff',   drawStaffOrb],
    ['bow',     drawArrow],
    ['spear',   drawSpear],
    ['sword',   drawSwordSlash],
    ['axe',     drawAxeSwing],
    ['dagger',  drawDagger],
    ['unarmed', drawPunchFlash],
  ];
  for (const [cat, fn] of defs) {
    const key = projKey(cat);
    if (scene.textures.exists(key)) continue;
    const cv = document.createElement('canvas');
    fn(cv);
    scene.textures.addCanvas(key, cv);
  }
}

// ── Pixel art helpers ──────────────────────────────────────────────────────────

const S = 3; // pixel scale: each logical pixel = S×S canvas pixels

function px(
  cv: HTMLCanvasElement,
  rows: string[],
  pal: Record<string, string>,
): void {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  cv.width  = w * S;
  cv.height = h * S;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c === '.' || !pal[c]) continue;
      ctx.fillStyle = pal[c];
      ctx.fillRect(x * S, y * S, S, S);
    }
  }
}

// ── Sprite definitions ─────────────────────────────────────────────────────────

// Staff magic orb — 8×8, symmetric sphere with purple glow
function drawStaffOrb(cv: HTMLCanvasElement): void {
  px(cv, [
    '........',
    '..ABBA..',
    '.ABCCBA.',
    '.BCCCCB.',
    '.BCCCCB.',
    '.ABCCBA.',
    '..ABBA..',
    '........',
  ], {
    A: '#7722bb',  // outer purple glow
    B: '#bb55ff',  // mid ring
    C: '#eeccff',  // bright core
  });
}

// Arrow — 15×5, horizontal pointing right (rotated toward target at runtime)
function drawArrow(cv: HTMLCanvasElement): void {
  px(cv, [
    '...............',
    'f..............',
    'fAAAAAAAAABBBBC',
    'f..............',
    '...............',
  ], {
    f: '#cc9933',  // fletching
    A: '#7a3c10',  // dark wood shaft
    B: '#c07020',  // lighter head
    C: '#eeeebb',  // bright tip
  });
}

// Spear bolt — 13×3, thin fast bolt pointing right
function drawSpear(cv: HTMLCanvasElement): void {
  px(cv, [
    '.............',
    'AAAAAABBBBBCC',
    '.............',
  ], {
    A: '#7799aa',  // blue-gray shaft
    B: '#99bbcc',  // spearhead
    C: '#ffffff',  // bright tip
  });
}

// Sword slash — 10×10, vertical arc (perpendicular to attack direction)
// Rotated by attack angle at runtime; the arc appears as a blade sweep.
function drawSwordSlash(cv: HTMLCanvasElement): void {
  px(cv, [
    '....B.....',
    '....BB....',
    '...BBBBBA.',
    '..BBBBBBA.',
    '..BBBBBBA.',
    '..BBBBBBA.',
    '...BBBBBA.',
    '....BB....',
    '....B.....',
    '..........',
  ], {
    B: '#bbccff',  // pale silver-blue blade trail
    A: '#ffffff',  // bright edge gleam
  });
}

// Axe swing — 12×12, wider arc with orange-red color
function drawAxeSwing(cv: HTMLCanvasElement): void {
  px(cv, [
    '............',
    '......BB....',
    '.....BBBB...',
    '....BBBBBBA.',
    '...BBBBBBBA.',
    '..BBBBBBBBA.',
    '..BBBBBBBBA.',
    '...BBBBBBBA.',
    '....BBBBBBA.',
    '.....BBBB...',
    '......BB....',
    '............',
  ], {
    B: '#dd8833',  // orange axe trail
    A: '#ffffff',  // gleam
  });
}

// Dagger stab — 8×3, short fast horizontal blade pointing right
function drawDagger(cv: HTMLCanvasElement): void {
  px(cv, [
    '........',
    'AAAAABBc',
    '........',
  ], {
    A: '#888899',  // steel gray
    B: '#ccccdd',  // bright blade
    c: '#ffffff',  // point
  });
}

// Unarmed punch flash — 8×8, starburst impact
function drawPunchFlash(cv: HTMLCanvasElement): void {
  px(cv, [
    'A.....A.',
    '.B...B..',
    '..CDC...',
    '..DDD...',
    '..CDC...',
    '.B...B..',
    'A.....A.',
    '........',
  ], {
    A: '#ff8800',  // outer orange
    B: '#ffaa44',  // mid yellow-orange
    C: '#ffee88',  // inner glow
    D: '#ffffff',  // white hot center
  });
}
