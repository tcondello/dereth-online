// enemy-textures.ts — Phaser texture baking for enemy pixel art sprites.
// Same pattern as phaser-sprites.ts but for enemy archetypes.

import Phaser from 'phaser';
import { getEnemyGrid, ENEMY_ARCHETYPE } from './enemy-sprites';

const DIRS = ["down", "up", "left", "right"] as const;
const FRAMES_PER_DIR = 4; // full 4-frame walk cycle (matches creature-lab)
export const ENEMY_SPRITE_SIZE = 16;
export const ENEMY_SPRITE_SCALE = 2;
export const ENEMY_FRAME_SIZE = ENEMY_SPRITE_SIZE * ENEMY_SPRITE_SCALE; // 32px
export const ENEMY_ATLAS_WIDTH = DIRS.length * FRAMES_PER_DIR * ENEMY_FRAME_SIZE; // 512px

/** Map atlas frame index from dir + frame */
export function getEnemyFrameIndex(dir: string, frame: number): number {
  const dirIdx = DIRS.indexOf(dir as typeof DIRS[number]);
  if (dirIdx === -1) return 0;
  return dirIdx * FRAMES_PER_DIR + frame;
}

/**
 * Bake an 8-frame enemy sprite atlas into Phaser's texture cache.
 * @param scene  The Phaser scene to register the texture with
 * @param type   AC enemy type key (e.g. "drudge", "tusker")
 */
export function bakeEnemyTexture(scene: Phaser.Scene, type: string): void {
  const key = `enemy_${type}`;

  if (scene.textures.exists(key)) scene.textures.remove(key);

  const canvas = document.createElement('canvas');
  canvas.width = ENEMY_ATLAS_WIDTH;
  canvas.height = ENEMY_FRAME_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  DIRS.forEach((dir, di) => {
    for (let frame = 0; frame < FRAMES_PER_DIR; frame++) {
      const frameIdx = di * FRAMES_PER_DIR + frame;
      const ox = frameIdx * ENEMY_FRAME_SIZE;

      const grid = getEnemyGrid(type, frame, dir, "move");
      for (let r = 0; r < ENEMY_SPRITE_SIZE; r++) {
        for (let c = 0; c < ENEMY_SPRITE_SIZE; c++) {
          const color = grid[r][c];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(ox + c * ENEMY_SPRITE_SCALE, r * ENEMY_SPRITE_SCALE, ENEMY_SPRITE_SCALE, ENEMY_SPRITE_SCALE);
          }
        }
      }
    }
  });

  const texture = scene.textures.addCanvas(key, canvas);
  if (texture) {
    // Crisp pixel art — no bilinear interpolation
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const total = DIRS.length * FRAMES_PER_DIR;
    for (let i = 0; i < total; i++) {
      texture.add(i, 0, i * ENEMY_FRAME_SIZE, 0, ENEMY_FRAME_SIZE, ENEMY_FRAME_SIZE);
    }
  }
}

/** Bake textures for all known enemy types. Call once during preload/create. */
export function bakeAllEnemyTextures(scene: Phaser.Scene): void {
  for (const type of Object.keys(ENEMY_ARCHETYPE)) {
    bakeEnemyTexture(scene, type);
  }
}
