// Radar — 240px minimap/compass hybrid, top-right corner.
// Shows colored dots for entities within WORLD_R world units.
// Shows an edge tick for the closest enemy/player outside that range.
// Rendered entirely in Phaser (setScrollFactor 0), no HTML.

import Phaser from 'phaser';

export interface RadarEnemy  { x: number; y: number; isBoss: boolean; }
export interface RadarPlayer { x: number; y: number; }

const SCREEN_R  = 120;   // radar radius in pixels (240px diameter)
const WORLD_R   = 600;   // awareness radius in world units
const SCALE     = SCREEN_R / WORLD_R;
const TICK_LEN  = 14;    // edge-tick line length in px
const DEPTH     = 500;

export class Radar {
  private g:      Phaser.GameObjects.Graphics;
  private nText:  Phaser.GameObjects.Text;
  private active  = true;

  readonly cx: number;
  readonly cy: number;

  constructor(scene: Phaser.Scene) {
    const W  = scene.scale.width;
    this.cx  = W - 20 - SCREEN_R;
    this.cy  = 36 + 15 + SCREEN_R;   // 36px top bar + 15px gap + radius

    this.g = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(DEPTH);

    this.nText = scene.add.text(this.cx, this.cy - SCREEN_R + 6, 'N', {
      fontSize: '8px', color: '#aa9060',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 1);
  }

  update(
    myX: number,
    myY: number,
    enemies: RadarEnemy[],
    otherPlayers: RadarPlayer[],
  ) {
    const g = this.g;
    g.clear();

    if (!this.active) {
      this.nText.setVisible(false);
      return;
    }
    this.nText.setVisible(true);

    const { cx, cy } = this;

    // ── Background ───────────────────────────────────────────────────────────
    g.fillStyle(0x080614, 0.90);
    g.fillCircle(cx, cy, SCREEN_R);

    // Inner ring at 50% radius
    g.lineStyle(1, 0x2a2a3a, 0.55);
    g.strokeCircle(cx, cy, SCREEN_R * 0.5);

    // Crosshairs
    g.lineStyle(1, 0x2a2a3a, 0.30);
    g.lineBetween(cx - SCREEN_R, cy, cx + SCREEN_R, cy);
    g.lineBetween(cx, cy - SCREEN_R, cx, cy + SCREEN_R);

    // Cardinal tick marks (N/S/E/W)
    g.lineStyle(1, 0x3a3020, 0.7);
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const ix = cx + Math.cos(a) * (SCREEN_R - 6);
      const iy = cy + Math.sin(a) * (SCREEN_R - 6);
      const ox = cx + Math.cos(a) * SCREEN_R;
      const oy = cy + Math.sin(a) * SCREEN_R;
      g.lineBetween(ix, iy, ox, oy);
    }

    // Gold border
    g.lineStyle(1.5, 0xaa9060, 0.95);
    g.strokeCircle(cx, cy, SCREEN_R);

    // ── Self dot ─────────────────────────────────────────────────────────────
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, 4);

    // ── Entities ─────────────────────────────────────────────────────────────
    let closestEnemyDist  = Infinity, closestEnemyAngle  = 0, closestEnemyBoss = false;
    let closestPlayerDist = Infinity, closestPlayerAngle = 0;

    for (const e of enemies) {
      const dx = e.x - myX;
      const dy = e.y - myY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      if (d <= WORLD_R) {
        g.fillStyle(e.isBoss ? 0xff8800 : 0xee3333, 1);
        g.fillCircle(cx + dx * SCALE, cy + dy * SCALE, e.isBoss ? 4.5 : 2.5);
      }
      if (d < closestEnemyDist) {
        closestEnemyDist  = d;
        closestEnemyAngle = angle;
        closestEnemyBoss  = e.isBoss;
      }
    }

    for (const p of otherPlayers) {
      const dx = p.x - myX;
      const dy = p.y - myY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      if (d <= WORLD_R) {
        g.fillStyle(0x44aaff, 1);
        g.fillCircle(cx + dx * SCALE, cy + dy * SCALE, 3);
      }
      if (d < closestPlayerDist) {
        closestPlayerDist  = d;
        closestPlayerAngle = angle;
      }
    }

    // ── Edge ticks for out-of-range closest ──────────────────────────────────
    if (enemies.length > 0 && closestEnemyDist > WORLD_R) {
      this.drawEdgeTick(g, cx, cy, closestEnemyAngle, closestEnemyBoss ? 0xff8800 : 0xee3333);
    }
    if (otherPlayers.length > 0 && closestPlayerDist > WORLD_R) {
      this.drawEdgeTick(g, cx, cy, closestPlayerAngle, 0x44aaff);
    }
  }

  private drawEdgeTick(
    g: Phaser.GameObjects.Graphics,
    cx: number, cy: number,
    angle: number, color: number,
  ) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox  = cx + cos * SCREEN_R;
    const oy  = cy + sin * SCREEN_R;
    const ix  = cx + cos * (SCREEN_R - TICK_LEN);
    const iy  = cy + sin * (SCREEN_R - TICK_LEN);

    g.lineStyle(2.5, color, 1);
    g.lineBetween(ix, iy, ox, oy);
    g.fillStyle(color, 1);
    g.fillCircle(ox, oy, 2.5);
  }

  setVisible(v: boolean) {
    this.active = v;
    if (!v) { this.g.clear(); this.nText.setVisible(false); }
  }

  isVisible() { return this.active; }

  destroy() {
    this.g.destroy();
    this.nText.destroy();
  }
}
