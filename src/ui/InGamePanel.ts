// InGamePanel — right-side overlay openable at any time with [C]
// Shows equipped gear, backpack, attribute XP spend, and skill XP spend.

import type { CharacterState, ItemData } from './HubScreen';
import { renderItemCardToCanvas } from '../game/gear/phaser-sprites';

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
    return `<canvas class="px-slot" data-it="${g.itemType}" data-pg="${g.paletteGame}" data-ra="${g.rarity}" data-st="${g.stat}" data-vl="${g.val}" data-bs="${g.bonusStat}" data-bv="${g.bonusVal}" style="image-rendering:pixelated;width:30px;height:30px;display:block"></canvas>`;
  }
  return g.icon;
}

const GEAR_SLOT_ICONS: Record<string, string> = {
  weapon: '⚔️', head: '⛑️', chest: '🛡️', hands: '🧤', feet: '👢', trinket: '📿',
};
const GEAR_SLOT_NAMES: Record<string, string> = {
  weapon: 'Wpn', head: 'Helm', chest: 'Chst', hands: 'Hand', feet: 'Feet', trinket: 'Trnk',
};
const RARITY_COLORS = ['#7a7a7a', '#4a8a4a', '#4488ee', '#aa44ee', '#ee9922', '#ffd700'];
const RARITY_NAMES  = ['Scuffed', 'Serviceable', 'Quality', 'Superior', 'Exquisite', 'Atlan'];

const ATTRS = [
  { k: 'STR', n: 'Strength' }, { k: 'END', n: 'Endurance' },
  { k: 'COORD', n: 'Coordination' }, { k: 'QUICK', n: 'Quickness' },
  { k: 'FOC', n: 'Focus' }, { k: 'SELF', n: 'Self' },
];
const RACE_BONUSES: Record<string, Record<string, number>> = {
  aluvian:    { STR: 5, END: 5 },
  gharundim:  { FOC: 5, SELF: 5 },
  sho:        { COORD: 5, QUICK: 5 },
  viamontian: { STR: 3, COORD: 3, END: 3 },
  umbraen:    { FOC: 5, QUICK: 5 },
};

const SKILL_DEFS_UI = [
  { id: 'heavy',      name: 'Heavy Weapons',  sk: 'skillHeavy',      rs: 'raisedSkillHeavy'      },
  { id: 'light',      name: 'Light Weapons',  sk: 'skillLight',      rs: 'raisedSkillLight'      },
  { id: 'missile',    name: 'Missile',        sk: 'skillMissile',    rs: 'raisedSkillMissile'    },
  { id: 'war_magic',  name: 'War Magic',      sk: 'skillWarMagic',   rs: 'raisedSkillWarMagic'   },
  { id: 'life_magic', name: 'Life Magic',     sk: 'skillLifeMagic',  rs: 'raisedSkillLifeMagic'  },
  { id: 'item_magic', name: 'Item Magic',     sk: 'skillItemMagic',  rs: 'raisedSkillItemMagic'  },
  { id: 'melee_def',  name: 'Melee Defense',  sk: 'skillMeleeDef',   rs: 'raisedSkillMeleeDef'   },
  { id: 'run',        name: 'Run',            sk: 'skillRun',        rs: 'raisedSkillRun'        },
  { id: 'alchemy',    name: 'Alchemy',        sk: 'skillAlchemy',    rs: 'raisedSkillAlchemy'    },
] as const;

function skillXpCost(raised: number, isSpec: boolean): number {
  return Math.floor((isSpec ? 15 : 30) * Math.pow(1.4, raised));
}
function attrXpCost(raised: number): number {
  return Math.floor(50 * Math.pow(1.4, raised));
}

export class InGamePanel {
  private overlay: HTMLElement;
  private visible = false;
  private callbacks: {
    onSpendXp:      (attr: string)    => void;
    onSpendSkillXp: (skillId: string) => void;
    onEquipItem:    (id: bigint)      => void;
    onUnequipItem:  (id: bigint)      => void;
  };

  private char:  CharacterState | null = null;
  private items: ItemData[] = [];

  constructor(callbacks: typeof InGamePanel.prototype.callbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.id = 'ingame-panel';
    this.overlay.style.cssText = `
      display:none; position:fixed; top:0; right:0; width:290px; height:100%;
      z-index:400; overflow-y:auto; box-sizing:border-box;
      background:rgba(8,6,14,0.94); border-left:1px solid #2a2a3a;
      font-family:Georgia,serif; color:#c9a96e; padding:10px 12px 40px;
    `;
    document.body.appendChild(this.overlay);
  }

  toggle(char: CharacterState, items: ItemData[]) {
    if (this.visible) { this.hide(); return; }
    this.show(char, items);
  }

