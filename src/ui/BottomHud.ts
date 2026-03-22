// BottomHud — Diablo-style bottom bar.
// Left:   Red HP orb (liquid fill) + armor rating + level/xp.
// Center: 6 gear-slot icons with rarity borders.
// Right:  Minimap canvas (HTML canvas, drawn every frame).

import type { ItemData } from './HubScreen';
import { renderItemCardToCanvas } from '../game/gear/phaser-sprites';

const MINIMAP_PX = 96;          // canvas side length (circle = 96px diameter)
const MINIMAP_R  = MINIMAP_PX / 2;
const WORLD_R    = 600;         // awareness radius in world units
const MM_SCALE   = MINIMAP_R / WORLD_R;
const TICK_LEN   = 10;

const GEAR_SLOTS  = ['weapon', 'head', 'chest', 'hands', 'feet', 'trinket'] as const;
const SLOT_LABEL: Record<string, string> = {
  weapon: 'W', head: 'H', chest: 'C', hands: 'G', feet: 'F', trinket: 'T',
};
const RARITY_HEX = ['#555555', '#2a8a2a', '#4488ee', '#aa44ee', '#ee9922', '#ffd700'];

export class BottomHud {
  private el:      HTMLElement;
  private hpFill:  HTMLElement;
  private hpText:  HTMLElement;
  private armorEl: HTMLElement;
  private levelEl: HTMLElement;
  private slotEls  = new Map<string, HTMLElement>();
  private mmCanvas: HTMLCanvasElement;
  private mmCtx:   CanvasRenderingContext2D;
  private mmActive = true;
  private mmLastDraw = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'bottom-hud';
    this.el.style.cssText = `
      display:none; position:fixed; bottom:0; left:0; right:0; height:100px;
      z-index:450; box-sizing:border-box;
      background:linear-gradient(180deg,#0d0a14 0%,#080608 100%);
      border-top:2px solid #1e140a;
      font-family:Georgia,serif; color:#c9a96e;
      align-items:center; padding:0 16px;
    `;
    this.el.innerHTML = this.buildHTML();
    document.body.appendChild(this.el);

