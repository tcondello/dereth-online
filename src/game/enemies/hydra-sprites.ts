// hydra-sprites.ts — TypeScript port of HYDRA_ANIMS from boss-lab.tsx
// Renders to a 32×32 grid each frame. Used by BossRenderer for dynamic canvas animation.

const B = 32;
export type Grid32 = (string | null)[][];

export interface HydraState {
  heads: boolean[];       // alive flags per head (length = head count)
  phase: number;          // 0 = awakened, 1 = enraged
  severTarget?: number;   // head index currently being severed
  regrowTarget?: number;  // head index currently regrowing
}

// ── Palette ─────────────────────────────────────────────────────────────────
export const HYDRA_PAL = [
  "#0a1a0a","#1a3a1a","#2a5a2a","#3a7a3a",
  "#4aba6a","#6ada8a","#a0eab0","#d0ffd8",
  "#8a2a8a","#cc44cc",
];

// ── Grid helpers ─────────────────────────────────────────────────────────────
function sg(g: Grid32, r: number, c: number, col: string | null) {
  if (r >= 0 && r < B && c >= 0 && c < B && col) g[r][c] = col;
}

function ellipse(
  g: Grid32, cy: number, cx: number, ry: number, rx: number,
  colFn: (d: number, r: number, c: number) => string | null,
) {
  for (let r = cy - ry; r <= cy + ry; r++) for (let c = cx - rx; c <= cx + rx; c++) {
    const d = ((r - cy) / ry) ** 2 + ((c - cx) / rx) ** 2;
    if (d <= 1) sg(g, r, c, colFn(d, r, c));
  }
}

// ── Body ─────────────────────────────────────────────────────────────────────
function hydraBody(g: Grid32, pal: string[], tick: number, bob: number): number {
  const dk = pal[0], md = pal[2], lt = pal[4], hi = pal[5];
  const bodyY = 20 + Math.round(bob);
  for (let r = bodyY - 3; r <= bodyY + 4; r++) for (let c = 3; c <= 29; c++) {
    const coil = Math.sin((c - 3) / 26 * Math.PI * 3 + tick * 0.08) * 2;
    if (Math.abs(r - bodyY - coil) >= 3) continue;
    const isEdge = Math.abs(r - bodyY - coil) > 2;
    sg(g, r, c, isEdge ? dk : Math.sin(r * 4 + c * 3) > 0.5 ? md : lt);
  }
  for (let c = 5; c <= 27; c++) {
    const coil = Math.sin((c - 3) / 26 * Math.PI * 3 + tick * 0.08) * 2;
    sg(g, bodyY + Math.round(coil) + 2, c, hi);
  }
  return bodyY;
}

// ── Head + neck ──────────────────────────────────────────────────────────────
function hydraHead(
  g: Grid32, pal: string[], tick: number,
  idx: number, baseX: number, baseY: number,
  neckLen: number, alive: boolean, phase: number,
): { x: number; y: number } | null {
  if (!alive) return null;
  const dk = pal[0], md = pal[2], lt = pal[4], hi = pal[5];
  const bright = pal[7];

  let lastX = baseX, lastY = baseY;
  for (let i = 0; i < neckLen; i++) {
    const angle = (idx - 1.5) * 0.35;
    const nx = Math.round(baseX + Math.sin(angle) * i * 1.1 + Math.sin(tick * 0.12 + idx * 2 + i * 0.3) * 1.5);
    const ny = Math.round(baseY - i + Math.sin(tick * 0.08 + idx * 1.5 + i * 0.2) * 0.8);
    const thick = i < neckLen * 0.3 ? 2 : 1;
    for (let d = -thick; d <= thick; d++) {
      sg(g, ny, nx + d, d === -thick || d === thick ? dk : (i % 3 === 0 ? lt : md));
    }
    lastX = nx; lastY = ny;
  }
  ellipse(g, lastY, lastX, 2, 2, (d) => d > 0.6 ? dk : d < 0.2 ? bright : lt);
  sg(g, lastY + 2, lastX - 1, dk); sg(g, lastY + 2, lastX, md); sg(g, lastY + 2, lastX + 1, dk);
  sg(g, lastY + 1, lastX - 2, "#fff"); sg(g, lastY + 1, lastX + 2, "#fff");
  const eyeCol = phase > 0 ? "#ff2200" : "#ffee44";
  sg(g, lastY - 1, lastX - 1, eyeCol); sg(g, lastY - 1, lastX + 1, eyeCol);
  return { x: lastX, y: lastY };
}

