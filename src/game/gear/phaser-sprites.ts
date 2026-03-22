// phaser-sprites.ts — Phaser texture baking for pixel art sprites and items.
// Bridges sprite-system.ts + pixel-gear.ts into Phaser textures.

import Phaser from 'phaser';
import { charSprite, gearOverlay, SPRITE_SIZE, LAYER_ORDER } from './sprite-system';
import { genPx, TIERS, findPaletteByGame, translateGameStats, rarityToForgeTier, IA } from './pixel-gear';

const DIRS = ["down", "up", "left", "right"];
const FRAMES_PER_DIR = 2;
export const SPRITE_SCALE = 3;
export const FRAME_WIDTH  = SPRITE_SIZE * SPRITE_SCALE; // 48px
export const ATLAS_WIDTH  = DIRS.length * FRAMES_PER_DIR * FRAME_WIDTH; // 384px

// Map atlas frame index from dir + frame
export function getFrameIndex(dir: string, frame: number): number {
  const dirIdx = DIRS.indexOf(dir);
  if (dirIdx === -1) return 0;
  return dirIdx * FRAMES_PER_DIR + frame;
}

// Equipped gear descriptor for baking
export interface EquippedPxItem {
  itemType: string;    // e.g. 'Sword', 'Helmet'
  paletteGame: string; // e.g. 'SLSO8'
  rarity: number;      // 0–5 (game rarity → forge tier via rarityToForgeTier)
}

// Compute a stable cache key for a race+equipped combo
export function equippedHash(race: string, equipped: EquippedPxItem[]): string {
  const parts = equipped.map(e => `${e.itemType}:${e.paletteGame}:${e.rarity}`).sort().join('|');
  return `px_${race}_${parts}`;
}

// Bake an 8-frame sprite atlas texture into Phaser's texture cache.
// key:      texture key (use equippedHash result)
// race:     player race for skin color
// equipped: items to overlay (only those with non-empty itemType/paletteGame)
export function bakePlayerTexture(
  scene: Phaser.Scene,
  key: string,
  race: string,
  equipped: EquippedPxItem[],
): void {
  // Remove stale texture if it exists
  if (scene.textures.exists(key)) scene.textures.remove(key);

  const canvas = document.createElement('canvas');
  canvas.width  = ATLAS_WIDTH;
  canvas.height = FRAME_WIDTH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Resolve palettes for equipped items
  const equippedWithPalettes = equipped
    .filter(e => e.itemType && e.paletteGame && IA[e.itemType])
    .map(e => ({
      itemType: e.itemType,
      palette:  findPaletteByGame(e.paletteGame)?.colors ?? [],
    }))
    .filter(e => e.palette.length > 0);

  DIRS.forEach((dir, di) => {
    for (let frame = 0; frame < FRAMES_PER_DIR; frame++) {
      const frameIdx = di * FRAMES_PER_DIR + frame;
      const ox = frameIdx * FRAME_WIDTH; // x offset in atlas

      // Base character
      const grid = charSprite(dir, frame, race);
      for (let r = 0; r < SPRITE_SIZE; r++) {
        for (let c = 0; c < SPRITE_SIZE; c++) {
          const color = grid[r][c];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(ox + c * SPRITE_SCALE, r * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
          }
        }
      }

      // Gear overlays in layer order
      LAYER_ORDER.forEach(layerType => {
        const item = equippedWithPalettes.find(e => e.itemType === layerType);
        if (!item) return;
        const overlay = gearOverlay(item.itemType, dir, frame, item.palette);
        overlay.forEach(({ r, c, color }) => {
          // Allow slight overflow for weapon/shield pixels (up to +4 cols)
          if (r >= 0 && r < SPRITE_SIZE + 2 && c >= 0 && c < SPRITE_SIZE + 4) {
            ctx.fillStyle = color;
            ctx.fillRect(ox + c * SPRITE_SCALE, r * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
          }
        });
      });
    }
  });

  // Register as Phaser texture with per-frame data
  const texture = scene.textures.addCanvas(key, canvas);
  if (texture) {
    for (let i = 0; i < DIRS.length * FRAMES_PER_DIR; i++) {
      texture.add(i, 0, i * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_WIDTH);
    }
  }
}

// Render an item's pixel art to an offscreen HTMLCanvasElement.
// Returns null if itemType or paletteGame are missing/unknown (legacy item).
export function renderItemCardToCanvas(
  itemType: string,
  paletteGame: string,
  rarity: number,
  stat: string,
  val: number,
  bonusStat: string,
  bonusVal: number,
): HTMLCanvasElement | null {
  if (!itemType || !paletteGame) return null;
  if (!IA[itemType]) return null;

  const forgeTier = rarityToForgeTier(rarity);
  const tier = TIERS[forgeTier];
  const paletteEntry = findPaletteByGame(paletteGame);
  if (!paletteEntry) return null;

  const forgeStats = translateGameStats(stat, val, rarity, bonusStat || undefined, bonusVal || undefined);
  const { pixels } = genPx(tier, itemType, forgeStats, paletteEntry.colors, forgeTier);

  const gs    = tier.gs;
  const scale = Math.max(1, Math.floor(36 / gs));
  const canvas = document.createElement('canvas');
  canvas.width  = gs * scale;
  canvas.height = gs * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  pixels.forEach(({ r, c, color }) => {
    ctx.fillStyle = color;
    ctx.fillRect(c * scale, r * scale, scale, scale);
  });

  return canvas;
}

// Bake a ground-item card as a Phaser texture.
// key: texture key (e.g. `item_card_${itemId}`)
// Returns false if pixel art is unavailable (legacy item — caller should use emoji).
export function bakeGroundItemTexture(
  scene: Phaser.Scene,
  key: string,
  itemType: string,
  paletteGame: string,
  rarity: number,
  stat: string,
  val: number,
  bonusStat: string,
  bonusVal: number,
): boolean {
  const canvas = renderItemCardToCanvas(itemType, paletteGame, rarity, stat, val, bonusStat, bonusVal);
  if (!canvas) return false;

  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
  return true;
}