    this.hpFill  = document.getElementById('bhud-hp-fill')!;
    this.hpText  = document.getElementById('bhud-hp-text')!;
    this.armorEl = document.getElementById('bhud-armor')!;
    this.levelEl = document.getElementById('bhud-level')!;
    for (const s of GEAR_SLOTS) {
      this.slotEls.set(s, document.getElementById(`bhud-slot-${s}`)!);
    }
    this.mmCanvas = document.getElementById('bhud-mm') as HTMLCanvasElement;
    this.mmCtx    = this.mmCanvas.getContext('2d')!;
  }

  private buildHTML(): string {
    const slots = GEAR_SLOTS.map(s => `
      <div id="bhud-slot-${s}"
        style="width:50px;height:50px;background:#090710;border:1px solid #2a2033;
               border-radius:3px;display:flex;align-items:center;justify-content:center;
               font-size:18px;flex-shrink:0;position:relative;">
        <span style="font-size:8px;color:#3a2520">${SLOT_LABEL[s]}</span>
      </div>`).join('');

    return `
      <!-- LEFT: HP orb + stats -->
      <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;width:210px">
        <!-- Liquid HP orb -->
        <div style="position:relative;width:80px;height:80px;border-radius:50%;flex-shrink:0;
                    background:#110000;border:2px solid #3a1010;overflow:hidden;
                    box-shadow:0 0 16px rgba(180,20,0,.5),inset 0 0 12px rgba(0,0,0,.7)">
          <div id="bhud-hp-fill"
            style="position:absolute;bottom:0;left:0;right:0;height:100%;
                   background:radial-gradient(ellipse at 50% 115%,#ee2200 0%,#991100 55%,#220000 100%);
                   transition:height .1s ease;"></div>
          <div id="bhud-hp-text"
            style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                   font-size:9px;color:#fff;white-space:nowrap;z-index:1;
                   text-shadow:0 0 4px #000,0 0 8px #000;">--/--</div>
        </div>
        <!-- Armor + level -->
        <div style="display:flex;flex-direction:column;gap:6px">
          <div id="bhud-armor"
            style="font-size:11px;color:#c9a96e;letter-spacing:1px">AR 0%</div>
          <div id="bhud-level"
            style="font-size:9px;color:#887755;">Lv 1</div>
        </div>
      </div>

      <!-- DIVIDER -->
      <div style="width:1px;height:64px;background:#1e140a;margin:0 14px;flex-shrink:0"></div>

      <!-- CENTER: gear slots -->
      <div style="display:flex;gap:6px;align-items:center;justify-content:center;flex:1">
        ${slots}
      </div>

      <!-- DIVIDER -->
      <div style="width:1px;height:64px;background:#1e140a;margin:0 14px;flex-shrink:0"></div>

      <!-- RIGHT: minimap -->
      <div style="flex-shrink:0;display:flex;align-items:center;justify-content:center;
                  width:110px">
        <div style="position:relative;width:${MINIMAP_PX}px;height:${MINIMAP_PX}px">
          <canvas id="bhud-mm" width="${MINIMAP_PX}" height="${MINIMAP_PX}"
            style="border-radius:50%;border:1.5px solid #aa9060;display:block;
                   box-shadow:0 0 10px rgba(170,144,96,.35)"></canvas>
          <div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);
                      font-size:7px;color:#aa9060;pointer-events:none;
                      font-family:Georgia,serif">N</div>
        </div>
      </div>`;
  }

  // ── HP orb ──────────────────────────────────────────────────────────────────

  updateHp(current: number, max: number) {
    const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
    this.hpFill.style.height = `${Math.round(pct * 100)}%`;
    this.hpText.textContent  = `${current}/${max}`;
  }

  // ── Armor ───────────────────────────────────────────────────────────────────

  updateArmor(armorDecimal: number) {
    this.armorEl.textContent = `AR ${Math.round(armorDecimal * 100)}%`;
  }

  // ── Level / XP ──────────────────────────────────────────────────────────────

  updateLevel(level: number, unspentXp: number) {
    this.levelEl.textContent = unspentXp > 0
      ? `Lv ${level}  ·  ${unspentXp} XP`
      : `Lv ${level}`;
  }

  // ── Gear slots ──────────────────────────────────────────────────────────────

  updateGear(equipped: ItemData[]) {
    const armorTotal = equipped.reduce((sum, it) =>
      sum + (it.stat === 'ar' ? it.val : 0) + (it.bonusStat === 'ar' ? it.bonusVal : 0), 0);
    this.updateArmor(armorTotal);

    for (const slot of GEAR_SLOTS) {
      const el = this.slotEls.get(slot);
      if (!el) continue;
      const item = equipped.find(e => e.slot === slot);
      if (item) {
        const col = RARITY_HEX[item.rarity] ?? '#555';
        el.style.borderColor = col;
        el.style.background  = `${col}22`;
        el.title             = item.itemName;
        el.innerHTML         = itemPixelHTML(item);
      } else {
        el.style.borderColor = '#2a2033';
        el.style.background  = '#090710';
        el.title             = '';
        el.innerHTML         = `<span style="font-size:8px;color:#3a2520">${SLOT_LABEL[slot]}</span>`;
      }
    }
    paintPixelSlots(this.el);
  }

  // ── Minimap ─────────────────────────────────────────────────────────────────

  updateMinimap(
    myX: number,
    myY: number,
    enemies:      Array<{ x: number; y: number; isBoss: boolean }>,
    otherPlayers: Array<{ x: number; y: number }>,
    portals:      Array<{ x: number; y: number }> = [],
  ) {
    if (!this.mmActive) return;
    const now = performance.now();
    if (now - this.mmLastDraw < 67) return; // ~15 fps throttle
    this.mmLastDraw = now;
    const ctx = this.mmCtx;
    const cx  = MINIMAP_R;
    const cy  = MINIMAP_R;

    ctx.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);

    // ── Clipped interior ───────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, MINIMAP_R - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(5,4,18,0.97)';
    ctx.fillRect(0, 0, MINIMAP_PX, MINIMAP_PX);

    // Inner ring
    ctx.strokeStyle = 'rgba(42,40,60,0.55)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, MINIMAP_R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(42,40,60,0.30)';
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(MINIMAP_PX, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, MINIMAP_PX);
    ctx.stroke();

    // Cardinal ticks
    ctx.strokeStyle = 'rgba(80,70,40,0.7)';
    for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      const ix = cx + Math.cos(a) * (MINIMAP_R - 6);
      const iy = cy + Math.sin(a) * (MINIMAP_R - 6);
      const ox = cx + Math.cos(a) * (MINIMAP_R - 1);
      const oy = cy + Math.sin(a) * (MINIMAP_R - 1);
      ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ox, oy); ctx.stroke();
    }

    // Track closest out-of-range
    let closestEnemyDist  = Infinity, closestEnemyAngle  = 0, closestEnemyBoss = false;
    let closestPlayerDist = Infinity, closestPlayerAngle = 0;

    for (const e of enemies) {
      const dx = e.x - myX, dy = e.y - myY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= WORLD_R) {
        ctx.fillStyle = e.isBoss ? '#ff8800' : '#ee3333';
        ctx.beginPath();
        ctx.arc(cx + dx * MM_SCALE, cy + dy * MM_SCALE, e.isBoss ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (d < closestEnemyDist) {
        closestEnemyDist  = d;
        closestEnemyAngle = Math.atan2(dy, dx);
        closestEnemyBoss  = e.isBoss;
      }
    }

    for (const p of otherPlayers) {
      const dx = p.x - myX, dy = p.y - myY;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d <= WORLD_R) {
        ctx.fillStyle = '#44aaff';
        ctx.beginPath();
        ctx.arc(cx + dx * MM_SCALE, cy + dy * MM_SCALE, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (d < closestPlayerDist) {
        closestPlayerDist  = d;
        closestPlayerAngle = Math.atan2(dy, dx);
      }
    }

    // Portals — purple diamonds
    for (const p of portals) {
      const dx = p.x - myX, dy = p.y - myY;
      const mmX = cx + dx * MM_SCALE;
      const mmY = cy + dy * MM_SCALE;
      const s = 4; // half-size of diamond
      ctx.fillStyle = '#cc44ff';
      ctx.shadowColor = '#aa22ee';
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.moveTo(mmX,     mmY - s);
      ctx.lineTo(mmX + s, mmY);
      ctx.lineTo(mmX,     mmY + s);
      ctx.lineTo(mmX - s, mmY);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Self dot (always on top)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── Edge ticks outside clip ────────────────────────────────────────────
    if (enemies.length > 0 && closestEnemyDist > WORLD_R) {
      this.drawEdgeTick(ctx, cx, cy, closestEnemyAngle, closestEnemyBoss ? '#ff8800' : '#ee3333');
    }
    if (otherPlayers.length > 0 && closestPlayerDist > WORLD_R) {
      this.drawEdgeTick(ctx, cx, cy, closestPlayerAngle, '#44aaff');
    }
  }

  private drawEdgeTick(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    angle: number, color: string,
  ) {
    const r   = MINIMAP_R - 1;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + cos * (r - TICK_LEN), cy + sin * (r - TICK_LEN));
    ctx.lineTo(cx + cos * r,              cy + sin * r);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + cos * (r - 2), cy + sin * (r - 2), 2, 0, Math.PI * 2);
    ctx.fill();
  }

  setMinimapVisible(v: boolean) {
    this.mmActive = v;
    const wrapper = this.mmCanvas.parentElement as HTMLElement;
    wrapper.style.opacity = v ? '1' : '0.3';
    if (!v) {
      this.mmCtx.clearRect(0, 0, MINIMAP_PX, MINIMAP_PX);
      this.mmCtx.fillStyle = 'rgba(5,4,18,0.97)';
      this.mmCtx.beginPath();
      this.mmCtx.arc(MINIMAP_R, MINIMAP_R, MINIMAP_R - 1, 0, Math.PI * 2);
      this.mmCtx.fill();
    }
  }

  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }
}

// ── Pixel art slot helpers (mirrors InGamePanel pattern) ──────────────────────

function paintPixelSlots(container: HTMLElement) {
  container.querySelectorAll<HTMLCanvasElement>('.px-slot').forEach(cv => {
    const card = renderItemCardToCanvas(
      cv.dataset.it!, cv.dataset.pg!,
      parseInt(cv.dataset.ra!), cv.dataset.st!,
      parseFloat(cv.dataset.vl!), cv.dataset.bs || '',
      parseFloat(cv.dataset.bv || '0'),
    );
    if (card) {
      cv.width = card.width; cv.height = card.height;
      cv.getContext('2d')!.drawImage(card, 0, 0);
    }
  });
}

function itemPixelHTML(g: ItemData): string {
  if (g.itemType && g.paletteGame) {
    return `<canvas class="px-slot" data-it="${g.itemType}" data-pg="${g.paletteGame}" data-ra="${g.rarity}" data-st="${g.stat}" data-vl="${g.val}" data-bs="${g.bonusStat}" data-bv="${g.bonusVal}" style="image-rendering:pixelated;width:32px;height:32px;display:block"></canvas>`;
  }
  return `<span style="font-size:20px">${g.icon}</span>`;
}
