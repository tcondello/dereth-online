// boss-renderer.ts — Dynamic canvas renderer for the Hydra boss.
// Creates a 64×64 HTMLCanvasElement (32×32 grid at 2× pixel scale),
// registers it as a Phaser texture, and refreshes it every frame.

import Phaser from 'phaser';
import {
  drawHydraFrame,
  makeGrid32,
  type Grid32,
  type HydraState,
} from './hydra-sprites';

const GRID = 32;          // logical pixels
const SCALE = 2;          // display scale — canvas is GRID*SCALE × GRID*SCALE
const CANVAS_SIZE = GRID * SCALE; // 64

// Milliseconds per animation tick (matches ~60fps tick cadence)
const MS_PER_TICK = 16.67;

// ── State-transition helpers ──────────────────────────────────────────────────

/**
 * Parse mechState string "hydra:XXXX:P" into HydraState.
 * Returns null if the string isn't a hydra mechState.
 */
export function parseMechState(mechState: string): HydraState | null {
  if (!mechState.startsWith('hydra:')) return null;
  const parts = mechState.split(':');
  if (parts.length < 3) return null;
  const mask = parts[1]; // e.g. "1011"
  const phase = parseInt(parts[2], 10);
  const heads = mask.split('').map(ch => ch === '1');
  return { heads, phase };
}

type AnimKey =
  | 'idle' | 'move' | 'hurt' | 'death'
  | 'venom_spit' | 'head_sever' | 'regrow' | 'enrage';

// ── BossRenderer ─────────────────────────────────────────────────────────────

export class BossRenderer {
  private scene: Phaser.Scene;
  readonly textureKey: string;

  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;

  private tick = 0;
  private tickAccum = 0;

  private animKey: AnimKey = 'idle';
  private animTick = 0;          // tick within current animation
  private animDone = false;

  private hydraState: HydraState = { heads: [true, true, true, true], phase: 0 };
  private prevMechState = '';

  constructor(scene: Phaser.Scene, textureKey: string) {
    this.scene = scene;
    this.textureKey = textureKey;

    // Create the offscreen canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('BossRenderer: failed to get 2d context');
    this.ctx2d = ctx;

    // Register as a Phaser texture
    if (scene.textures.exists(textureKey)) {
      scene.textures.remove(textureKey);
    }
    scene.textures.addCanvas(textureKey, this.canvas);

    // Crisp pixels
    const tex = scene.textures.get(textureKey);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Call every game frame. delta = ms since last frame. */
  update(delta: number): void {
    this.tickAccum += delta;
    while (this.tickAccum >= MS_PER_TICK) {
      this.tickAccum -= MS_PER_TICK;
      this.advanceTick();
    }
    this.render();
  }

  /**
   * Feed the latest mechState string from the server.
   * Compares against previous state to trigger sever / regrow / enrage transitions.
   */
  applyMechState(mechState: string): void {
    if (mechState === this.prevMechState) return;

    const newSt = parseMechState(mechState);
    if (!newSt) return;

    const old = this.hydraState;

    // Detect phase transition 0→1 → enrage anim
    if (old.phase === 0 && newSt.phase === 1) {
      this.playAnim('enrage');
    }

    // Detect per-head transitions
    for (let i = 0; i < newSt.heads.length; i++) {
      const wasAlive = i < old.heads.length ? old.heads[i] : true;
      const isAlive = newSt.heads[i];

      if (wasAlive && !isAlive) {
        // Head just severed
        this.hydraState = { ...newSt, severTarget: i };
        this.prevMechState = mechState;
        this.playAnim('head_sever');
        return;
      }
      if (!wasAlive && isAlive) {
        // Head just regrew
        this.hydraState = { ...newSt, regrowTarget: i };
        this.prevMechState = mechState;
        this.playAnim('regrow');
        return;
      }
    }

    this.hydraState = newSt;
    this.prevMechState = mechState;
  }

  /** Trigger the hurt flash (called when boss takes damage). */
  playHurt(): void {
    this.playAnim('hurt');
  }

  /** Trigger death animation. */
  playDeath(): void {
    this.playAnim('death');
  }

  /** Trigger venom spit animation. */
  playVenomSpit(): void {
    this.playAnim('venom_spit');
  }

  /** Set movement state (idle vs move). Only switches if not in an overriding anim. */
  setMoving(moving: boolean): void {
    if (this.isOverridingAnim()) return;
    const want: AnimKey = moving ? 'move' : 'idle';
    if (this.animKey !== want) this.playAnim(want);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private playAnim(key: AnimKey): void {
    this.animKey = key;
    this.animTick = 0;
    this.animDone = false;
  }

  /** Returns true for one-shot anims that shouldn't be interrupted mid-play. */
  private isOverridingAnim(): boolean {
    if (this.animDone) return false;
    return (
      this.animKey === 'head_sever' ||
      this.animKey === 'regrow' ||
      this.animKey === 'hurt' ||
      this.animKey === 'death' ||
      this.animKey === 'enrage'
    );
  }

  private animDurations: Record<AnimKey, number> = {
    idle: 120, move: 120, hurt: 20, death: 80,
    venom_spit: 40, head_sever: 50, regrow: 60, enrage: 45,
  };

  private animLoops: Record<AnimKey, boolean> = {
    idle: true, move: true, hurt: false, death: false,
    venom_spit: true, head_sever: false, regrow: false, enrage: true,
  };

  private advanceTick(): void {
    this.tick++;
    this.animTick++;

    const dur = this.animDurations[this.animKey];
    const loops = this.animLoops[this.animKey];

    if (this.animTick >= dur) {
      if (loops) {
        this.animTick = 0;
      } else {
        this.animTick = dur - 1;
        this.animDone = true;
        // After one-shot finishes, return to idle (or move)
        if (this.animKey !== 'death') {
          this.playAnim('idle');
        }
      }
    }
  }

  private render(): void {
    const g: Grid32 = makeGrid32();

    drawHydraFrame(g, this.animKey, this.animTick, this.hydraState);

    // Paint grid → canvas at SCALE×
    const imageData = this.ctx2d.createImageData(CANVAS_SIZE, CANVAS_SIZE);
    const data = imageData.data;

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const hex = g[row][col];
        if (!hex) continue;
        const [r, g2, b] = hexToRgb(hex);
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            const px = ((row * SCALE + sy) * CANVAS_SIZE + (col * SCALE + sx)) * 4;
            data[px]     = r;
            data[px + 1] = g2;
            data[px + 2] = b;
            data[px + 3] = 255;
          }
        }
      }
    }

    this.ctx2d.putImageData(imageData, 0, 0);

    // Re-upload the canvas pixels to the GPU texture
    const tex = this.scene.textures.get(this.textureKey);
    // Phaser's CanvasTexture exposes refresh(); cast via any since the generic
    // Texture type doesn't expose it but CanvasTexture does.
    (tex as any).refresh?.();
  }

  destroy(): void {
    if (this.scene.textures.exists(this.textureKey)) {
      this.scene.textures.remove(this.textureKey);
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

const hexCache = new Map<string, [number, number, number]>();

function hexToRgb(hex: string): [number, number, number] {
  const cached = hexCache.get(hex);
  if (cached) return cached;
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const result: [number, number, number] = [r, g, b];
  hexCache.set(hex, result);
  return result;
}
