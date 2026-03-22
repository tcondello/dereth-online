// Lifestone Hub Screen — shown between runs (after death or extraction)
// Manages gear, spends XP on attributes, and deploys back into the world.

import { renderItemCardToCanvas } from '../game/gear/phaser-sprites';

// Render pixel art item card into a <canvas class="px-slot"> placeholder after innerHTML is set
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

// Returns a canvas placeholder (pixel art) or falls back to the emoji icon
function itemPixelHTML(g: { icon: string; itemType?: string; paletteGame?: string; rarity: number; stat: string; val: number; bonusStat: string; bonusVal: number }): string {
  if (g.itemType && g.paletteGame) {
    return `<canvas class="px-slot" data-it="${g.itemType}" data-pg="${g.paletteGame}" data-ra="${g.rarity}" data-st="${g.stat}" data-vl="${g.val}" data-bs="${g.bonusStat}" data-bv="${g.bonusVal}" style="image-rendering:pixelated;width:34px;height:34px;display:block"></canvas>`;
  }
  return g.icon;
}

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
  // Pixel art fields (empty string = legacy item, fall back to emoji)
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
  // Skill training levels: 0=untrained, 1=trained, 2=specialized
  skillHeavy: number; skillLight: number; skillMissile: number;
  skillWarMagic: number; skillLifeMagic: number; skillItemMagic: number;
  skillMeleeDef: number; skillRun: number; skillAlchemy: number;
  // XP-raised skill bonus points
  raisedSkillHeavy: number; raisedSkillLight: number; raisedSkillMissile: number;
  raisedSkillWarMagic: number; raisedSkillLifeMagic: number; raisedSkillItemMagic: number;
  raisedSkillMeleeDef: number; raisedSkillRun: number; raisedSkillAlchemy: number;
}

// Skill definitions for the hub UI
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

