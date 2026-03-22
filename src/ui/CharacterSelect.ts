// Character selection screen — shown when activeCharacterId === 0 (no char selected).
// Lists up to 3 character slots: occupied slots can be selected, empty slots open creation.

export interface CharInfo {
  id: bigint;
  charName: string;
  race: string;
  level: number;
}

export class CharacterSelect {
  private overlay: HTMLElement;
  private onSelect: (id: bigint) => void;
  private onCreate: () => void;

  constructor(onSelect: (id: bigint) => void, onCreate: () => void) {
    this.onSelect = onSelect;
    this.onCreate = onCreate;
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);
  }

  show(chars: CharInfo[]) {
    this.render(chars);
    this.overlay.style.display = 'flex';
  }

  hide() { this.overlay.style.display = 'none'; }

  private createOverlay(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'char-select-overlay';
    div.style.cssText = `
      display:none; position:fixed; top:0; left:0; width:100%; height:100%;
      z-index:800; flex-direction:column; align-items:center; justify-content:center;
      background: radial-gradient(ellipse at center, #0e0c18 0%, #06060d 100%);
      font-family: Georgia, serif; color: #c9a96e;
    `;
    return div;
  }

  private render(chars: CharInfo[]) {
    const slots = Array.from({ length: 3 }, (_, idx) => chars[idx] ?? null);

    const slotHtml = slots.map((char) => {
      if (char) {
        return `
          <div class="char-slot" data-char-id="${char.id.toString()}" style="${slotStyle(true)}">
            <div style="font-size:13px;letter-spacing:2px;margin-bottom:3px">${char.charName}</div>
            <div style="font-size:9px;color:#887766;margin-bottom:2px;letter-spacing:1px">${char.race.toUpperCase()}</div>
            <div style="font-size:9px;color:#44aaff;margin-bottom:10px">Level ${char.level}</div>
            <button class="select-btn" data-char-id="${char.id.toString()}" style="${selectBtnStyle()}">
              ENTER WORLD
            </button>
          </div>
        `;
      } else {
        const canCreate = chars.length < 3;
        return `
          <div style="${slotStyle(false, !canCreate)}">
            <div style="font-size:22px;color:#2a2440;margin-bottom:8px">✦</div>
            <div style="font-size:9px;color:#443322;letter-spacing:2px;margin-bottom:10px">
              ${canCreate ? 'EMPTY SLOT' : 'LOCKED'}
            </div>
            ${canCreate ? `<button class="create-btn" style="${createBtnStyle()}">+ CREATE</button>` : ''}
          </div>
        `;
      }
    }).join('');

    this.overlay.innerHTML = `
      <div style="font-size:8px;color:#2a2440;letter-spacing:8px;margin-bottom:20px;user-select:none">
        ᚛ ᚜ ⊕ ◈ ᚛ ᚜
      </div>

      <div style="font-size:28px;letter-spacing:8px;color:#c9a96e;text-shadow:0 0 30px rgba(200,160,80,.3);margin-bottom:4px;font-variant:small-caps">
        CHOOSE YOUR TRAVELER
      </div>
      <div style="font-size:9px;color:#554433;letter-spacing:3px;margin-bottom:32px">
        SELECT A CHARACTER OR CREATE A NEW ONE
      </div>

      <div style="display:flex;gap:20px;align-items:flex-start">
        ${slotHtml}
      </div>
    `;

    // Bind events
    this.overlay.querySelectorAll<HTMLButtonElement>('.select-btn').forEach(btn => {
      btn.addEventListener('click', () => this.onSelect(BigInt(btn.dataset.charId!)));
    });
    this.overlay.querySelectorAll<HTMLButtonElement>('.create-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.hide();
        this.onCreate();
      });
    });
  }
}

function slotStyle(occupied: boolean, locked = false): string {
  return `
    width:180px; min-height:160px; padding:20px 16px;
    background:linear-gradient(180deg,#141020,#0c0814);
    border:1px solid ${occupied ? '#5a4a3a' : locked ? '#1a1520' : '#2a2030'};
    border-radius:8px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center;
    ${locked ? 'opacity:.35;' : ''}
  `.replace(/\n\s+/g, '');
}

function selectBtnStyle(): string {
  return `
    padding:8px 22px; font-size:11px; font-family:Georgia,serif;
    font-variant:small-caps; letter-spacing:3px;
    background:linear-gradient(180deg,#1e1830,#120e22);
    color:#c9a96e; border:1px solid #5a4a3a; border-radius:4px;
    cursor:pointer; transition:border-color .2s;
  `.replace(/\n\s+/g, '');
}

function createBtnStyle(): string {
  return `
    padding:7px 18px; font-size:10px; font-family:Georgia,serif;
    letter-spacing:2px;
    background:transparent; color:#665544; border:1px solid #2a2030;
    border-radius:4px; cursor:pointer; transition:border-color .2s,color .2s;
  `.replace(/\n\s+/g, '');
}
