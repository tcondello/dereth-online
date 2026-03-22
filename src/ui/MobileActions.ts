// MobileActions — on-screen action buttons for touch devices.
// Replaces F (portal), P (recall), C (char panel), R (respawn) keys.
// Only mounts on touch devices.

export interface MobileActionCallbacks {
  onPortal:    () => void;
  onRecall:    () => void;
  onCharPanel: () => void;
  onRespawn:   () => void;
}

export class MobileActions {
  private el: HTMLElement | null = null;
  private respawnBtn: HTMLElement | null = null;
  private readonly isTouch: boolean;

  constructor(callbacks: MobileActionCallbacks) {
    // maxTouchPoints is more reliable than ontouchstart on iOS Safari + Android Chrome
    this.isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (!this.isTouch) return;

    this.el = document.createElement('div');
    this.el.id = 'mobile-actions';
    this.el.style.cssText = `
      display: none;
      position: fixed;
      bottom: calc(120px + env(safe-area-inset-bottom) + 16px);
      right: 16px;
      z-index: 460;
      flex-direction: column;
      gap: 10px;
      align-items: center;
    `;

    const buttons: Array<{ id: string; label: string; hint: string; cb: () => void; danger?: boolean }> = [
      { id: 'mact-panel',  label: '≡',  hint: 'Character', cb: callbacks.onCharPanel },
      { id: 'mact-recall', label: '✦',  hint: 'Recall',    cb: callbacks.onRecall },
      { id: 'mact-portal', label: '⬡',  hint: 'Portal',    cb: callbacks.onPortal },
    ];

    for (const b of buttons) {
      this.el.appendChild(this.makeButton(b.id, b.label, b.hint, b.cb));
    }

    // Respawn is hidden until death
    this.respawnBtn = this.makeButton('mact-respawn', '↺', 'Respawn', callbacks.onRespawn, true);
    this.respawnBtn.style.display = 'none';
    this.el.appendChild(this.respawnBtn);

    document.body.appendChild(this.el);
  }

  private makeButton(id: string, label: string, hint: string, cb: () => void, danger = false): HTMLElement {
    const btn = document.createElement('button');
    btn.id = id;
    btn.style.cssText = `
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(${danger ? '120,20,20' : '13,10,20'},0.88);
      border: 1.5px solid ${danger ? 'rgba(180,40,40,0.6)' : 'rgba(200,160,80,0.3)'};
      color: ${danger ? '#ee6666' : '#c9a96e'};
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      cursor: pointer;
      touch-action: manipulation;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      padding: 0;
    `;
    btn.innerHTML = `
      <span style="font-size:18px;line-height:1">${label}</span>
      <span style="font-size:7px;letter-spacing:1px;color:${danger ? '#aa4444' : '#887755'};margin-top:1px">${hint.toUpperCase()}</span>
    `;
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.style.background = `rgba(${danger ? '160,30,30' : '40,30,60'},0.95)`;
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      btn.style.background = `rgba(${danger ? '120,20,20' : '13,10,20'},0.88)`;
      cb();
    }, { passive: false });
    return btn;
  }

  setDead(dead: boolean) {
    if (!this.respawnBtn) return;
    this.respawnBtn.style.display = dead ? 'flex' : 'none';
  }

  show() { if (this.el) this.el.style.display = 'flex'; }
  hide() { if (this.el) this.el.style.display = 'none'; }
}