const SKILL_CREDITS_BASE = 32;

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
    onEquipItem: (id: bigint) => void;
    onUnequipItem: (id: bigint) => void;
    onSpendToken: () => void;
    onEnterDungeon: (level: number) => void;
    onSwitchCharacter: () => void;
    onLogout: () => void;
  };

  private char: CharacterState | null = null;
  private items: ItemData[] = [];
  private highestFloorCleared = 0;

  constructor(callbacks: typeof HubScreen.prototype.callbacks) {
    this.callbacks = callbacks;
    this.overlay = document.createElement('div');
    this.overlay.id = 'hub-overlay';
    this.overlay.style.cssText = `
      display:none; position:fixed; top:0; left:0; width:100%; height:100%;
      z-index:500; flex-direction:column; align-items:center; overflow-y:auto;
      padding:16px 10px 40px;
      background: radial-gradient(ellipse at center, #121020, #0a0a0f);
      font-family: Georgia, serif; color: #c9a96e;
    `;
    document.body.appendChild(this.overlay);
  }

  show(char: CharacterState, items: ItemData[], highestFloorCleared = 0) {
    this.char  = char;
    this.items = items;
    this.highestFloorCleared = highestFloorCleared;
    this.render();
    this.overlay.style.display = 'flex';
  }

  update(char: CharacterState, items: ItemData[], highestFloorCleared?: number) {
    this.char  = char;
    this.items = items;
    if (highestFloorCleared !== undefined) this.highestFloorCleared = highestFloorCleared;
    if (this.overlay.style.display !== 'none') this.render();
  }

  hide() { this.overlay.style.display = 'none'; }

  private render() {
    const char = this.char;
    if (!char) return;

    const rb    = RACE_BONUSES[char.race] ?? {};
    const eff   = (k: string) => {
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

    const equipped = (slot: string) => this.items.find(i => i.location === 'equipped' && i.slot === slot);
    const vault     = this.items.filter(i => i.location === 'vault');
    const backpack  = this.items.filter(i => i.location === 'backpack');

    // Build XP raise cost for each attr
    const raisedMap: Record<string, number> = {
      STR: char.raisedStr, END: char.raisedEnd, COORD: char.raisedCoord,
      QUICK: char.raisedQuick, FOC: char.raisedFoc, SELF: char.raisedSelf,
    };
    const attrCostFn = (k: string) => Math.floor(50 * Math.pow(1.4, raisedMap[k] ?? 0));

    this.overlay.innerHTML = `
      <div style="font-size:26px;letter-spacing:5px;text-shadow:0 0 20px rgba(200,160,80,.3);margin:8px 0 2px">LIFESTONE</div>
      <div style="font-size:10px;color:#665544;letter-spacing:3px;margin-bottom:14px">PREPARE FOR YOUR NEXT RUN</div>

      <div style="display:flex;gap:14px;max-width:820px;width:100%;flex-wrap:wrap;justify-content:center">

        <!-- Character panel -->
        <div style="min-width:220px;max-width:360px;flex:1;background:linear-gradient(180deg,#141020,#0c0814);border:1px solid #2a2a3a;border-radius:8px;padding:14px">
          <div style="${panelTitle()}">CHARACTER</div>
          <div style="text-align:center;font-size:13px;margin-bottom:4px">${char.charName}</div>
          <div style="text-align:center;font-size:10px;color:#44aaff;margin-bottom:4px">Level ${char.level}</div>
          <div style="text-align:center;font-size:9px;color:#887766;margin-bottom:10px">
            XP: ${Number(char.unspentXp)} unspent · Tokens: <span style="color:#ee9922">${char.tokens}</span>
          </div>

          <div style="${panelTitle()} font-size:11px;">SPEND XP ON ATTRIBUTES</div>
          ${ATTRS.map(a => {
            const val  = eff(a.k);
            const cost = attrCostFn(a.k);
            const can  = Number(char.unspentXp) >= cost;
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;font-size:10px">
              <span style="color:#aa9977;width:90px">${a.n}</span>
              <span style="color:#c9a96e;font-weight:bold;width:28px;text-align:center">${val}</span>
              <span style="font-size:8px;color:#665544;width:55px;text-align:right">${cost} XP</span>
              <button class="xp-btn" data-attr="${a.k}" style="${xpBtnStyle(can)}" ${can ? '' : 'disabled'}>+</button>
            </div>`;
          }).join('')}
          <div style="text-align:center;font-size:8px;color:#554433;margin-top:6px">HP: <strong style="color:#cc4444">${maxHp}</strong> · Attribute raises persist forever</div>

          <div style="${panelTitle()} font-size:11px;margin-top:10px;">RAISE SKILLS</div>
          <div style="font-size:8px;color:#665544;text-align:center;margin-bottom:6px">Credits: <strong style="color:#c9a96e">${SKILL_CREDITS_BASE + char.earnedCredits}</strong> · XP: ${Number(char.unspentXp)} unspent</div>
          ${SKILL_DEFS_UI.map(s => {
            const lvl   = (char as any)[s.sk] as number;
            if (lvl === 0) return ''; // untrained — can't raise
            const raised = (char as any)[s.rs] as number;
            const isSpec = lvl === 2;
            const cost   = skillXpCost(raised, isSpec);
            const can    = Number(char.unspentXp) >= cost;
            const lvlLabel = isSpec ? '<span style="color:#aa44ee">Spec</span>' : '<span style="color:#4488ee">Trained</span>';
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;font-size:9px">
              <span style="color:#aa9977;width:84px">${s.name}</span>
              <span style="font-size:8px;width:38px;text-align:center">${lvlLabel}</span>
              <span style="color:#c9a96e;font-weight:bold;width:18px;text-align:center">+${raised}</span>
              <span style="font-size:8px;color:#665544;width:46px;text-align:right">${cost} XP</span>
              <button class="skill-xp-btn" data-skill-id="${s.id}" style="${xpBtnStyle(can)}" ${can ? '' : 'disabled'}>+</button>
            </div>`;
          }).join('')}
        </div>

        <!-- Equipment & Vault panel -->
        <div style="min-width:220px;max-width:360px;flex:1;background:linear-gradient(180deg,#141020,#0c0814);border:1px solid #2a2a3a;border-radius:8px;padding:14px">
          <div style="${panelTitle()}">EQUIPPED</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:10px">
            ${['weapon','head','chest','hands','feet','trinket'].map(slot => {
              const g = equipped(slot);
              return `<div style="${eqSlotStyle(g != null)}" class="equip-slot" data-item-id="${g ? g.id.toString() : ''}" data-slot="${slot}" title="${g ? itemTooltip(g) : 'Empty'}">
                ${g ? itemPixelHTML(g) : GEAR_SLOT_ICONS[slot]}
                <div style="position:absolute;bottom:-10px;font-size:6px;color:#665544">${GEAR_SLOT_NAMES[slot]}</div>
              </div>`;
            }).join('')}
          </div>

          <div style="${panelTitle()} font-size:11px;">VAULT (${vault.length}/12)</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px">
            ${Array.from({ length: 12 }, (_, i) => {
              const g = vault[i];
              if (g) {
                return `<div class="vault-slot" data-item-id="${g.id.toString()}" style="${vaultSlotStyle(RARITY_COLORS[g.rarity])}" title="${itemTooltip(g)}">
                  ${itemPixelHTML(g)}
                  <div style="position:absolute;bottom:1px;font-size:6px;color:#665544">${g.slot[0].toUpperCase()}</div>
                </div>`;
              }
              return `<div style="${vaultSlotStyle('#333', true)}">·</div>`;
            }).join('')}
          </div>

          ${backpack.length > 0 ? `
            <div style="${panelTitle()} font-size:11px;">BACKPACK (${backpack.length}/6)</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
              ${backpack.map(g => `<div class="backpack-slot" data-item-id="${g.id.toString()}" style="${vaultSlotStyle(RARITY_COLORS[g.rarity])}" title="${itemTooltip(g)}">${itemPixelHTML(g)}</div>`).join('')}
            </div>
          ` : ''}

          <div style="text-align:center;margin-top:8px">
            <button id="token-btn" ${char.tokens < 1 || vault.length >= 12 ? 'disabled' : ''} style="${tokenBtnStyle(char.tokens >= 1 && vault.length < 12)}">
              🎁 Spend Token (${char.tokens}) — Get Gear
            </button>
          </div>
        </div>
      </div>

      <!-- Dungeon Dive panel -->
      <div style="max-width:820px;width:100%;background:linear-gradient(180deg,#141020,#0c0814);border:1px solid #2a2a3a;border-radius:8px;padding:14px;margin-top:14px">
        <div style="${panelTitle()}">DUNGEON DIVE</div>
        <div style="font-size:8px;color:#665544;text-align:center;margin-bottom:10px">Enter the portal in the hub world · Defeat each boss to unlock the next floor</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
          ${FLOOR_NAMES.map((name, i) => {
            const floorNum  = i + 1;
            const cleared   = this.highestFloorCleared >= floorNum;
            const available = !cleared && this.highestFloorCleared >= i; // floor 1 (i=0) always available
            const borderCol = cleared ? '#4a8a4a' : available ? '#c9a96e' : '#2a2a3a';
            const bgCol     = cleared ? 'rgba(10,40,10,.6)' : available ? 'rgba(20,16,8,.8)' : 'rgba(10,10,16,.4)';
            const numColor  = cleared ? '#4a8a4a' : available ? '#c9a96e' : '#443333';
            const label     = cleared ? '✓ CLEARED' : available ? '⚔ AVAILABLE' : '🔒 LOCKED';
            const labelCol  = cleared ? '#4a8a4a' : available ? '#ee9922' : '#443333';
            return `<div style="border:1px solid ${borderCol};background:${bgCol};border-radius:6px;padding:8px;text-align:center">
              <div style="font-size:16px;font-weight:bold;color:${numColor};letter-spacing:1px">${floorNum}</div>
              <div style="font-size:8px;color:#aa9060;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${name}">${name}</div>
              <div style="font-size:7px;color:#887755;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${FLOOR_BOSSES[i]}">${FLOOR_BOSSES[i]}</div>
              <div style="font-size:7px;color:${labelCol};margin-bottom:6px">${label}</div>
              ${available ? `<button class="dungeon-enter-btn" data-floor="${floorNum}" style="${dungeonBtnStyle(true)}">ENTER</button>` : cleared ? `<button class="dungeon-enter-btn" data-floor="${floorNum}" style="${dungeonBtnStyle(true)}">REPLAY</button>` : `<button disabled style="${dungeonBtnStyle(false)}">ENTER</button>`}
            </div>`;
          }).join('')}
        </div>
      </div>

      <button id="hub-deploy" style="margin-top:16px;padding:12px 48px;font-size:15px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:#c9a96e;border:1px solid #5a4a3a;border-radius:4px;cursor:pointer;letter-spacing:3px">
        ⚔️ DEPLOY
      </button>
      <div style="font-size:8px;color:#554433;margin-top:6px">Equipped gear is at risk · Press P in the field to extract via Portal · Getting hit interrupts the cast</div>

      <div style="margin-top:20px;display:flex;gap:10px">
        <button id="hub-switch-char" style="padding:6px 18px;font-size:9px;font-family:Georgia,serif;background:transparent;color:#443322;border:1px solid #2a1e14;border-radius:4px;cursor:pointer;letter-spacing:2px"
          onmouseover="this.style.color='#887766';this.style.borderColor='#554433'"
          onmouseout="this.style.color='#443322';this.style.borderColor='#2a1e14'"
        >
          SWITCH CHARACTER
        </button>
        <button id="hub-logout" style="padding:6px 18px;font-size:9px;font-family:Georgia,serif;background:transparent;color:#443322;border:1px solid #2a1e14;border-radius:4px;cursor:pointer;letter-spacing:2px"
          onmouseover="this.style.color='#887766';this.style.borderColor='#554433'"
          onmouseout="this.style.color='#443322';this.style.borderColor='#2a1e14'"
        >
          LOG OUT
        </button>
      </div>
    `;

    paintPixelSlots(this.overlay);
    this.bindHubEvents();
  }

  private bindHubEvents() {
    document.getElementById('hub-deploy')?.addEventListener('click', () => this.callbacks.onDeploy());
    document.getElementById('hub-switch-char')?.addEventListener('click', () => this.callbacks.onSwitchCharacter());
    document.getElementById('hub-logout')?.addEventListener('click', () => this.callbacks.onLogout());
    document.getElementById('token-btn')?.addEventListener('click', () => this.callbacks.onSpendToken());

    // Spend XP on attributes
    this.overlay.querySelectorAll<HTMLButtonElement>('.xp-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpendXp(btn.dataset.attr!));
    });

    // Spend XP on skills
    this.overlay.querySelectorAll<HTMLButtonElement>('.skill-xp-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onSpendSkillXp(btn.dataset.skillId!));
    });

    // Equipped slots: click to unequip
    this.overlay.querySelectorAll<HTMLElement>('.equip-slot').forEach(el => {
      const idStr = el.dataset.itemId;
      if (!idStr) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this.callbacks.onUnequipItem(BigInt(idStr)));
    });

    // Vault slots: click to equip
    this.overlay.querySelectorAll<HTMLElement>('.vault-slot').forEach(el => {
      const idStr = el.dataset.itemId;
      if (!idStr) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this.callbacks.onEquipItem(BigInt(idStr)));
    });

    // Backpack slots: click to equip
    this.overlay.querySelectorAll<HTMLElement>('.backpack-slot').forEach(el => {
      const idStr = el.dataset.itemId;
      if (!idStr) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this.callbacks.onEquipItem(BigInt(idStr)));
    });

    // Dungeon floor entry buttons
    this.overlay.querySelectorAll<HTMLButtonElement>('.dungeon-enter-btn').forEach(btn => {
      btn.addEventListener('click', () => this.callbacks.onEnterDungeon(Number(btn.dataset.floor!)));
    });
  }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function panelTitle(): string {
  return 'font-size:12px;letter-spacing:2px;margin-bottom:8px;text-align:center;color:#aa9060;border-bottom:1px solid #2a2a3a;padding-bottom:4px;';
}