// ── Head sever animation ──────────────────────────────────────────────────────
function hydraHeadSever(g: Grid32, pal: string[], headPos: { x: number; y: number }, progress: number) {
  const bright = pal[7], poison = pal[9], dk = pal[0], lt = pal[4];
  const tumbleY = headPos.y + progress * 12;
  const tumbleX = headPos.x + Math.sin(progress * 4) * 6;
  const spin = progress * 8;
  const sz = Math.max(0, 2 - progress * 2);
  for (let r = -sz; r <= sz; r++) for (let c = -sz; c <= sz; c++) {
    const rr = Math.round(tumbleY + r * Math.cos(spin) - c * Math.sin(spin));
    const cc = Math.round(tumbleX + r * Math.sin(spin) + c * Math.cos(spin));
    sg(g, rr, cc, lt);
  }
  // Green blood spray from stump
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const d = 2 + progress * 4;
    sg(g, Math.round(headPos.y + Math.sin(a) * d), Math.round(headPos.x + Math.cos(a) * d),
      i % 2 === 0 ? "#44aa44" : poison);
  }
  for (let d = -1; d <= 1; d++) sg(g, headPos.y + 3, headPos.x + d, dk);
  void bright; // referenced for completeness
}

// ── Animation definitions ────────────────────────────────────────────────────
export type AnimFn = (g: Grid32, tick: number, st: HydraState) => void;
export interface AnimDef { duration: number; loop: boolean; fn: AnimFn; }

