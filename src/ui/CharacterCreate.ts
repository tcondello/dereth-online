// Character Creation screen — mirrors the prototype's character creation UI
// Injects a full-screen HTML overlay on top of the Phaser canvas.

export interface CharacterData {
  charName: string; race: string;
  attrStr: number; attrEnd: number; attrCoord: number;
  attrQuick: number; attrFoc: number; attrSelf: number;
}

const RACES = [
  { id: 'aluvian',    name: 'Aluvian',    icon: '🛡️', desc: '+5 STR, +5 END',        bonus: { STR: 5, END: 5 },           mastery: 'Heavy Weapons' },
  { id: 'gharundim',  name: "Gharu'ndim", icon: '🔮', desc: '+5 FOC, +5 SELF',       bonus: { FOC: 5, SELF: 5 },          mastery: 'War Magic' },
  { id: 'sho',        name: 'Sho',        icon: '⛩️', desc: '+5 COORD, +5 QUICK',   bonus: { COORD: 5, QUICK: 5 },       mastery: 'Light Weapons' },
  { id: 'viamontian', name: 'Viamontian', icon: '👑', desc: '+3 STR, COORD, END',   bonus: { STR: 3, COORD: 3, END: 3 }, mastery: 'Heavy Weapons' },
  { id: 'umbraen',    name: 'Umbraen',    icon: '🌑', desc: '+5 FOC, +5 QUICK',     bonus: { FOC: 5, QUICK: 5 },         mastery: 'Missile' },
];

const ATTRS = [
  { k: 'STR',   n: 'Strength' },
  { k: 'END',   n: 'Endurance' },
  { k: 'COORD', n: 'Coordination' },
  { k: 'QUICK', n: 'Quickness' },
  { k: 'FOC',   n: 'Focus' },
  { k: 'SELF',  n: 'Self' },
];

const ATTR_TOTAL = 200;
const ATTR_MIN   = 10;
const ATTR_MAX   = 100;

export class CharacterCreate {
  private overlay: HTMLElement;
  private onSubmit: (data: CharacterData) => void;

  // State
  private selectedRace: string | null = null;
  private attrs: Record<string, number> = { STR: 10, END: 10, COORD: 10, QUICK: 10, FOC: 10, SELF: 10 };