function xpBtnStyle(enabled: boolean): string {
  return `width:20px;height:20px;background:#1a1028;border:1px solid ${enabled ? '#c9a96e' : '#3a2a4a'};border-radius:2px;color:#c9a96e;font-size:10px;cursor:${enabled ? 'pointer' : 'default'};font-family:Georgia,serif;`;
}

function eqSlotStyle(filled: boolean): string {
  return `width:40px;height:40px;border:1px solid ${filled ? '#c9a96e' : '#3a2a4a'};background:#0c0814;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;position:relative;margin-bottom:12px;${filled ? '' : 'opacity:.4'};`;
}

function vaultSlotStyle(color: string, empty = false): string {
  return `width:100%;aspect-ratio:1;border:1px solid ${color};background:#0c0814;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:18px;position:relative;${empty ? 'opacity:.3;' : ''}`;
}

function tokenBtnStyle(enabled: boolean): string {
  return `padding:6px 16px;font-size:10px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:#c9a96e;border:1px solid #5a4a3a;border-radius:4px;cursor:${enabled ? 'pointer' : 'default'};letter-spacing:1px;opacity:${enabled ? '1' : '.3'}`;
}

function dungeonBtnStyle(enabled: boolean): string {
  return `width:100%;padding:3px 0;font-size:8px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:${enabled ? '#c9a96e' : '#443333'};border:1px solid ${enabled ? '#5a4a3a' : '#2a2a3a'};border-radius:3px;cursor:${enabled ? 'pointer' : 'default'};letter-spacing:1px;opacity:${enabled ? '1' : '.4'}`;
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