export const HYDRA_ANIMS: Record<string, AnimDef> = {

  idle: {
    duration: 120, loop: true,
    fn(g, tick, st) {
      const bob = Math.sin(tick * 0.06) * 1.5;
      const bodyY = hydraBody(g, HYDRA_PAL, tick, bob);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      heads.forEach((alive, i) => {
        const bx = 8 + i * 5;
        hydraHead(g, HYDRA_PAL, tick, i, bx, bodyY - 3, 8 + Math.sin(tick * 0.05 + i) * 1.5, alive, st.phase);
      });
    },
  },

  move: {
    duration: 120, loop: true,
    fn(g, tick, st) {
      const bob = Math.sin(tick * 0.1) * 2;
      const bodyY = hydraBody(g, HYDRA_PAL, tick, bob);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      heads.forEach((alive, i) => {
        hydraHead(g, HYDRA_PAL, tick, i, 8 + i * 5, bodyY - 3, 8 + Math.sin(tick * 0.05 + i) * 1.5, alive, st.phase);
      });
    },
  },

  hurt: {
    duration: 20, loop: false,
    fn(g, tick, st) {
      const flash = tick % 4 < 2;
      const pal = flash ? HYDRA_PAL.map(() => "#ffffff") : HYDRA_PAL;
      const bodyY = hydraBody(g, pal, tick, 0);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      heads.forEach((alive, i) => {
        hydraHead(g, pal, tick, i, 8 + i * 5, bodyY - 3, 7, alive, st.phase);
      });
    },
  },

  death: {
    duration: 80, loop: false,
    fn(g, tick, _st) {
      const p = tick / 80;
      const pal = HYDRA_PAL, poison = pal[9], lt = pal[4], md = pal[2], dk = pal[0];
      const droop = p * 15;
      for (let i = 0; i < 4; i++) {
        const bx = 8 + i * 5, by = 18 + droop;
        for (let n = 0; n < Math.max(1, 6 - p * 6); n++) {
          sg(g, Math.round(by - n + droop * 0.3), Math.round(bx + Math.sin(i * 1.5) * n * 0.5), dk);
        }
      }
      const puddleW = 8 + p * 10;
      for (let r = 22; r <= 28; r++) for (let c = Math.round(16 - puddleW); c <= Math.round(16 + puddleW); c++) {
        if (r < 22 + (1 - p) * 4) sg(g, r, c, p < 0.5 ? md : dk);
        else sg(g, r, c, (r + c + tick) % 3 === 0 ? poison : lt);
      }
      for (let i = 0; i < p * 12; i++) {
        const pr = Math.round(16 - 8 + (i / 12) * 16 + p * 4);
        const pc = Math.round(16 - 10 + (i * 7 % 20));
        sg(g, pr, pc, i % 2 === 0 ? poison : "#44aa44");
      }
    },
  },

  venom_spit: {
    duration: 40, loop: true,
    fn(g, tick, st) {
      const bob = Math.sin(tick * 0.06) * 1;
      const bodyY = hydraBody(g, HYDRA_PAL, tick, bob);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      const poison = HYDRA_PAL[9], bright = HYDRA_PAL[7];
      const p = (tick % 40) / 40;
      heads.forEach((alive, i) => {
        const pos = hydraHead(g, HYDRA_PAL, tick, i, 8 + i * 5, bodyY - 3, 9, alive, st.phase);
        if (pos && alive && p > 0.2) {
          const sprayDist = (p - 0.2) * 20;
          const angle = -Math.PI / 2 + (i - 1.5) * 0.4;
          for (let d = 0; d < 3; d++) {
            const pr = Math.round(pos.y + Math.sin(angle) * (sprayDist + d * 2));
            const pc = Math.round(pos.x + Math.cos(angle) * (sprayDist + d * 2));
            sg(g, pr, pc, d === 0 ? bright : poison);
            sg(g, pr, pc + 1, poison);
          }
        }
      });
    },
  },

  head_sever: {
    duration: 50, loop: false,
    fn(g, tick, st) {
      const bob = Math.sin(tick * 0.06) * 0.5;
      const bodyY = hydraBody(g, HYDRA_PAL, tick, bob);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      const p = tick / 50;
      const severIdx = st.severTarget ?? 0;
      heads.forEach((alive, i) => {
        const showAlive = i === severIdx ? false : alive;
        const pos = hydraHead(g, HYDRA_PAL, tick, i, 8 + i * 5, bodyY - 3, 8, showAlive, st.phase);
        if (i === severIdx && pos) {
          hydraHeadSever(g, HYDRA_PAL, pos, p);
        }
      });
    },
  },

  regrow: {
    duration: 60, loop: false,
    fn(g, tick, st) {
      const bodyY = hydraBody(g, HYDRA_PAL, tick, 0);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      const p = tick / 60;
      const regrowIdx = st.regrowTarget ?? 0;
      heads.forEach((alive, i) => {
        if (i === regrowIdx) {
          const growLen = Math.round(p * 9);
          if (growLen > 0) hydraHead(g, HYDRA_PAL, tick, i, 8 + i * 5, bodyY - 3, growLen, true, st.phase);
          if (p < 0.8) {
            const bright = HYDRA_PAL[7];
            const tipY = bodyY - 3 - growLen;
            sg(g, tipY, 8 + i * 5, bright); sg(g, tipY - 1, 8 + i * 5, "#ffffff");
            sg(g, tipY, 8 + i * 5 - 1, bright); sg(g, tipY, 8 + i * 5 + 1, bright);
          }
        } else {
          hydraHead(g, HYDRA_PAL, tick, i, 8 + i * 5, bodyY - 3, 8, alive, st.phase);
        }
      });
    },
  },

  enrage: {
    duration: 45, loop: true,
    fn(g, tick, st) {
      const p = (tick % 45) / 45;
      const flash = Math.sin(p * Math.PI * 6) > 0;
      const ragePal = ["#1a0a0a","#3a1a1a","#5a2a2a","#8a3a3a","#ba4a4a","#ea6a6a","#ffaaaa","#ffffff","#aa2a2a","#ff4444"];
      const pal = flash ? ragePal : HYDRA_PAL;
      const bob = Math.sin(tick * 0.15) * 3;
      const bodyY = hydraBody(g, pal, tick, bob);
      const heads = st.heads.length ? st.heads : [true, true, true, true];
      heads.forEach((alive, i) => {
        hydraHead(g, pal, tick, i, 8 + i * 5, bodyY - 3, 8 + p * 2, alive, 1);
      });
      for (let i = 0; i < p * 10; i++) {
        sg(g, Math.round(4 + (i / 10) * 24), Math.round(4 + (i * 7 % 24)), "#ff4444");
      }
    },
  },
};

// ── Public draw call ──────────────────────────────────────────────────────────
export function drawHydraFrame(g: Grid32, animKey: string, tick: number, st: HydraState): void {
  const anim = HYDRA_ANIMS[animKey] ?? HYDRA_ANIMS.idle;
  anim.fn(g, tick, st);
}

export function makeGrid32(): Grid32 {
  return Array.from({ length: B }, () => Array(B).fill(null));
}
