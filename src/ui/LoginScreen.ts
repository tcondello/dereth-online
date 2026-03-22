// Login screen — shown on page load before SpacetimeDB connection is made.
// Handles Google sign-in state and presents the "Enter Dereth" gateway.

import { signInWithGoogle, signInWithEmail, createAccount } from '../lib/auth';

export class LoginScreen {
  private overlay: HTMLElement;
  private onAuthSuccess: () => void;
  private onEnter: () => void;

  constructor(onAuthSuccess: () => void, onEnter: () => void) {
    this.onAuthSuccess = onAuthSuccess;
    this.onEnter = onEnter;
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);
  }

  show() { this.overlay.style.display = 'flex'; }
  hide() { this.overlay.style.display = 'none'; }

  // Initial state — checking Firebase auth
  showLoading() {
    this.setBody(`
      <div style="font-size:10px;color:#443322;letter-spacing:3px;margin-bottom:32px">
        CHECKING CREDENTIALS...
      </div>
    `);
  }

  // Not signed in — show all auth options
  showSignedOut() {
    this.setBody(`
      <div style="font-size:10px;color:#554433;margin-bottom:20px;letter-spacing:2px">
        A NEW TRAVELER AWAKENS
      </div>

      <button id="login-google-btn" style="${googleBtnStyle()}">
        ${googleSvg()}
        SIGN IN WITH GOOGLE
      </button>

      <div style="display:flex;align-items:center;gap:10px;width:260px;margin:16px 0">
        <div style="flex:1;border-top:1px solid #2a2030"></div>
        <div style="font-size:9px;color:#3a2e22;letter-spacing:2px">OR</div>
        <div style="flex:1;border-top:1px solid #2a2030"></div>
      </div>

      <div id="email-form" style="display:flex;flex-direction:column;gap:8px;width:260px">
        <div id="display-name-row" style="display:none">
          <input id="login-display-name" type="text" placeholder="Display name"
            style="${inputStyle()}" maxlength="24" />
        </div>
        <input id="login-email" type="email" placeholder="Email"
          style="${inputStyle()}" />
        <input id="login-password" type="password" placeholder="Password"
          style="${inputStyle()}" />

        <div style="display:flex;gap:8px;margin-top:2px">
          <button id="login-email-btn" style="${emailBtnStyle(true)}">SIGN IN</button>
          <button id="login-create-btn" style="${emailBtnStyle(false)}">CREATE ACCOUNT</button>
        </div>
      </div>

      <div id="login-status" style="font-size:9px;color:#cc4444;margin-top:10px;min-height:14px;letter-spacing:1px;text-align:center;max-width:260px"></div>
    `);

    this.bindSignedOutEvents();
  }

  // Signed in — show name and Enter button
  showSignedIn(displayName: string | null) {
    const greeting = displayName
      ? `<div style="font-size:10px;color:#554433;margin-bottom:6px;letter-spacing:1px">WELCOME BACK, <span style="color:#887766">${displayName.toUpperCase()}</span></div>`
      : '';
    this.setBody(`
      ${greeting}
      <div style="font-size:10px;color:#554433;margin-bottom:28px;letter-spacing:2px">
        YOUR SOUL REMEMBERS DERETH
      </div>
      <button id="login-enter-btn" style="${enterBtnStyle()}">
        ENTER DERETH
      </button>
      <div id="login-status" style="font-size:9px;color:#554433;margin-top:12px;min-height:16px;letter-spacing:1px"></div>
    `);
    document.getElementById('login-enter-btn')?.addEventListener('click', () => {
      this.setBusy(true);
      this.onEnter();
    });
  }

  showError(message: string) {
    const status = this.overlay.querySelector<HTMLElement>('#login-status');
    if (status) status.textContent = message;
    this.setBusy(false);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private setBody(html: string) {
    const body = this.overlay.querySelector<HTMLElement>('#login-body');
    if (body) body.innerHTML = html;
  }

  private setBusy(busy: boolean) {
    this.overlay.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = busy);
  }

  private bindSignedOutEvents() {
    let createMode = false;

    const toggleMode = (create: boolean) => {
      createMode = create;
      const nameRow = document.getElementById('display-name-row')!;
      const signInBtn = document.getElementById('login-email-btn') as HTMLButtonElement;
      const createBtn = document.getElementById('login-create-btn') as HTMLButtonElement;
      nameRow.style.display = create ? 'block' : 'none';
      signInBtn.style.opacity = create ? '0.5' : '1';
      createBtn.style.opacity = create ? '1' : '0.5';
      signInBtn.style.fontWeight = create ? 'normal' : 'bold';
      createBtn.style.fontWeight = create ? 'bold' : 'normal';
    };

    document.getElementById('login-google-btn')?.addEventListener('click', async () => {
      this.setBusy(true);
      this.clearError();
      try {
        await signInWithGoogle();
        this.onAuthSuccess();
      } catch (err: any) {
        this.showError(err.message ?? 'Google sign-in failed');
      }
    });

    document.getElementById('login-email-btn')?.addEventListener('click', async () => {
      if (createMode) { toggleMode(false); return; }
      const email = (document.getElementById('login-email') as HTMLInputElement).value.trim();
      const password = (document.getElementById('login-password') as HTMLInputElement).value;
      if (!email || !password) { this.showError('Email and password required'); return; }
      this.setBusy(true);
      this.clearError();
      try {
        await signInWithEmail(email, password);
        this.onAuthSuccess();
      } catch (err: any) {
        this.showError(friendlyError(err.code));
      }
    });

    document.getElementById('login-create-btn')?.addEventListener('click', async () => {
      if (!createMode) { toggleMode(true); return; }
      const email = (document.getElementById('login-email') as HTMLInputElement).value.trim();
      const password = (document.getElementById('login-password') as HTMLInputElement).value;
      const displayName = (document.getElementById('login-display-name') as HTMLInputElement).value.trim();
      if (!email || !password) { this.showError('Email and password required'); return; }
      if (!displayName) { this.showError('Display name required'); return; }
      if (password.length < 6) { this.showError('Password must be at least 6 characters'); return; }
      this.setBusy(true);
      this.clearError();
      try {
        await createAccount(email, password, displayName);
        this.onAuthSuccess();
      } catch (err: any) {
        this.showError(friendlyError(err.code));
      }
    });

    // Enter key submits
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') document.getElementById('login-email-btn')?.click();
    };
    document.getElementById('login-email')?.addEventListener('keydown', onKey);
    document.getElementById('login-password')?.addEventListener('keydown', onKey);
  }

  private clearError() {
    const status = this.overlay.querySelector<HTMLElement>('#login-status');
    if (status) status.textContent = '';
  }

  private createOverlay(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'login-overlay';
    div.style.cssText = `
      display:flex; position:fixed; top:0; left:0; width:100%; height:100%;
      z-index:1000; flex-direction:column; align-items:center; justify-content:center;
      background: radial-gradient(ellipse at center, #0e0c18 0%, #06060d 100%);
      font-family: Georgia, serif; color: #c9a96e;
    `;

    div.innerHTML = `
      <!-- Decorative rune row -->
      <div style="font-size:18px;color:#2a2440;letter-spacing:12px;margin-bottom:24px;user-select:none">
        ᚛ ᚜ ⊕ ◈ ᚛ ᚜ ⊕ ◈ ᚛ ᚜
      </div>

      <!-- Title -->
      <div style="
        font-size:52px;
        letter-spacing:14px;
        color:#c9a96e;
        text-shadow:
          0 0 40px rgba(200,160,80,.4),
          0 0 80px rgba(200,120,40,.15);
        margin-bottom:4px;
        font-variant:small-caps;
      ">DERETH</div>

      <div style="font-size:11px;letter-spacing:5px;color:#665544;margin-bottom:6px">
        ONLINE
      </div>

      <div style="
        font-size:9px;letter-spacing:3px;color:#3a2e22;
        margin-bottom:32px;
      ">ASHERON'S CALL  ×  VAMPIRE SURVIVORS</div>

      <!-- Divider -->
      <div style="width:280px;border-top:1px solid #2a2030;margin-bottom:28px"></div>

      <!-- Dynamic body (sign-in state) -->
      <div id="login-body"></div>

      <!-- Decorative bottom rune row -->
      <div style="
        font-size:14px;color:#1e1828;letter-spacing:10px;
        position:absolute;bottom:28px;user-select:none;
      ">
        ᚛ ᚜ ⊕ ◈ ᚛ ᚜ ⊕ ◈ ᚛ ᚜
      </div>
    `;

    return div;
  }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function googleSvg(): string {
  return `<svg width="16" height="16" viewBox="0 0 48 48" style="margin-right:8px;flex-shrink:0">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.2 30.3 0 24 0 14.8 0 6.9 5.4 3 13.3l7.9 6.1C12.8 13 17.9 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/>
    <path fill="#FBBC05" d="M10.9 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.4 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.4 10.7l8.5-6.1z"/>
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.1 0-11.2-4.1-13-9.7l-8 6.1C6.8 42.7 14.7 48 24 48z"/>
  </svg>`;
}