  show(char: CharacterState, items: ItemData[]) {
    this.char = char; this.items = items;
    this.visible = true;
    this.render();
    this.overlay.style.display = 'block';
  }

  update(char: CharacterState, items: ItemData[]) {
    this.char = char; this.items = items;
    if (this.visible) this.render();
  }

  hide() { this.visible = false; this.overlay.style.display = 'none'; }
  isVisible() { return this.visible; }

  private render() {
    const char = this.char;
    if (!char) return;

    const rb = RACE_BONUSES[char.race] ?? {};
    const eff = (k: string) => {
      const base: Record<string, number> = {
        STR: char.attrStr, END: char.attrEnd, COORD: char.attrCoord,
        QUICK: char.attrQuick, FOC: char.attrFoc, SELF: char.attrSelf,
      };
      const raised: Record<string, number> = {
        STR: char.raisedStr, END: char.raisedEnd, COORD: char.raisedCoord,
        QUICK: char.raisedQuick, FOC: char.raisedFoc, SELF: char.raisedSelf,
      };
      return (base[k] ?? 10) + (raised[k] ?? 0) + (rb[k] ?? 0);
    };
    const raisedMap: Record<string, number> = {
      STR: char.raisedStr, END: char.raisedEnd, COORD: char.raisedCoord,
      QUICK: char.raisedQuick, FOC: char.raisedFoc, SELF: char.raisedSelf,
    };

    const equipped  = (slot: string) => this.items.find(i => i.location === 'equipped' && i.slot === slot);
    const backpack  = this.items.filter(i => i.location === 'backpack');
    const xp        = Number(char.unspentXp);

    // ── Equipped section ──────────────────────────────────────────────────────
    const equippedHTML = ['weapon','head','chest','hands','feet','trinket'].map(slot => {
      const g = equipped(slot);
      const border = g ? RARITY_COLORS[g.rarity] : '#2a2a3a';
      const tip = g ? itemTooltip(g) : `Empty ${GEAR_SLOT_NAMES[slot]}`;
      return `<div class="igp-equip" data-item-id="${g ? g.id.toString() : ''}" data-slot="${slot}"
        title="${tip}"
        style="width:42px;height:42px;border:1px solid ${border};background:#0c0814;border-radius:4px;
               display:inline-flex;flex-direction:column;align-items:center;justify-content:center;
               font-size:16px;position:relative;cursor:${g ? 'pointer' : 'default'};opacity:${g ? '1' : '.35'}">
        ${g ? itemPixelHTML(g) : GEAR_SLOT_ICONS[slot]}
        <div style="position:absolute;bottom:-11px;font-size:6px;color:#665544;white-space:nowrap">${GEAR_SLOT_NAMES[slot]}</div>
      </div>`;
    }).join('');

    // ── Backpack section ──────────────────────────────────────────────────────
    const backpackHTML = backpack.length === 0
      ? `<div style="font-size:8px;color:#443322;text-align:center;padding:4px 0">empty</div>`
      : backpack.map(g => `
          <div class="igp-bp" data-item-id="${g.id.toString()}" title="${itemTooltip(g)}"
            style="width:40px;height:40px;border:1px solid ${RARITY_COLORS[g.rarity]};background:#0c0814;
                   border-radius:4px;display:inline-flex;align-items:center;justify-content:center;
                   font-size:16px;cursor:pointer;position:relative">
            ${itemPixelHTML(g)}
            <div style="position:absolute;bottom:1px;right:2px;font-size:6px;color:#665544">${g.slot[0].toUpperCase()}</div>
          </div>`).join('');

    // ── Attributes section ────────────────────────────────────────────────────
    const attrsHTML = ATTRS.map(a => {
      const val  = eff(a.k);
      const cost = attrXpCost(raisedMap[a.k] ?? 0);
      const can  = xp >= cost;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;font-size:10px">
        <span style="color:#aa9977;width:82px">${a.n}</span>
        <span style="color:#c9a96e;font-weight:bold;width:24px;text-align:center">${val}</span>
        <span style="font-size:8px;color:#554433;width:52px;text-align:right">${cost} XP</span>
        <button class="igp-xp-btn" data-attr="${a.k}"
          style="${btnStyle(can)}" ${can ? '' : 'disabled'}>+</button>
      </div>`;
    }).join('');

    // ── Skills section ────────────────────────────────────────────────────────
    const skillsHTML = SKILL_DEFS_UI.map(s => {
      const lvl    = (char as any)[s.sk] as number;
      if (lvl === 0) return '';
      const raised = (char as any)[s.rs] as number;
      const isSpec = lvl === 2;
      const cost   = skillXpCost(raised, isSpec);
      const can    = xp >= cost;
      const lvlLabel = isSpec
        ? '<span style="color:#aa44ee;font-size:7px">Spec</span>'
        : '<span style="color:#4488ee;font-size:7px">Trd</span>';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;font-size:9px">
        <span style="color:#aa9977;width:82px">${s.name}</span>
        <span style="width:26px;text-align:center">${lvlLabel}</span>
        <span style="color:#c9a96e;font-weight:bold;width:18px;text-align:center">+${raised}</span>
        <span style="font-size:8px;color:#554433;width:46px;text-align:right">${cost} XP</span>
        <button class="igp-skill-btn" data-skill-id="${s.id}"
          style="${btnStyle(can)}" ${can ? '' : 'disabled'}>+</button>
      </div>`;
    }).join('');

    this.overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:13px;letter-spacing:3px;text-shadow:0 0 12px rgba(200,160,80,.3)">CHARACTER</div>
        <button id="igp-close" style="background:transparent;border:1px solid #2a2a3a;color:#665544;
          width:20px;height:20px;border-radius:2px;cursor:pointer;font-family:Georgia,serif;font-size:10px">×</button>
      </div>

      <div style="font-size:9px;color:#665544;text-align:center;margin-bottom:10px">
        ${char.charName} · Lv ${char.level} · <span style="color:${xp > 0 ? '#c9a96e' : '#554433'}">${xp} XP</span>
        <div style="margin-top:2px;color:#443322">[C] toggle · game continues</div>
      </div>

      <div style="${sectionTitle()}">EQUIPPED <span style="font-size:8px;color:#443322">(click to unequip)</span></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:18px">
        ${equippedHTML}
      </div>

      <div style="${sectionTitle()}">BACKPACK (${backpack.length}/6) <span style="font-size:8px;color:#443322">(click to equip)</span></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">
        ${backpackHTML}
      </div>

      <div style="${sectionTitle()}">ATTRIBUTES</div>
      <div style="margin-bottom:10px">${attrsHTML}</div>

      <div style="${sectionTitle()}">SKILLS</div>
      <div>${skillsHTML || '<div style="font-size:8px;color:#443322;text-align:center;padding:4px 0">No trained skills</div>'}</div>
    `;

    paintPixelSlots(this.overlay);
    this.bindEvents();
  }

  private bindEvents() {
    document.getElementById('igp-close')?.addEventListener('click', () => this.hide());

    this.overlay.querySelectorAll<HTMLElement>('.igp-equip').forEach(el => {
      const idStr = el.dataset.itemId;
      if (!idStr) return;
      el.addEventListener('click', () => this.callbacks.onUnequipItem(BigInt(idStr)));
    });

    this.overlay.querySelectorAll<HTMLElement>('.igp-bp').forEach(el => {
      const idStr = el.dataset.itemId;
      if (!idStr) return;
      el.addEventListener('click', () => this.callbacks.onEquipItem(BigInt(idStr)));
    });

    this.overlay.querySelectorAll<HTMLButtonElement>('.igp-xp-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpendXp(btn.dataset.attr!));
    });

    this.overlay.querySelectorAll<HTMLButtonElement>('.igp-skill-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpendSkillXp(btn.dataset.skillId!));
    });
  }
}

// ── Style helpers ──────────────────────────────────────────────────────────────

function sectionTitle(): string {
  return 'font-size:10px;letter-spacing:2px;margin:0 0 6px;color:#aa9060;border-bottom:1px solid #2a2a3a;padding-bottom:3px;';
}

function btnStyle(enabled: boolean): string {
  return `width:20px;height:20px;background:#1a1028;border:1px solid ${enabled ? '#c9a96e' : '#3a2a4a'};
    border-radius:2px;color:#c9a96e;font-size:10px;cursor:${enabled ? 'pointer' : 'default'};
    font-family:Georgia,serif;`;
}

function itemTooltip(g: ItemData): string {
  const statLabel: Record<string, string> = { dm: 'Dmg', hp: 'HP', sp: 'Spd', ar: 'Armor', as: 'AtkSpd', xp: 'XP' };
  const fmt = (stat: string, val: number) => {
    if (stat === 'dm') return `+${val.toFixed(1)} Dmg`;
    if (stat === 'hp') return `+${val.toFixed(0)} HP`;
    return `+${(val * 100).toFixed(0)}% ${statLabel[stat] ?? stat}`;
  };
  let s = `${RARITY_NAMES[g.rarity]} ${g.itemName}\n${fmt(g.stat, g.val)}`;
  if (g.bonusStat) s += `\n${fmt(g.bonusStat, g.bonusVal)}`;
  return s;
}
