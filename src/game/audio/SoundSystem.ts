// SoundSystem.ts — Synthesized Web Audio SFX, no asset files needed.
// All sounds are procedurally generated via the Web Audio API.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ── Primitive builders ────────────────────────────────────────────────────────

function playTone(
  freq: number, type: OscillatorType,
  startVol: number, endVol: number,
  duration: number, startTime = 0,
  detune = 0,
) {
  const ac = getCtx();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);

  osc.type    = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + startTime);
  osc.detune.setValueAtTime(detune, ac.currentTime + startTime);
  gain.gain.setValueAtTime(startVol, ac.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, endVol),
    ac.currentTime + startTime + duration,
  );
  osc.start(ac.currentTime + startTime);
  osc.stop(ac.currentTime + startTime + duration + 0.01);
}

function playNoise(startVol: number, endVol: number, duration: number, startTime = 0) {
  const ac     = getCtx();
  const buf    = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src    = ac.createBufferSource();
  const gain   = ac.createGain();
  const filter = ac.createBiquadFilter();
  src.buffer   = buf;
  filter.type  = 'bandpass';
  filter.frequency.value = 200;
  filter.Q.value = 0.5;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(startVol, ac.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endVol), ac.currentTime + startTime + duration);
  src.start(ac.currentTime + startTime);
  src.stop(ac.currentTime + startTime + duration + 0.01);
}

// ── Public sound effects ──────────────────────────────────────────────────────

/** Melee or impact hit on an enemy */
export function playHit() {
  playNoise(0.18, 0.001, 0.08);
  playTone(110, 'square', 0.08, 0.001, 0.06, 0, -200);
}

/** Enemy dies */
export function playKill() {
  playTone(220, 'triangle', 0.15, 0.001, 0.12);
  playTone(330, 'triangle', 0.08, 0.001, 0.10, 0.04);
  playNoise(0.06, 0.001, 0.10, 0.02);
}

/** Player levels up */
export function playLevelUp() {
  const notes = [261, 329, 392, 523, 659, 784];
  notes.forEach((f, i) => {
    playTone(f, 'triangle', 0.18, 0.001, 0.25, i * 0.07);
  });
}

/** Loot drops to the ground */
export function playLootDrop() {
  playTone(880, 'sine', 0.12, 0.001, 0.15);
  playTone(1320, 'sine', 0.07, 0.001, 0.12, 0.06);
}

/** Wave starts */
export function playWaveStart() {
  // Drum hit
  playNoise(0.4, 0.001, 0.25);
  playTone(60, 'sine', 0.35, 0.001, 0.3);
  // Horn stab after brief pause
  playTone(196, 'sawtooth', 0.12, 0.001, 0.35, 0.15, -300);
  playTone(246, 'sawtooth', 0.10, 0.001, 0.35, 0.15, -300);
}

/** Boss enters the arena */
export function playBossEnter() {
  // Deep ominous drone
  playTone(55, 'sawtooth', 0.20, 0.001, 1.2, 0, -500);
  playTone(110, 'sawtooth', 0.12, 0.001, 1.0, 0.05, -500);
  // Impact crash
  playNoise(0.5, 0.001, 0.4, 0.0);
  // Descending horn
  const freqs = [392, 329, 261, 196];
  freqs.forEach((f, i) => playTone(f, 'square', 0.10, 0.001, 0.2, 0.1 + i * 0.1, -400));
}

/** Boss dies */
export function playBossDeath() {
  // Triumphant rising arpeggio
  const notes = [196, 247, 294, 370, 494, 659, 880];
  notes.forEach((f, i) => playTone(f, 'triangle', 0.18 - i * 0.01, 0.001, 0.4, i * 0.07));
  // Rumble out
  playNoise(0.3, 0.001, 0.6, 0.0);
  playTone(55, 'sine', 0.25, 0.001, 0.8, 0.1);
}

/** Local player dies */
export function playPlayerDeath() {
  // Descending drone
  const ac = getCtx();
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, ac.currentTime + 0.8);
  gain.gain.setValueAtTime(0.18, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
  osc.start(ac.currentTime);
  osc.stop(ac.currentTime + 1.0);
  playNoise(0.2, 0.001, 0.5, 0.1);
}

/** Portal cast begins */
export function playPortalStart() {
  playTone(440, 'sine', 0.10, 0.001, 0.6);
  playTone(550, 'sine', 0.07, 0.001, 0.5, 0.1);
  playTone(660, 'sine', 0.05, 0.001, 0.4, 0.2);
}

/** Portal cast completes / player travels */
export function playPortalTravel() {
  const notes = [880, 1108, 1320, 1760];
  notes.forEach((f, i) => playTone(f, 'sine', 0.12, 0.001, 0.3, i * 0.05));
  playNoise(0.08, 0.001, 0.3, 0.0);
}

/** Wave cleared */
export function playWaveCleared() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => playTone(f, 'triangle', 0.15, 0.001, 0.3, i * 0.08));
}
