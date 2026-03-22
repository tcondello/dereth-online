// VirtualJoystick — touch-only joystick overlay for mobile movement.
// Sits bottom-left, above the BottomHud. Only mounts on touch devices.
// GameScene polls getDelta() each frame — no events fired.

export class VirtualJoystick {
  private outer: HTMLElement;
  private knob:  HTMLElement;

  private active   = false;
  private touchId: number | null = null;
  private originX  = 0;
  private originY  = 0;
  private dx       = 0; // -1 to 1
  private dy       = 0; // -1 to 1

  private readonly OUTER_R = 52; // px — outer ring radius
  private readonly KNOB_R  = 24; // px — knob radius
  private readonly MAX_D   = 44; // px — max knob travel from center

  constructor() {
    // Only mount on touch devices
    if (!('ontouchstart' in window)) {
      this.outer = document.createElement('div');
      this.knob  = document.createElement('div');
      return;
    }

    this.outer = document.createElement('div');
    this.outer.id = 'vjoy-outer';
    this.outer.style.cssText = `
      position: fixed;
      bottom: calc(120px + env(safe-area-inset-bottom) + 16px);
      left: 20px;
      width: ${this.OUTER_R * 2}px;
      height: ${this.OUTER_R * 2}px;
      border-radius: 50%;
      background: rgba(200, 160, 80, 0.08);
      border: 2px solid rgba(200, 160, 80, 0.25);
      box-sizing: border-box;
      z-index: 460;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      pointer-events: all;
      user-select: none;
    `;

    this.knob = document.createElement('div');
    this.knob.id = 'vjoy-knob';
    this.knob.style.cssText = `
      width: ${this.KNOB_R * 2}px;
      height: ${this.KNOB_R * 2}px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, rgba(200,160,80,0.5), rgba(100,70,20,0.3));
      border: 1.5px solid rgba(200, 160, 80, 0.45);
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      transition: opacity 0.1s;
    `;

    this.outer.appendChild(this.knob);
    document.body.appendChild(this.outer);

    this.outer.addEventListener('touchstart',  this.onTouchStart,  { passive: false });
    this.outer.addEventListener('touchmove',   this.onTouchMove,   { passive: false });
    this.outer.addEventListener('touchend',    this.onTouchEnd,    { passive: false });
    this.outer.addEventListener('touchcancel', this.onTouchEnd,    { passive: false });
  }

  // ── Touch handlers ─────────────────────────────────────────────────────────

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.active) return;
    const t = e.changedTouches[0];
    this.touchId = t.identifier;
    this.active  = true;
    const rect   = this.outer.getBoundingClientRect();
    this.originX = rect.left + rect.width  / 2;
    this.originY = rect.top  + rect.height / 2;
    this.updateKnob(t.clientX, t.clientY);
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (!this.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.touchId) {
        this.updateKnob(t.clientX, t.clientY);
        return;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.touchId) {
        this.active  = false;
        this.touchId = null;
        this.dx      = 0;
        this.dy      = 0;
        this.knob.style.transform = 'translate(-50%, -50%)';
        return;
      }
    }
  };

  // ── Internals ──────────────────────────────────────────────────────────────

  private updateKnob(clientX: number, clientY: number) {
    const rawDx = clientX - this.originX;
    const rawDy = clientY - this.originY;
    const dist  = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clamp = Math.min(dist, this.MAX_D);
    const angle = Math.atan2(rawDy, rawDx);

    const kx = Math.cos(angle) * clamp;
    const ky = Math.sin(angle) * clamp;

    this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

    this.dx = clamp / this.MAX_D * Math.cos(angle);
    this.dy = clamp / this.MAX_D * Math.sin(angle);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Returns normalized movement vector. Both values are -1 to 1. */
  getDelta(): { dx: number; dy: number } {
    return { dx: this.dx, dy: this.dy };
  }

  isActive(): boolean { return this.active; }

  show() { if (this.outer.isConnected) this.outer.style.display = 'flex'; }
  hide() { if (this.outer.isConnected) this.outer.style.display = 'none'; }
}
