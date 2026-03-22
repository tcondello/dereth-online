// Lifestone Hub Screen — shown between runs (after death or extraction)
// Tabbed layout: CHARACTER | GEAR | DUNGEON

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

function itemPixelHTML(g: { icon: string; itemType?: string; paletteGame?: string; rarity: number; stat: string; val: number; bonusStat: string; bonusVal: number }): string {
  if (g.itemType && g.paletteGame) {
    return `<canvas class="px-slot" data-it="${g.itemType}" data-pg="${g.paletteGame}" data-ra="${g.rarity}" data-st="${g.stat}" data-vl="${g.val}" data-bs="${g.bonusStat}" data-bv="${g.bonusVal}" style="image-rendering:pixelated;width:32px;height:32px;display:block"></canvas>`;
  }
  return `<span style="font-size:20px">${g.icon}</span>`;
}

// XP awarded by rarity tier — mirrors server SALVAGE_XP
const CLIENT_SALVAGE_XP = [50, 150, 400, 900, 2000, 5000];

const GEAR_SLOT_ICONS: Record<string, string> = {
  weapon: '⚔️', head: '⛑️', chest: '🛡️', hands: '🧤', feet: '👢', trinket: '📿',
};
const GEAR_SLOT_NAMES: Record<string, string> = {
  weapon: 'Weapon', head: 'Helm', chest: 'Chest', hands: 'Hands', feet: 'Feet', trinket: 'Trinket',
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

export interface ItemData {
  id: bigint; slot: string; itemName: string; icon: string;
  rarity: number; stat: string; val: number;
  bonusStat: string; bonusVal: number; location: string;
  itemType?: string; paletteGame?: string;
}

export interface CharacterState {
  charName: string; race: string; level: number;
  totalXp: bigint; unspentXp: bigint; tokens: number;
  earnedCredits: number;
  attrStr: number; attrEnd: number; attrCoord: number;
  attrQuick: number; attrFoc: number; attrSelf: number;
  raisedStr: number; raisedEnd: number; raisedCoord: number;
  raisedQuick: number; raisedFoc: number; raisedSelf: number;
  // Skill training levels: 1=trained, 2=specialized (all start at 1)
  skillHeavy: number; skillLight: number; skillMissile: number;
  skillWarMagic: number; skillLifeMagic: number; skillItemMagic: number;
  skillMeleeDef: number; skillRun: number; skillAlchemy: number;
  // XP-raised skill bonus points (spend unspentXp to raise)
  raisedSkillHeavy: number; raisedSkillLight: number; raisedSkillMissile: number;
  raisedSkillWarMagic: number; raisedSkillLifeMagic: number; raisedSkillItemMagic: number;
  raisedSkillMeleeDef: number; raisedSkillRun: number; raisedSkillAlchemy: number;
  // Usage XP earned from fighting with matching gear (auto-promotes raised points)
  xpHeavy: bigint; xpLight: bigint; xpMissile: bigint;
  xpWarMagic: bigint; xpLifeMagic: bigint; xpItemMagic: bigint;
  xpMeleeDef: bigint; xpRun: bigint; xpAlchemy: bigint;
}

const SKILL_DEFS_UI = [
  { id: 'heavy',      name: 'Heavy Weapons', sk: 'skillHeavy',    rs: 'raisedSkillHeavy',    xp: 'xpHeavy'    },
  { id: 'light',      name: 'Light Weapons', sk: 'skillLight',    rs: 'raisedSkillLight',    xp: 'xpLight'    },
  { id: 'missile',    name: 'Missile',       sk: 'skillMissile',  rs: 'raisedSkillMissile',  xp: 'xpMissile'  },
  { id: 'war_magic',  name: 'War Magic',     sk: 'skillWarMagic', rs: 'raisedSkillWarMagic', xp: 'xpWarMagic' },
  { id: 'life_magic', name: 'Life Magic',    sk: 'skillLifeMagic',rs: 'raisedSkillLifeMagic',xp: 'xpLifeMagic' },
  { id: 'item_magic', name: 'Item Magic',    sk: 'skillItemMagic',rs: 'raisedSkillItemMagic',xp: 'xpItemMagic' },
  { id: 'melee_def',  name: 'Melee Defense', sk: 'skillMeleeDef', rs: 'raisedSkillMeleeDef', xp: 'xpMeleeDef' },
  { id: 'run',        name: 'Run',           sk: 'skillRun',      rs: 'raisedSkillRun',      xp: 'xpRun'      },
  { id: 'alchemy',    name: 'Alchemy',       sk: 'skillAlchemy',  rs: 'raisedSkillAlchemy',  xp: 'xpAlchemy'  },
] as const;

const SKILL_XP_THRESHOLD = 150;

function skillXpCost(raised: number, isSpec: boolean): number {
  return Math.floor((isSpec ? 15 : 30) * Math.pow(1.4, raised));
}

const FLOOR_NAMES = [
  'Drudge Warrens', 'Shadow Den', 'Banderling Lair', 'Olthoi Nest',
  'Virindi Sanctum', 'Tusker Canyon', 'Virindi Apparatus', 'The Horde',
  'Olthoi Guard', "Bael'Zharon's Domain",
];
const FLOOR_BOSSES = [
  'Bloody Bones', 'The Whisperer', 'Grunter the Brute', 'Brood Mother',
  'Martine the Mad', 'Torgluuk', 'The Hollow One', 'Pandemonium',
  'Olthoi Eviscerator', "Bael'Zharon",
];

export class HubScreen {
  private overlay: HTMLElement;
  private callbacks: {
    onDeploy: () => void;
    onSpendXp: (attr: string) => void;
    onSpendSkillXp: (skillId: string) => void;
    onSpecializeSkill: (skillId: string) => void;
    onEquipItem: (id: bigint) => void;
    onUnequipItem: (id: bigint) => void;
    onSalvageItem: (id: bigint) => void;
    onSpendToken: () => void;
    onConvertTokenToXp: () => void;
    onSpawnTestLoot: () => void;
    onEnterDungeon: (level: number) => void;
    onSwitchCharacter: () => void;
    onLogout: () => void;
  };

  private char: CharacterState | null = null;
  private items: ItemData[] = [];
  private highestFloorCleared = 0;
  private activeTab: 'character' | 'gear' | 'dungeon' = 'character';
  private selectedItemId: string | null = null;
  private salvageStaged = new Set<string>();
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(callbacks: typeof HubScreen.prototype.callbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.id = 'hub-overlay';
    this.overlay.style.cssText = `
      display:none; position:fixed; top:0; left:0; width:100%; height:100%;
      z-index:500; flex-direction:column; align-items:center; overflow-y:auto;
      padding:12px 8px 40px;
      background: radial-gradient(ellipse at center, #121020, #0a0a0f);
      font-family: Georgia, serif; color: #c9a96e;
      -webkit-overflow-scrolling: touch;
    `;
    document.body.appendChild(this.overlay);
  }

  show(char: CharacterState, items: ItemData[], highestFloorCleared = 0) {
    this.char  = char;
    this.items = items;
    this.highestFloorCleared = highestFloorCleared;
    this.render();
    this.overlay.style.display = 'flex';
    this.attachKeyHandler();
  }

  update(char: CharacterState, items: ItemData[], highestFloorCleared?: number) {
    this.char  = char;
    this.items = items;
    if (highestFloorCleared !== undefined) this.highestFloorCleared = highestFloorCleared;
    // Validate selection still exists
    if (this.selectedItemId && !this.items.find(i => i.id.toString() === this.selectedItemId)) {
      this.selectedItemId = null;
    }
    if (this.overlay.style.display !== 'none') this.render();
  }

  hide() {
    this.overlay.style.display = 'none';
    this.detachKeyHandler();
  }

  private attachKeyHandler() {
    this.detachKeyHandler();
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.activeTab !== 'gear') return;
      if (e.key === 'Escape') {
        this.selectedItemId = null;
        this.render();
      } else if (this.selectedItemId) {
        const item = this.items.find(i => i.id.toString() === this.selectedItemId);
        if (!item) return;
        if (e.key === 'e' || e.key === 'E') {
          if (item.location === 'equipped') this.callbacks.onUnequipItem(item.id);
          else this.callbacks.onEquipItem(item.id);
        } else if ((e.key === 's' || e.key === 'S') && item.location !== 'equipped') {
          this.salvageStaged.add(this.selectedItemId!);
          this.selectedItemId = null;
          this.render();
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private detachKeyHandler() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private render() {
    const char = this.char;
    if (!char) return;

    const rb  = RACE_BONUSES[char.race] ?? {};
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
    const maxHp = Math.floor(eff('END') / 2) + 10;

    this.overlay.innerHTML = `
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:22px;letter-spacing:5px;text-shadow:0 0 20px rgba(200,160,80,.3)">LIFESTONE</div>
        <div style="font-size:13px;color:#c9a96e;margin-top:2px">${char.charName} &nbsp;·&nbsp; <span style="color:#44aaff">Level ${char.level}</span></div>
      </div>

      <div style="display:flex;gap:2px;max-width:680px;width:100%;margin-bottom:10px;border:1px solid #2a2a3a;border-radius:6px;overflow:hidden">
        ${(['character', 'gear', 'dungeon'] as const).map(tab => {
          const active = this.activeTab === tab;
          const label = tab === 'character' ? 'CHARACTER' : tab === 'gear' ? 'GEAR' : 'DUNGEON';
          return `<button class="hub-tab" data-tab="${tab}" style="flex:1;padding:10px 4px;font-size:11px;font-family:Georgia,serif;letter-spacing:2px;cursor:pointer;border:none;background:${active ? '#1e1530' : '#0c0814'};color:${active ? '#c9a96e' : '#554433'};border-bottom:2px solid ${active ? '#c9a96e' : 'transparent'};min-height:44px">${label}</button>`;
        }).join('')}
      </div>

      <div style="max-width:680px;width:100%;flex:1">
        ${this.activeTab === 'character' ? this.renderCharTab(char, eff, maxHp) : ''}
        ${this.activeTab === 'gear'      ? this.renderGearTab(char) : ''}
        ${this.activeTab === 'dungeon'   ? this.renderDungeonTab() : ''}
      </div>

      <div style="max-width:680px;width:100%;margin-top:14px;display:flex;flex-direction:column;align-items:center;gap:8px">
        <button id="hub-deploy" style="width:100%;padding:14px;font-size:16px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:#c9a96e;border:1px solid #5a4a3a;border-radius:6px;cursor:pointer;letter-spacing:3px;min-height:52px">
          DEPLOY INTO THE WORLD
        </button>
        <div style="font-size:9px;color:#443322;text-align:center">Equipped gear is at risk · Press P to extract · Getting hit interrupts cast</div>
        <div style="display:flex;gap:6px;width:100%">
          <button id="hub-test-loot"   style="${ghostBtnStyle()}">DEV: Test Kit</button>
          <button id="hub-switch-char" style="${ghostBtnStyle()}">SWITCH CHAR</button>
          <button id="hub-logout"      style="${ghostBtnStyle()}">LOG OUT</button>
        </div>
      </div>
    `;

    paintPixelSlots(this.overlay);
    this.bindEvents();
  }

  private renderCharTab(char: CharacterState, eff: (k: string) => number, maxHp: number): string {
    const raisedMap: Record<string, number> = {
      STR: char.raisedStr, END: char.raisedEnd, COORD: char.raisedCoord,
      QUICK: char.raisedQuick, FOC: char.raisedFoc, SELF: char.raisedSelf,
    };
    const attrCost = (k: string) => Math.floor(50 * Math.pow(1.4, raisedMap[k] ?? 0));

    return `
      <div style="${cardStyle()}margin-bottom:10px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
          <div style="font-size:12px">
            <span style="color:#554433">XP unspent: </span>
            <span style="color:#44aaff;font-weight:bold">${Number(char.unspentXp).toLocaleString()}</span>
          </div>
          <div style="font-size:12px">
            <span style="color:#554433">Gear Tokens: </span>
            <span style="color:#ee9922;font-weight:bold">${char.tokens}</span>
          </div>
          <button id="convert-token-btn" ${char.tokens < 1 ? 'disabled' : ''} style="padding:8px 14px;font-size:11px;font-family:Georgia,serif;background:linear-gradient(180deg,#1a1400,#0e0900);color:${char.tokens >= 1 ? '#ee9922' : '#443322'};border:1px solid ${char.tokens >= 1 ? '#996600' : '#2a2a1a'};border-radius:4px;cursor:${char.tokens >= 1 ? 'pointer' : 'default'};opacity:${char.tokens >= 1 ? '1' : '0.4'};min-height:36px">
            Token → 500 XP
          </button>
        </div>
        <div style="font-size:11px;color:#665544;margin-top:6px;text-align:center">
          HP: <strong style="color:#cc4444">${maxHp}</strong> &nbsp;·&nbsp; Total XP: ${Number(char.totalXp).toLocaleString()}
        </div>
      </div>

      <div style="${cardStyle()}margin-bottom:10px">
        <div style="${sectionTitle()}">ATTRIBUTES</div>
        ${ATTRS.map(a => {
          const val  = eff(a.k);
          const cost = attrCost(a.k);
          const can  = Number(char.unspentXp) >= cost;
          return `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #1a1525">
            <span style="color:#887766;font-size:12px;flex:1;min-width:0">${a.n}</span>
            <span style="color:#c9a96e;font-weight:bold;font-size:15px;width:32px;text-align:center">${val}</span>
            <span style="font-size:10px;color:#443322;min-width:54px;text-align:right">${cost} XP</span>
            <button class="xp-btn" data-attr="${a.k}" style="${plusBtnStyle(can)}" ${can ? '' : 'disabled'}>+</button>
          </div>`;
        }).join('')}
      </div>

      <div style="${cardStyle()}">
        <div style="${sectionTitle()}">SKILLS</div>
        <div style="font-size:10px;color:#443322;text-align:center;margin-bottom:8px">
          All skills start trained · Use gear to earn usage XP · Spend XP to raise · Specialize after 5 raises
        </div>
        ${SKILL_DEFS_UI.map(s => {
          const lvl    = (char as any)[s.sk] as number;
          const raised = (char as any)[s.rs] as number;
          const xpUsed = Number((char as any)[s.xp] ?? 0n);
          const xpProg = xpUsed % SKILL_XP_THRESHOLD;
          const fillPct = Math.round(xpProg / SKILL_XP_THRESHOLD * 100);
          const isSpec  = lvl === 2;
          const cost    = skillXpCost(raised, isSpec);
          const canRaise = Number(char.unspentXp) >= cost;
          const canSpec  = !isSpec && raised >= 5 && Number(char.unspentXp) >= 1000;
          const lvlLabel = isSpec
            ? `<span style="font-size:9px;color:#aa44ee;background:#1a0a2a;border:1px solid #662288;border-radius:3px;padding:1px 5px">SPEC</span>`
            : `<span style="font-size:9px;color:#4a8a4a;background:#0a1a0a;border:1px solid #2a4a2a;border-radius:3px;padding:1px 5px">TRAINED</span>`;
          return `<div style="padding:7px 0;border-bottom:1px solid #1a1525">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <span style="color:#aa9977;font-size:12px;flex:1">${s.name}</span>
              ${lvlLabel}
              <span style="color:#c9a96e;font-size:13px;font-weight:bold;min-width:28px;text-align:right">+${raised}</span>
              <span style="color:#443322;font-size:10px;min-width:48px;text-align:right">${cost} XP</span>
              <button class="skill-xp-btn" data-skill-id="${s.id}" style="${plusBtnStyle(canRaise)}" ${canRaise ? '' : 'disabled'}>+</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:5px;background:#1a1525;border-radius:2px;overflow:hidden" title="${xpProg}/${SKILL_XP_THRESHOLD} XP to next auto-raise">
                <div style="height:100%;width:${fillPct}%;background:${isSpec ? '#aa44ee' : '#4488ee'};transition:width .3s"></div>
              </div>
              <span style="font-size:9px;color:#332222;white-space:nowrap">${xpUsed} used</span>
              ${canSpec ? `<button class="spec-btn" data-skill-id="${s.id}" style="padding:4px 10px;font-size:9px;font-family:Georgia,serif;background:linear-gradient(180deg,#1a0a2a,#0e0618);color:#aa44ee;border:1px solid #662288;border-radius:3px;cursor:pointer;letter-spacing:1px;min-height:28px;white-space:nowrap">SPECIALIZE — 1000 XP</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  }

  private renderGearTab(char: CharacterState): string {
    const equippedItem = (slot: string) => this.items.find(i => i.location === 'equipped' && i.slot === slot);
    const vault    = this.items.filter(i => i.location === 'vault');
    const backpack = this.items.filter(i => i.location === 'backpack');

    for (const id of this.salvageStaged) {
      if (!vault.find(g => g.id.toString() === id)) this.salvageStaged.delete(id);
    }
    const keep   = vault.filter(g => !this.salvageStaged.has(g.id.toString()));
    const staged = vault.filter(g =>  this.salvageStaged.has(g.id.toString()));
    const totalXp = staged.reduce((s, g) => s + (CLIENT_SALVAGE_XP[Math.min(g.rarity, 5)] ?? 50), 0);

    const sel = this.selectedItemId ? this.items.find(i => i.id.toString() === this.selectedItemId) : null;

    return `
      <div style="${cardStyle()}margin-bottom:10px">
        <div style="${sectionTitle()}">EQUIPPED</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px">
          ${(['weapon','head','chest','hands','feet','trinket'] as const).map(slot => {
            const g = equippedItem(slot);
            const isSel = g && g.id.toString() === this.selectedItemId;
            return `<div class="item-slot" data-item-id="${g ? g.id.toString() : ''}" data-location="equipped"
              style="${slotStyle(g != null, RARITY_COLORS[g?.rarity ?? 0], isSel ?? false)}" title="${g ? itemTooltip(g) : GEAR_SLOT_NAMES[slot]}">
              ${g ? itemPixelHTML(g) : `<span style="font-size:20px;opacity:.25">${GEAR_SLOT_ICONS[slot]}</span>`}
              <div style="font-size:7px;color:#443322;margin-top:2px">${GEAR_SLOT_NAMES[slot]}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      ${sel ? `
        <div style="background:#0e0a1a;border:2px solid ${RARITY_COLORS[sel.rarity]};border-radius:6px;padding:12px;margin-bottom:10px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex-shrink:0;width:48px;height:48px;background:#0c0814;border:1px solid #2a2a3a;border-radius:5px;display:flex;align-items:center;justify-content:center">
              ${itemPixelHTML(sel)}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;color:${RARITY_COLORS[sel.rarity]};font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${sel.itemName}</div>
              <div style="font-size:11px;color:#887766;margin-top:2px">${statFmt(sel.stat, sel.val)}${sel.bonusStat ? ` &nbsp;·&nbsp; ${statFmt(sel.bonusStat, sel.bonusVal)}` : ''}</div>
              <div style="font-size:10px;color:#443322;margin-top:2px">${RARITY_NAMES[sel.rarity]} · ${sel.slot}</div>
            </div>
            <button class="deselect-btn" style="padding:6px 10px;font-size:11px;font-family:Georgia,serif;background:transparent;color:#443333;border:1px solid #2a2a3a;border-radius:3px;cursor:pointer;min-width:32px;min-height:32px">✕</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            ${sel.location === 'equipped'
              ? `<button class="item-action-btn" data-action="unequip" data-item-id="${sel.id.toString()}" style="${actionBtnStyle('#4488ee','#0a1840')}">UNEQUIP &nbsp;[E]</button>`
              : `<button class="item-action-btn" data-action="equip"   data-item-id="${sel.id.toString()}" style="${actionBtnStyle('#4488ee','#0a1840')}">EQUIP &nbsp;[E]</button>`
            }
            ${sel.location !== 'equipped'
              ? `<button class="item-action-btn" data-action="queue-salvage" data-item-id="${sel.id.toString()}" style="${actionBtnStyle('#cc4444','#200808')}">QUEUE SALVAGE &nbsp;[S]</button>`
              : ''
            }
          </div>
          <div style="font-size:9px;color:#332222;margin-top:6px">[E] equip/unequip · [S] queue salvage · [Esc] deselect</div>
        </div>
      ` : ''}

      <div style="${cardStyle()}margin-bottom:10px">
        <div style="${sectionTitle()}">VAULT (${vault.length}/12)</div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:#aa9060;text-align:center;margin-bottom:6px;letter-spacing:1px">KEEP · tap to queue</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;min-height:52px">
              ${keep.map(g => {
                const isSel = g.id.toString() === this.selectedItemId;
                return `<div class="item-slot" data-item-id="${g.id.toString()}" data-location="vault"
                  style="${slotStyle(true, RARITY_COLORS[g.rarity], isSel)}" title="${itemTooltip(g)}">
                  ${itemPixelHTML(g)}
                  <div style="font-size:7px;color:#443322;margin-top:1px">${g.slot[0].toUpperCase()}</div>
                </div>`;
              }).join('')}
              ${keep.length === 0 ? `<div style="font-size:10px;color:#332222;padding:10px;grid-column:1/-1;text-align:center">—</div>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;padding:0 4px;color:#332222;font-size:13px">
            <span>→</span><span>←</span>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:#cc4444;text-align:center;margin-bottom:6px;letter-spacing:1px">SALVAGE · tap to keep</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;min-height:52px">
              ${staged.map(g => {
                const isSel = g.id.toString() === this.selectedItemId;
                return `<div class="item-slot" data-item-id="${g.id.toString()}" data-location="staged"
                  style="${slotStyle(true, '#882222', isSel)}" title="${itemTooltip(g)}">
                  ${itemPixelHTML(g)}
                  <div style="font-size:7px;color:#443322;margin-top:1px">${g.slot[0].toUpperCase()}</div>
                </div>`;
              }).join('')}
              ${staged.length === 0 ? `<div style="font-size:10px;color:#332222;padding:10px;grid-column:1/-1;text-align:center">—</div>` : ''}
            </div>
          </div>
        </div>
        ${staged.length > 0 ? `
          <button id="salvage-all-btn" style="width:100%;padding:12px;font-size:13px;font-family:Georgia,serif;background:linear-gradient(180deg,#220808,#110404);border:1px solid #882222;border-radius:4px;color:#ff6666;cursor:pointer;letter-spacing:1px;min-height:44px">
            SALVAGE ALL &nbsp;—&nbsp; ${staged.length} item${staged.length > 1 ? 's' : ''} &nbsp;·&nbsp; +${totalXp.toLocaleString()} XP
          </button>
        ` : ''}
      </div>

      ${backpack.length > 0 ? `
        <div style="${cardStyle()}margin-bottom:10px">
          <div style="${sectionTitle()}">BACKPACK (${backpack.length}/6)</div>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:5px">
            ${backpack.map(g => {
              const isSel = g.id.toString() === this.selectedItemId;
              return `<div class="item-slot" data-item-id="${g.id.toString()}" data-location="backpack"
                style="${slotStyle(true, RARITY_COLORS[g.rarity], isSel)}" title="${itemTooltip(g)}">
                ${itemPixelHTML(g)}
                <div style="font-size:7px;color:#443322;margin-top:1px">${g.slot[0].toUpperCase()}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <div style="text-align:center;margin-top:8px">
        <button id="token-btn" ${char.tokens < 1 || vault.length >= 12 ? 'disabled' : ''} style="padding:12px 24px;font-size:13px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:#c9a96e;border:1px solid #5a4a3a;border-radius:5px;cursor:${char.tokens >= 1 && vault.length < 12 ? 'pointer' : 'default'};letter-spacing:1px;opacity:${char.tokens >= 1 && vault.length < 12 ? '1' : '0.35'};min-height:48px">
          Spend Token (${char.tokens}) — Get Gear
        </button>
      </div>
    `;
  }

  private renderDungeonTab(): string {
    return `
      <div style="${cardStyle()}">
        <div style="${sectionTitle()}">DUNGEON DIVE</div>
        <div style="font-size:10px;color:#443322;text-align:center;margin-bottom:12px">Defeat each floor boss to unlock the next floor</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
          ${FLOOR_NAMES.map((name, i) => {
            const floorNum  = i + 1;
            const cleared   = this.highestFloorCleared >= floorNum;
            const available = !cleared && this.highestFloorCleared >= i;
            const borderCol = cleared ? '#4a8a4a' : available ? '#c9a96e' : '#2a2a3a';
            const bgCol     = cleared ? 'rgba(10,40,10,.5)' : available ? 'rgba(20,16,8,.8)' : 'rgba(10,10,16,.4)';
            const numColor  = cleared ? '#4a8a4a' : available ? '#c9a96e' : '#332222';
            const label     = cleared ? '✓ DONE' : available ? '⚔ READY' : '🔒';
            const labelCol  = cleared ? '#4a8a4a' : available ? '#ee9922' : '#332222';
            return `<div style="border:1px solid ${borderCol};background:${bgCol};border-radius:6px;padding:8px 4px;text-align:center">
              <div style="font-size:18px;font-weight:bold;color:${numColor}">${floorNum}</div>
              <div style="font-size:9px;color:#887755;margin:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name}</div>
              <div style="font-size:8px;color:#665544;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${FLOOR_BOSSES[i]}">${FLOOR_BOSSES[i]}</div>
              <div style="font-size:8px;color:${labelCol};margin-bottom:6px">${label}</div>
              ${(available || cleared)
                ? `<button class="dungeon-enter-btn" data-floor="${floorNum}" style="${dungeonBtnStyle(true)}">${cleared ? 'REPLAY' : 'ENTER'}</button>`
                : `<button disabled style="${dungeonBtnStyle(false)}">ENTER</button>`
              }
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  private bindEvents() {
    this.overlay.querySelectorAll<HTMLButtonElement>('.hub-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab as any;
        this.selectedItemId = null;
        this.render();
      });
    });

    document.getElementById('hub-deploy')?.addEventListener('click', () => this.callbacks.onDeploy());
    document.getElementById('hub-switch-char')?.addEventListener('click', () => this.callbacks.onSwitchCharacter());
    document.getElementById('hub-logout')?.addEventListener('click', () => this.callbacks.onLogout());
    document.getElementById('hub-test-loot')?.addEventListener('click', () => this.callbacks.onSpawnTestLoot());

    // CHARACTER tab
    document.getElementById('convert-token-btn')?.addEventListener('click', () => this.callbacks.onConvertTokenToXp());
    this.overlay.querySelectorAll<HTMLButtonElement>('.xp-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpendXp(btn.dataset.attr!));
    });
    this.overlay.querySelectorAll<HTMLButtonElement>('.skill-xp-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpendSkillXp(btn.dataset.skillId!));
    });
    this.overlay.querySelectorAll<HTMLButtonElement>('.spec-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpecializeSkill(btn.dataset.skillId!));
    });

    // GEAR tab — item slots (tap to select; staged = tap to un-stage)
    this.overlay.querySelectorAll<HTMLElement>('.item-slot').forEach(el => {
      const idStr    = el.dataset.itemId;
      const location = el.dataset.location;
      if (!idStr) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        if (location === 'staged') {
          this.salvageStaged.delete(idStr);
          if (this.selectedItemId === idStr) this.selectedItemId = null;
          this.render();
        } else {
          this.selectedItemId = this.selectedItemId === idStr ? null : idStr;
          this.render();
        }
      });
    });

    this.overlay.querySelectorAll<HTMLButtonElement>('.item-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id     = BigInt(btn.dataset.itemId!);
        const action = btn.dataset.action;
        if (action === 'equip')          this.callbacks.onEquipItem(id);
        else if (action === 'unequip')   this.callbacks.onUnequipItem(id);
        else if (action === 'queue-salvage') {
          this.salvageStaged.add(btn.dataset.itemId!);
          this.selectedItemId = null;
          this.render();
        }
      });
    });

    this.overlay.querySelector('.deselect-btn')?.addEventListener('click', () => {
      this.selectedItemId = null;
      this.render();
    });

    document.getElementById('salvage-all-btn')?.addEventListener('click', () => {
      const ids = [...this.salvageStaged];
      this.salvageStaged.clear();
      for (const id of ids) this.callbacks.onSalvageItem(BigInt(id));
    });

    document.getElementById('token-btn')?.addEventListener('click', () => this.callbacks.onSpendToken());

    this.overlay.querySelectorAll<HTMLButtonElement>('.dungeon-enter-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onEnterDungeon(Number(btn.dataset.floor!)));
    });
  }
}

// ── Style helpers ──────────────────────────────────────────────────────────────

function cardStyle(): string {
  return 'background:#0c0814;border:1px solid #2a2a3a;border-radius:6px;padding:12px 14px;';
}

function sectionTitle(): string {
  return 'font-size:12px;letter-spacing:2px;color:#aa9060;text-align:center;border-bottom:1px solid #2a2a3a;padding-bottom:6px;margin-bottom:10px;';
}

function ghostBtnStyle(): string {
  return 'flex:1;padding:8px 4px;font-size:10px;font-family:Georgia,serif;background:transparent;color:#443322;border:1px solid #2a1e14;border-radius:4px;cursor:pointer;letter-spacing:1px;min-height:36px;';
}

function plusBtnStyle(enabled: boolean): string {
  return `min-width:32px;min-height:32px;background:#1a1028;border:1px solid ${enabled ? '#c9a96e' : '#3a2a4a'};border-radius:3px;color:#c9a96e;font-size:14px;cursor:${enabled ? 'pointer' : 'default'};font-family:Georgia,serif;`;
}

function slotStyle(filled: boolean, color: string, selected: boolean): string {
  return `background:#0a0812;border:2px solid ${selected ? '#ffffff' : filled ? color : '#2a2a3a'};border-radius:5px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 2px;aspect-ratio:1;${filled ? '' : 'opacity:.3;'}box-shadow:${selected ? '0 0 8px rgba(255,255,255,.25)' : 'none'};transition:border-color .1s;`;
}

function actionBtnStyle(color: string, bg: string): string {
  return `padding:10px 16px;font-size:12px;font-family:Georgia,serif;background:${bg};color:${color};border:1px solid ${color}88;border-radius:4px;cursor:pointer;letter-spacing:1px;min-height:44px;`;
}

function dungeonBtnStyle(enabled: boolean): string {
  return `width:100%;padding:6px 0;font-size:9px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:${enabled ? '#c9a96e' : '#443333'};border:1px solid ${enabled ? '#5a4a3a' : '#2a2a3a'};border-radius:3px;cursor:${enabled ? 'pointer' : 'default'};letter-spacing:1px;opacity:${enabled ? '1' : '0.4'};min-height:32px;`;
}

function statFmt(stat: string, val: number): string {
  if (stat === 'dm') return `+${val.toFixed(1)} Dmg`;
  if (stat === 'hp') return `+${val.toFixed(0)} HP`;
  const labels: Record<string, string> = { sp: 'Spd', ar: 'Armor', as: 'AtkSpd', xp: 'XP' };
  return `+${(val * 100).toFixed(0)}% ${labels[stat] ?? stat}`;
}

function itemTooltip(g: ItemData): string {
  let s = `${RARITY_NAMES[g.rarity]} ${g.itemName}\n${statFmt(g.stat, g.val)}`;
  if (g.bonusStat) s += `\n${statFmt(g.bonusStat, g.bonusVal)}`;
  return s;
}