function googleBtnStyle(): string {
  return `display:inline-flex;align-items:center;padding:10px 24px;font-size:12px;font-family:Georgia,serif;font-variant:small-caps;letter-spacing:3px;background:#fff;color:#333;border:none;border-radius:4px;cursor:pointer;box-shadow:0 1px 6px rgba(0,0,0,.4);`;
}

function inputStyle(): string {
  return `width:100%;box-sizing:border-box;padding:9px 12px;font-size:11px;font-family:Georgia,serif;background:#0c0814;color:#c9a96e;border:1px solid #3a2a4a;border-radius:4px;outline:none;letter-spacing:1px;`;
}

function emailBtnStyle(primary: boolean): string {
  return `flex:1;padding:9px 4px;font-size:10px;font-family:Georgia,serif;font-variant:small-caps;letter-spacing:2px;background:${primary ? 'linear-gradient(180deg,#1e1830,#120e22)' : 'transparent'};color:#c9a96e;border:1px solid #3a2a4a;border-radius:4px;cursor:pointer;`;
}

function enterBtnStyle(): string {
  return `padding:14px 64px;font-size:14px;font-family:Georgia,serif;font-variant:small-caps;letter-spacing:5px;background:linear-gradient(180deg,#1e1830,#120e22);color:#c9a96e;border:1px solid #5a4a3a;border-radius:4px;cursor:pointer;box-shadow:0 0 20px rgba(100,80,40,.1);`;
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email':            'Invalid email address',
    'auth/user-not-found':           'No account with that email',
    'auth/wrong-password':           'Incorrect password',
    'auth/invalid-credential':       'Incorrect email or password',
    'auth/email-already-in-use':     'An account with that email already exists',
    'auth/weak-password':            'Password must be at least 6 characters',
    'auth/too-many-requests':        'Too many attempts — try again later',
    'auth/popup-closed-by-user':     'Sign-in cancelled',
    'auth/network-request-failed':   'Network error — check your connection',
  };
  return map[code] ?? 'Something went wrong — try again';
}
