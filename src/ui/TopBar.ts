// TopBar — fixed 36px bar across the top of the screen.
// Shows game title on the left, Settings + Logout buttons on the right.
// Visible only when deployed in-game; hidden on hub/lobby screens.

export class TopBar {
  private el:      HTMLElement;
  private confirm: HTMLElement;

  private callbacks: {
    onSettings: () => void;
    onLogout:   () => void;
  };

  constructor(callbacks: { onSettings: () => void; onLogout: () => void }) {
    this.callbacks = callbacks;

    // ── Main bar ─────────────────────────────────────────────────────────────
    this.el = document.createElement('div');
    this.el.id = 'top-bar';
    this.el.style.cssText = `
      display:none; position:fixed; top:0; left:0; right:0; height:36px;
      z-index:500; box-sizing:border-box;
      background:linear-gradient(180deg, rgba(8,6,14,0.96) 0%, rgba(8,6,14,0.80) 100%);
      border-bottom:1px solid #2a2a3a;
      font-family:Georgia,serif; color:#c9a96e;
      align-items:center; justify-content:space-between;
      padding:0 14px;
    `;
    this.el.innerHTML = `
      <div style="font-size:11px;letter-spacing:4px;color:#aa9060;
                  text-shadow:0 0 12px rgba(200,160,80,.3)">
        DERETH
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="top-bar-settings" title="Settings"
          style="${iconBtn(false)}">&#9881;</button>
        <button id="top-bar-logout" title="Logout"
          style="${iconBtn(true)}">&#10005;</button>
      </div>
    `;
    document.body.appendChild(this.el);

    // ── Confirm dialog ───────────────────────────────────────────────────────
    this.confirm = document.createElement('div');
    this.confirm.id = 'top-bar-confirm';
    this.confirm.style.cssText = `
      display:none; position:fixed; top:0; left:0; right:0; bottom:0;
      z-index:600; background:rgba(0,0,0,0.6);
      font-family:Georgia,serif;
      align-items:center; justify-content:center;
    `;
    this.confirm.innerHTML = `
      <div style="
        background:rgba(8,6,14,0.97); border:1px solid #2a2a3a;
        border-radius:4px; padding:28px 32px; text-align:center;
        min-width:240px;
      ">
        <div style="font-size:12px;letter-spacing:2px;color:#aa9060;margin-bottom:16px">
          LEAVE DERETH?
        </div>
        <div style="font-size:10px;color:#665544;margin-bottom:20px">
          Your character will be recalled to the Lifestone.
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="top-bar-confirm-yes" style="${confirmBtn(true)}">LOGOUT</button>
          <button id="top-bar-confirm-no"  style="${confirmBtn(false)}">CANCEL</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.confirm);

    this.bindEvents();
  }

  private bindEvents() {
    const settingsBtn = document.getElementById('top-bar-settings')!;
    const logoutBtn   = document.getElementById('top-bar-logout')!;

    settingsBtn.addEventListener('click', () => this.callbacks.onSettings());

    settingsBtn.addEventListener('mouseenter', () => {
      settingsBtn.style.borderColor = '#c9a96e';
      settingsBtn.style.color       = '#c9a96e';
    });
    settingsBtn.addEventListener('mouseleave', () => {
      settingsBtn.style.borderColor = '#2a2a3a';
      settingsBtn.style.color       = '#665544';
    });

    logoutBtn.addEventListener('click', () => this.showConfirm());
    logoutBtn.addEventListener('mouseenter', () => {
      logoutBtn.style.borderColor = '#cc4444';
      logoutBtn.style.color       = '#cc4444';
    });
    logoutBtn.addEventListener('mouseleave', () => {
      logoutBtn.style.borderColor = '#4a2a2a';
      logoutBtn.style.color       = '#884444';
    });

    document.getElementById('top-bar-confirm-yes')!
      .addEventListener('click', () => {
        this.hideConfirm();
        this.callbacks.onLogout();
      });
    document.getElementById('top-bar-confirm-no')!
      .addEventListener('click', () => this.hideConfirm());
  }

  private showConfirm() { this.confirm.style.display = 'flex'; }
  private hideConfirm() { this.confirm.style.display = 'none'; }

  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; this.hideConfirm(); }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function iconBtn(danger: boolean): string {
  return `
    background:transparent;
    border:1px solid ${danger ? '#4a2a2a' : '#2a2a3a'};
    color:${danger ? '#884444' : '#665544'};
    width:26px; height:26px; border-radius:2px;
    cursor:pointer; font-size:14px;
    font-family:Georgia,serif;
    display:flex; align-items:center; justify-content:center;
    transition:border-color .15s, color .15s;
  `;
}

function confirmBtn(primary: boolean): string {
  return `
    background:${primary ? 'rgba(100,20,20,0.4)' : 'rgba(20,20,30,0.4)'};
    border:1px solid ${primary ? '#6a2a2a' : '#2a2a3a'};
    color:${primary ? '#cc6666' : '#665544'};
    padding:6px 20px; border-radius:2px;
    cursor:pointer; font-family:Georgia,serif;
    font-size:10px; letter-spacing:2px;
  `;
}