  constructor(onSubmit: (data: CharacterData) => void) {
    this.onSubmit = onSubmit;
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);
    this.render();
  }

  show() { this.overlay.style.display = 'flex'; }
  hide() { this.overlay.style.display = 'none'; }

  private createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'char-create-overlay';
    el.style.cssText = `
      display:none; position:fixed; top:0; left:0; width:100%; height:100%;
      z-index:500; flex-direction:column; align-items:center; overflow-y:auto;
      padding:20px 10px 40px;
      background: radial-gradient(ellipse at center, #151025, #0a0a0f);
      font-family: Georgia, serif; color: #c9a96e;
    `;
    return el;
  }

  private render() {
    this.overlay.innerHTML = `
      <div style="font-size:32px;letter-spacing:6px;text-shadow:0 0 30px rgba(200,160,80,.4);margin:10px 0 4px">DERETH SURVIVORS</div>
      <div style="font-size:11px;color:#665544;letter-spacing:3px;margin-bottom:16px">CREATE YOUR CHARACTER</div>

      <div style="display:flex;gap:14px;max-width:640px;width:100%;flex-wrap:wrap;justify-content:center">

        <!-- Identity panel -->
        <div id="cc-identity" style="min-width:220px;max-width:300px;flex:1;background:linear-gradient(180deg,#141020,#0c0814);border:1px solid #2a2a3a;border-radius:8px;padding:14px">
          <div style="font-size:12px;letter-spacing:2px;margin-bottom:10px;text-align:center;color:#aa9060;border-bottom:1px solid #2a2a3a;padding-bottom:5px">IDENTITY & HERITAGE</div>
          <input id="cc-name" type="text" placeholder="Name..." maxlength="20" spellcheck="false"
            style="width:100%;padding:7px 10px;font-size:13px;font-family:Georgia,serif;background:#0a0814;border:1px solid #3a2a4a;border-radius:4px;color:#c9a96e;outline:none;letter-spacing:1px;margin-bottom:10px;box-sizing:border-box">
          <div id="cc-races" style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:8px"></div>
          <div id="cc-race-desc" style="font-size:9px;color:#776655;text-align:center;min-height:16px"></div>
          <div id="cc-race-mastery" style="font-size:8px;color:#aa8844;text-align:center;margin-top:2px"></div>
          <div style="font-size:8px;color:#554433;text-align:center;margin-top:8px;line-height:1.5">All skills start trained.<br>Attributes govern effectiveness.<br>Specialize skills in-game with XP.</div>
        </div>

        <!-- Attributes panel -->
        <div style="min-width:220px;max-width:300px;flex:1;background:linear-gradient(180deg,#141020,#0c0814);border:1px solid #2a2a3a;border-radius:8px;padding:14px">
          <div style="font-size:12px;letter-spacing:2px;margin-bottom:6px;text-align:center;color:#aa9060;border-bottom:1px solid #2a2a3a;padding-bottom:5px">ATTRIBUTES</div>
          <div style="font-size:8px;color:#665544;text-align:center;margin-bottom:5px">200 total · Min 10 · Max 100 · 140 free points</div>
          <div id="cc-attr-unspent" style="text-align:center;font-size:11px;color:#aa9060;margin-bottom:6px">Unspent: <span style="color:#44aaff;font-size:12px;font-weight:bold">0</span></div>
          <div id="cc-attrs"></div>
          <div style="margin-top:8px;text-align:center;font-size:10px">Health: <span id="cc-hp" style="color:#cc4444;font-weight:bold">—</span></div>
        </div>

      </div>

      <button id="cc-submit" disabled style="margin-top:16px;padding:10px 40px;font-size:14px;font-family:Georgia,serif;background:linear-gradient(180deg,#2a2035,#1a1028);color:#c9a96e;border:1px solid #5a4a3a;border-radius:4px;cursor:pointer;letter-spacing:3px">ENTER DERETH</button>
      <div style="font-size:8px;color:#443322;margin-top:8px">WASD to move · Auto-attack enemies · Extract with loot via Portal (P)</div>
    `;

    this.buildRaces();
    this.buildAttrs();
    this.bindEvents();
    this.update();
  }

  private buildRaces() {
    const container = document.getElementById('cc-races')!;
    for (const race of RACES) {
      const btn = document.createElement('div');
      btn.dataset.race = race.id;
      btn.style.cssText = `padding:6px 8px;background:#0f0a18;border:1px solid #2a2a3a;border-radius:5px;cursor:pointer;text-align:center;transition:all .2s;flex:1;min-width:52px;`;
      btn.innerHTML = `<div style="font-size:18px">${race.icon}</div><div style="font-size:8px;margin-top:2px;letter-spacing:1px">${race.name}</div>`;
      btn.onclick = () => {
        this.selectedRace = race.id;
        document.querySelectorAll('[data-race]').forEach(b => {
          (b as HTMLElement).style.borderColor = (b as HTMLElement).dataset.race === race.id ? '#c9a96e' : '#2a2a3a';
          (b as HTMLElement).style.background  = (b as HTMLElement).dataset.race === race.id ? '#1a1525' : '#0f0a18';
        });
        document.getElementById('cc-race-desc')!.textContent    = race.desc;
        document.getElementById('cc-race-mastery')!.textContent = `Mastery: ${race.mastery}`;
        this.update();
      };
      container.appendChild(btn);
    }
  }

  private buildAttrs() {
    const container = document.getElementById('cc-attrs')!;
    for (const a of ATTRS) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px solid #1a1525;';
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:9px;color:#887766;width:36px">${a.k}</span>
          <span style="font-size:10px;color:#aa9977;width:72px">${a.n}</span>
        </div>
        <div style="display:flex;align-items:center;gap:3px">
          <button class="attr-btn" data-attr="${a.k}" data-d="-10" style="${btnStyle()}">−10</button>
          <button class="attr-btn" data-attr="${a.k}" data-d="-1"  style="${btnStyle()}">−</button>
          <span id="av-${a.k}" style="font-size:14px;width:44px;text-align:center;font-weight:bold">10</span>
          <button class="attr-btn" data-attr="${a.k}" data-d="1"   style="${btnStyle()}">+</button>
          <button class="attr-btn" data-attr="${a.k}" data-d="10"  style="${btnStyle()}">+10</button>
        </div>`;
      container.appendChild(row);
    }
  }

  private bindEvents() {
    document.getElementById('cc-name')!.addEventListener('input', () => this.update());

    this.overlay.addEventListener('click', e => {
      const target = e.target as HTMLElement;

      // Attribute buttons
      if (target.classList.contains('attr-btn')) {
        const attr  = target.dataset.attr!;
        const delta = parseInt(target.dataset.d!);
        const cur   = this.attrs[attr];
        const spent = Object.values(this.attrs).reduce((a, b) => a + b, 0) - 6 * ATTR_MIN;
        const free  = (ATTR_TOTAL - 6 * ATTR_MIN) - spent;
        const nv    = cur + delta;
        if (nv >= ATTR_MIN && nv <= ATTR_MAX && (delta < 0 || free >= delta)) {
          this.attrs[attr] = nv;
          this.update();
        }
      }

    });

    document.getElementById('cc-submit')!.addEventListener('click', () => {
      if (!this.canSubmit()) return;
      const name   = (document.getElementById('cc-name') as HTMLInputElement).value.trim();
      this.onSubmit({
        charName: name, race: this.selectedRace!,
        attrStr: this.attrs.STR, attrEnd: this.attrs.END, attrCoord: this.attrs.COORD,
        attrQuick: this.attrs.QUICK, attrFoc: this.attrs.FOC, attrSelf: this.attrs.SELF,
      });
    });
  }

  private update() {
    const spent = Object.values(this.attrs).reduce((a, b) => a + b, 0) - 6 * ATTR_MIN;
    const free  = (ATTR_TOTAL - 6 * ATTR_MIN) - spent;

    // Unspent display
    const unspentEl = document.getElementById('cc-attr-unspent');
    if (unspentEl) unspentEl.innerHTML = `Unspent: <span style="color:#44aaff;font-size:12px;font-weight:bold">${free}</span>`;

    // Attribute values (base + race bonus)
    const race = RACES.find(r => r.id === this.selectedRace);
    for (const a of ATTRS) {
      const el = document.getElementById(`av-${a.k}`);
      if (!el) continue;
      const base  = this.attrs[a.k];
      const bonus = race?.bonus?.[a.k as keyof typeof race.bonus] ?? 0;
      const eff   = base + (bonus as number);
      el.innerHTML = bonus > 0 ? `${eff}<span style="font-size:8px;color:#2aaa2a">+${bonus}</span>` : `${base}`;
    }

    // HP preview
    const end   = this.attrs.END + ((race?.bonus?.END as number) ?? 0);
    const hp    = Math.floor(end / 2) + 10;
    const hpEl  = document.getElementById('cc-hp');
    if (hpEl) hpEl.textContent = String(hp);

    // Attr button disabled states
    document.querySelectorAll<HTMLButtonElement>('.attr-btn').forEach(btn => {
      const attr  = btn.dataset.attr!;
      const delta = parseInt(btn.dataset.d!);
      const nv    = this.attrs[attr] + delta;
      const nSpent = spent + delta;
      btn.disabled = nv < ATTR_MIN || nv > ATTR_MAX || nSpent < 0 || nSpent > (ATTR_TOTAL - 6 * ATTR_MIN);
      btn.style.opacity = btn.disabled ? '0.2' : '1';
    });

    // Submit button
    const submit = document.getElementById('cc-submit') as HTMLButtonElement;
    if (submit) submit.disabled = !this.canSubmit();
  }

  private canSubmit(): boolean {
    const name = (document.getElementById('cc-name') as HTMLInputElement)?.value.trim() ?? '';
    if (name.length < 2) return false;
    if (!this.selectedRace) return false;
    const attrSum = Object.values(this.attrs).reduce((a, b) => a + b, 0);
    if (attrSum !== ATTR_TOTAL) return false;
    return true;
  }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function btnStyle(): string {
  return 'width:22px;height:22px;background:#1a1028;border:1px solid #3a2a4a;border-radius:3px;color:#c9a96e;font-size:11px;cursor:pointer;font-family:Georgia,serif;';
}

