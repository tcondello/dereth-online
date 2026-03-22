// SettingsPanel — slide-in settings overlay below the TopBar.
// Matches InGamePanel dark parchment aesthetic.
// Sections: Radar toggle, Sound sliders (future), Key reference.

export class SettingsPanel {
  private overlay: HTMLElement;

  private radarOn:   boolean;
  private masterVol: number;
  private sfxVol:    number;

  private pixelArtOn: boolean;

  private callbacks: {
    onRadarToggle:    (visible: boolean) => void;
    onPixelArtToggle: (enabled: boolean) => void;
  };

  constructor(callbacks: {
    onRadarToggle:    (visible: boolean) => void;
    onPixelArtToggle: (enabled: boolean) => void;
  }) {
    this.callbacks = callbacks;

    // Persist settings across sessions
    this.radarOn    = localStorage.getItem('setting_radar')      !== 'false';
    this.pixelArtOn = localStorage.getItem('setting_pixel_art')  !== 'false';
    this.masterVol = parseInt(localStorage.getItem('setting_master_vol') ?? '80', 10);
    this.sfxVol    = parseInt(localStorage.getItem('setting_sfx_vol')    ?? '80', 10);

    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-panel';
    this.overlay.style.cssText = `
      display:none; position:fixed; top:36px; right:0; width:280px;
      max-height:calc(100vh - 36px); overflow-y:auto;
      z-index:490; box-sizing:border-box;
      background:rgba(8,6,14,0.97); border-left:1px solid #2a2a3a;
      border-bottom:1px solid #2a2a3a;
      font-family:Georgia,serif; color:#c9a96e;
      padding:12px 14px 28px;
    `;
    document.body.appendChild(this.overlay);
    this.render();
  }

  private render() {
    this.overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:11px;letter-spacing:3px;
                    text-shadow:0 0 12px rgba(200,160,80,.3)">SETTINGS</div>
        <button id="sp-close" style="${closeBtn()}">&#215;</button>
      </div>

      <div style="${section()}">DISPLAY</div>
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:4px 0 6px;font-size:10px">
        <span style="color:#aa9977">Show Minimap</span>
        <button id="sp-radar-toggle" style="${toggle(this.radarOn)}">
          ${this.radarOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:4px 0 8px;font-size:10px">
        <span style="color:#aa9977">Pixel Art Mode</span>
        <button id="sp-pixel-art-toggle" style="${toggle(this.pixelArtOn)}">
          ${this.pixelArtOn ? 'ON' : 'OFF'}
        </button>
      </div>

      <div style="${section()}">SOUND <span style="font-size:8px;color:#443322;letter-spacing:0">&nbsp;— coming soon</span></div>
      <div style="padding:4px 0 8px;font-size:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="color:#aa9977;width:76px">Master</span>
          <input id="sp-master-vol" type="range" min="0" max="100"
            value="${this.masterVol}"
            style="width:116px;accent-color:#c9a96e;opacity:.5" disabled>
          <span id="sp-master-val"
            style="color:#554433;width:26px;text-align:right">${this.masterVol}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="color:#aa9977;width:76px">SFX</span>
          <input id="sp-sfx-vol" type="range" min="0" max="100"
            value="${this.sfxVol}"
            style="width:116px;accent-color:#c9a96e;opacity:.5" disabled>
          <span id="sp-sfx-val"
            style="color:#554433;width:26px;text-align:right">${this.sfxVol}</span>
        </div>
      </div>

      <div style="${section()}">KEY REFERENCE</div>
      <div style="font-size:9px;line-height:2">
        ${keyRow('WASD / ↑↓←→', 'Move')}
        ${keyRow('C', 'Character panel')}
        ${keyRow('F', 'Use portal')}
        ${keyRow('P', 'Cast recall portal')}
        ${keyRow('R', 'Respawn (when dead)')}
        ${keyRow('[C] close', 'Character panel toggle')}
      </div>
    `;
    this.bindEvents();
  }

  private bindEvents() {
    document.getElementById('sp-close')!
      .addEventListener('click', () => this.hide());

    document.getElementById('sp-radar-toggle')!
      .addEventListener('click', () => {
        this.radarOn = !this.radarOn;
        localStorage.setItem('setting_radar', String(this.radarOn));
        this.callbacks.onRadarToggle(this.radarOn);
        this.render();
      });

    document.getElementById('sp-pixel-art-toggle')!
      .addEventListener('click', () => {
        this.pixelArtOn = !this.pixelArtOn;
        localStorage.setItem('setting_pixel_art', String(this.pixelArtOn));
        this.callbacks.onPixelArtToggle(this.pixelArtOn);
        this.render();
      });

    // Volume sliders are disabled (no audio yet) but wired for when it lands
    const masterSlider = document.getElementById('sp-master-vol') as HTMLInputElement;
    masterSlider?.addEventListener('input', () => {
      this.masterVol = parseInt(masterSlider.value, 10);
      localStorage.setItem('setting_master_vol', String(this.masterVol));
      const el = document.getElementById('sp-master-val');
      if (el) el.textContent = String(this.masterVol);
    });

    const sfxSlider = document.getElementById('sp-sfx-vol') as HTMLInputElement;
    sfxSlider?.addEventListener('input', () => {
      this.sfxVol = parseInt(sfxSlider.value, 10);
      localStorage.setItem('setting_sfx_vol', String(this.sfxVol));
      const el = document.getElementById('sp-sfx-val');
      if (el) el.textContent = String(this.sfxVol);
    });
  }

  toggle()    { this.overlay.style.display === 'none' ? this.show() : this.hide(); }
  show()      { this.overlay.style.display = 'block'; }
  hide()      { this.overlay.style.display = 'none'; }
  isVisible() { return this.overlay.style.display !== 'none'; }

  /** Initial radar state read by main.ts when wiring scene */
  getRadarOn()    { return this.radarOn; }
  getPixelArtOn() { return this.pixelArtOn; }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function section(): string {
  return 'font-size:10px;letter-spacing:2px;margin:10px 0 4px;' +
         'color:#aa9060;border-bottom:1px solid #2a2a3a;padding-bottom:3px;';
}

function closeBtn(): string {
  return 'background:transparent;border:1px solid #2a2a3a;color:#665544;' +
         'width:20px;height:20px;border-radius:2px;cursor:pointer;' +
         'font-family:Georgia,serif;font-size:11px;';
}

function toggle(on: boolean): string {
  return `background:${on ? 'rgba(60,120,60,0.25)' : 'rgba(80,30,30,0.25)'};` +
         `border:1px solid ${on ? '#4a8a4a' : '#6a2a2a'};` +
         `color:${on ? '#88cc88' : '#aa5555'};` +
         'padding:3px 12px;border-radius:2px;cursor:pointer;' +
         'font-family:Georgia,serif;font-size:10px;letter-spacing:1px;';
}

function keyRow(key: string, label: string): string {
  return `<div style="display:flex;justify-content:space-between;padding:0">
    <span style="color:#c9a96e;font-family:monospace;font-size:9px">${key}</span>
    <span style="color:#887766">${label}</span>
  </div>`;
}
