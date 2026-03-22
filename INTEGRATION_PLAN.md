# Pixel Gear Forge — Complete Integration Plan

## Strategy: Dual Renderer with Toggle

Rather than replacing the existing art system, both renderers run in parallel. A **Pixel Art Mode** toggle in Settings switches visibility between them. This means:

- Old art never breaks — flip the toggle and it's back
- Errors in the new system are immediately visible by comparing the two
- Each phase can be tested in isolation without disrupting the playable game
- When the pixel art is fully validated, the old renderer is removed in a final cleanup pass

The toggle persists to `localStorage` (`setting_pixel_art`) just like the radar toggle.

---

## Resolved Design Decisions

### Slot mapping (game → Forge)
| Game slot | Forge slot | Valid item types |
|-----------|------------|-----------------|
| `weapon`  | MainHand   | Sword, Axe, Spear, Dagger, Staff, Bow |
| `head`    | Head       | Helmet |
| `chest`   | Chest      | Chestplate |
| `hands`   | Arms       | Gauntlets |
| `feet`    | Feet       | Boots or Leggings (prand picks per drop) |
| `trinket` | OffHand    | Shield |

Six game slots map cleanly to six Forge types. No schema rename needed — `trinket` is just called Shield visually.

### Stat translation (game stats → Forge visual input)
The server's combat math (`dm`, `hp`, `ar`, `as`, `sp`, `xp`) is unchanged. For pixel art generation, game stats are translated to Forge stats purely client-side to drive material selection and accents:

| Game stat | Forge stat | Scale |
|-----------|------------|-------|
| `dm` (damage mult) | `ATK` | `dm * 20` |
| `ar` (armor reduction) | `DEF` | `ar * 100` |
| `hp` (HP bonus) | `HP` | `hp / 3` (reverse the 3× Forge multiplier) |
| `as` (attack speed) | `CRT` | `as * 60` |
| `sp` (move speed) | `SPD` | `sp * 40` |
| `xp` (XP bonus) | `LCK` | `xp * 40` |
| — | `MAG` | `0` (reserved for future magic system) |

This ensures a high-`dm` weapon looks like steel, a high-`ar` chest looks like metal plate, a high-`sp` boot looks like leather, etc.

### Rarity tier mapping (game → Forge)
| Game rarity | Game name    | Forge tier | Console |
|-------------|--------------|------------|---------|
| 0           | Scuffed      | 0          | Game Boy |
| 1           | Serviceable  | 1          | Game Boy Color |
| 2           | Quality      | 2          | NES |
| 3           | Superior     | 3          | SNES |
| 4           | Exquisite    | 4          | N64 |
| 5           | Atlan        | 4          | N64 (same tier, rarer palette selection) |

### Race-colored base sprites
`charSprite()` receives a `race` string and uses a race-specific skin/hair color set:

```typescript
const RACE_SPRITE_COLORS: Record<string, { skin: string; skinDark: string; hair: string }> = {
  aluvian:    { skin: '#e8b88a', skinDark: '#c4956e', hair: '#5a3a1a' },
  gharundim:  { skin: '#c8a070', skinDark: '#a07850', hair: '#1a1008' },
  sho:        { skin: '#d4c8a0', skinDark: '#b0a880', hair: '#1a1208' },
  viamontian: { skin: '#d8a090', skinDark: '#b87868', hair: '#2a1010' },
  umbraen:    { skin: '#888898', skinDark: '#606070', hair: '#080810' },
};
```

`charSprite(dir, frame, race)` uses these instead of the hardcoded constants in pixel-armor-gen.tsx.

### Legacy items
Items created before the schema change have no `itemType`/`paletteGame` fields. In pixel art mode:
- Ground items: show a plain grey square (placeholder) instead of card art
- Gear HUD slots: show the existing emoji icon (no change in behavior)
- Player sprites: use a base sprite with no gear overlays (just the character)

---

## New Files to Create

### `src/game/gear/pixel-gear.ts`
Pure TypeScript module extracted from `pixel-armor-gen.tsx`. No React, no browser APIs.

**Exports:**
```typescript
export const GP: Record<string, GamePalette[]>         // All palette data
export const ROLES: Record<string, RoleDef>             // Tank/DPS/Support
export const TB: number[]                               // Tier budgets [28,48,75,105,140]
export const IA: Record<string, ItemArchetype>          // Item archetypes
export const TIERS: TierConfig[]                        // 5 tier configs
export const AS: string[]                               // All stat keys
export const ALL: string[]                              // All item type names

export function genS(tierIdx, itemType, paletteMod): Stats
export function getMat(stats, role): string
export function genPx(tier, itemType, stats, palette, tierIdx): { pixels: Pixel[], palette: string[] }
export function roll(): number
export function translateGameStats(gameItem: GameItemRow): Stats  // NEW — game stats → Forge stats
export function pickItemType(gameSlot: string, seed: bigint): string  // NEW — deterministic slot→type
export function pickPaletteGame(tierIdx: number, seed: bigint): string  // NEW — deterministic palette pick

// Types
export interface Pixel { r: number; c: number; color: string }
export interface Stats { DEF: number; HP: number; ATK: number; CRT: number; MAG: number; SPD: number; LCK: number }
export interface TierConfig { name: string; label: string; color: string; bg: string; gs: number; ps: number; dr: number; stars: number; dl: number }
export interface GamePalette { game: string; colors: string[]; accent: string; mod: PaletteMod }
```

**Key additions vs the forge source:**

`translateGameStats(row)` — converts a SpacetimeDB item row's `stat`/`val`/`bonusStat`/`bonusVal` into a Forge Stats object using the scale table above. Used by the client to generate visually accurate pixel art without storing Forge stats server-side.

`pickItemType(gameSlot, seed)` — deterministic (no Math.random) selection of Forge item type from a game slot, using the same `prand()` helper the server uses. Called server-side in `rollItem()`.

`pickPaletteGame(tierIdx, seed)` — deterministic palette selection from the tier's palette pool.

---

### `src/game/gear/sprite-system.ts`
Pure TypeScript module extracted from `pixel-armor-gen.tsx`.

**Exports:**
```typescript
export const SPRITE_SIZE = 16
export const DIRS = ['down', 'up', 'left', 'right'] as const
export type Direction = typeof DIRS[number]

export function charSprite(dir: Direction, frame: 0 | 1, race?: string): (string | null)[][]
export function gearOverlay(itemType: string, dir: Direction, frame: 0 | 1, palette: string[]): Pixel[]
export function getFacing(dx: number, dy: number): Direction
```

`charSprite` is modified to accept an optional `race` parameter and use `RACE_SPRITE_COLORS` for skin/hair. All other logic identical to the forge source.

---

### `src/game/gear/phaser-sprites.ts`
Bridges the sprite system to Phaser textures.

```typescript
const SPRITE_SCALE = 3          // 16×16 → 48×48px per frame on screen
const FRAME_COUNT  = 8          // 4 dirs × 2 frames
const ATLAS_W      = SPRITE_SIZE * SPRITE_SCALE * FRAME_COUNT  // 384px
const ATLAS_H      = SPRITE_SIZE * SPRITE_SCALE                 // 48px

// Frame index layout: down0, down1, up0, up1, left0, left1, right0, right1
export function getFrameIndex(dir: Direction, frame: 0 | 1): number

// Bake all 8 frames for a character into a single Phaser texture.
// key is unique per player (e.g. identity hex).
// equipped is a map of slot → { itemType, palette } (null slots are empty).
// Destroys any existing texture with the same key before creating the new one.
export function bakePlayerTexture(
  scene: Phaser.Scene,
  key: string,
  equipped: Record<string, { itemType: string; palette: string[] } | null>,
  race: string
): void

// Compute a hash string from equipped items to detect when rebaking is needed.
export function equippedHash(equipped: Record<string, { itemType: string; paletteGame: string } | null>): string

// Render a single item's card art to a given HTMLCanvasElement.
// Used for HUD slots and hub screen gear panels.
export function renderItemCardToCanvas(
  canvas: HTMLCanvasElement,
  itemRow: GameItemRow,    // SpacetimeDB item row
  scale?: number           // defaults to tier.ps
): void

// Render a ground item card art at 2× scale to a Phaser texture key.
export function bakeGroundItemTexture(
  scene: Phaser.Scene,
  key: string,
  itemRow: GameItemRow
): void
```

**Implementation notes for `bakePlayerTexture`:**
1. Create an offscreen `HTMLCanvasElement` (384×48)
2. For each of 8 frames: call `charSprite(dir, frame, race)`, paint to the canvas at the correct x offset
3. For each equipped item in layer order (Boots→Leggings→Chestplate→Gauntlets→Helmet→Shield→weapon types): call `gearOverlay(itemType, dir, frame, palette)`, paint pixels
4. Call `scene.textures.addCanvas(key, canvas)` — Phaser wraps the canvas as a texture
5. Add frame data: `scene.textures.get(key).add(frameIndex, 0, frameX, 0, 48, 48)` for each of 8 frames

---

## Phase 1 — Create the three modules

**Files:** `src/game/gear/pixel-gear.ts`, `src/game/gear/sprite-system.ts`, `src/game/gear/phaser-sprites.ts`

Port code from `pixel-armor-gen.tsx`. No changes to any existing files. No schema changes. The modules exist but aren't wired into anything yet.

**Test:** Import `genPx` in the browser console via `import('./src/game/gear/pixel-gear.ts')` and verify pixel arrays are generated correctly.

---

## Phase 2 — Add the toggle to SettingsPanel

**File: `src/ui/SettingsPanel.ts`**

Add `pixelArtOn: boolean` field, initialized from `localStorage.getItem('setting_pixel_art') !== 'false'` (defaults ON so new players see the new art immediately, but can switch back).

Add callback `onPixelArtToggle: (on: boolean) => void` to the callbacks interface.

Add a new section to `render()` between RADAR and SOUND:

```
DISPLAY
[Show Minimap]  ON/OFF
[Pixel Art Mode] ON/OFF   ← new
```

In `bindEvents()`, wire `sp-pixel-art-toggle` identically to the radar toggle: flip the bool, save to localStorage, call `this.callbacks.onPixelArtToggle(this.pixelArtOn)`, re-render.

Add `getPixelArtOn(): boolean` accessor (same pattern as `getRadarOn()`).

**File: `src/main.ts`**

Update the `settingsPanel` constructor call:
```typescript
const settingsPanel = new SettingsPanel({
  onRadarToggle:    (v) => gameScene?.setRadarVisible(v),
  onPixelArtToggle: (v) => gameScene?.setPixelArtMode(v),  // new
});
```

Add to `updateScreen()` when deploying (after `scene.setRadarVisible(...)`):
```typescript
scene.setPixelArtMode(settingsPanel.getPixelArtOn());
```

---

## Phase 3 — Update the item schema (server)

**File: `spacetimedb/src/index.ts`**

Add 3 fields to the `item` table definition:
```typescript
itemType:    t.string(),   // "Sword" | "Helmet" | etc. ('' for pre-migration items)
paletteGame: t.string(),   // e.g. "Fantasy 24" ('' for pre-migration items)
tierIdx:     t.u32(),      // 0–4 Forge tier index
```

Update `rollItem()` to populate these fields. Copy `pickItemType()` and `pickPaletteGame()` logic from `pixel-gear.ts` into the server file (the server can't import from the client), using the existing `prand()`/`prandInt()` helpers for determinism:

```typescript
function pickItemType(slot: string, seed: bigint): string {
  const pool: Record<string, string[]> = {
    weapon:  ['Sword', 'Axe', 'Spear', 'Dagger', 'Staff', 'Bow'],
    head:    ['Helmet'],
    chest:   ['Chestplate'],
    hands:   ['Gauntlets'],
    feet:    ['Boots', 'Leggings'],
    trinket: ['Shield'],
  };
  const types = pool[slot] ?? ['Sword'];
  return types[prandInt(seed, 99, types.length)];
}

function pickPaletteGame(tierIdx: number, seed: bigint): string {
  const pools: string[][] = [
    ['My Own Summer', 'Lava-GB'],
    ['Oil 6', 'Curiosities'],
    ['Modern Interface', 'SLSO8'],
    ['Japanese Woodblock', 'NOPAL-12'],
    ['Retro 8-Bit', 'Deep Sea', 'Vinik24', 'Fantasy 24'],
  ];
  const pool = pools[Math.min(tierIdx, 4)];
  return pool[prandInt(seed, 100, pool.length)];
}
```

Update `rollItem()` call site:
```typescript
function rollItem(seed, ownerId, waveNum, x, y, now, worldId) {
  // ... existing slot/template/tier/stat logic unchanged ...
  const forgeTierIdx = Math.min(ti, 4);
  const itemType    = pickItemType(slot, seed);
  const paletteGame = pickPaletteGame(forgeTierIdx, seed);
  return {
    // ... all existing fields ...
    itemType,
    paletteGame,
    tierIdx: forgeTierIdx,
  };
}
```

`rollArmorItem()` (boss drops) gets the same treatment.

After editing: `spacetime publish` then `npm run spacetime:generate`. Module bindings will regenerate with the new item fields.

---

## Phase 4 — Dual-render player sprites

**File: `src/game/scenes/GameScene.ts`**

### New state

```typescript
private pixelArtMode = false;

// Updated PlayerEntry — holds both renderers
interface PlayerEntry {
  // Legacy (circles)
  body:  Phaser.GameObjects.Arc;
  inner: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  hp:    FloatingBar;
  // Pixel art
  sprite:       Phaser.GameObjects.Image | null;
  equippedHash: string;
  // Animation state
  dir:    Direction;
  frame:  0 | 1;
  animTick: number;
  lastX:  number;
  lastY:  number;
}
```

### `setPixelArtMode(on: boolean)`

```typescript
setPixelArtMode(on: boolean) {
  this.pixelArtMode = on;
  for (const entry of this.players.values()) {
    entry.body.setVisible(!on);
    entry.inner.setVisible(!on);
    entry.sprite?.setVisible(on);
  }
  for (const entry of this.groundItems.values()) {
    entry.ring.setVisible(!on);
    entry.icon.setVisible(!on);
    entry.cardSprite?.setVisible(on);
  }
}
```

### `upsertPlayerSprite(hex, x, y, name, race, equippedItems?)`

Add optional `equippedItems` parameter (array of game item rows for this player's equipped gear).

When creating a new entry: create the legacy arcs (unchanged), then also attempt to create the pixel art sprite:
```typescript
// Compute equipped map for sprite baking
const forgeEquipped = buildForgeEquipped(equippedItems ?? []);
const hash = equippedHash(forgeEquipped);
bakePlayerTexture(this, `player_${hex}`, forgeEquipped, race);
const sprite = this.add.image(x, y, `player_${hex}`, getFrameIndex('down', 0))
  .setDepth(12)
  .setVisible(this.pixelArtMode);
entry.sprite = sprite;
entry.equippedHash = hash;
```

When updating an existing entry: if `hash !== entry.equippedHash` (gear changed), rebake the texture. Always update `x`/`y` for both the arcs and the sprite.

`buildForgeEquipped(items)` — local helper that maps item rows to `{ slot → { itemType, palette } }`. Gets the palette colors by looking up `item.paletteGame` in the `GP` data from `pixel-gear.ts`. For items with no `itemType` (legacy), the slot is null.

### Animation in `update()`

Each frame, for every player entry:
```typescript
const dx = entry.lastX - x;  // track delta from last known position
const dy = entry.lastY - y;
const moving = Math.abs(dx) + Math.abs(dy) > 0.5;

if (moving) {
  entry.dir = getFacing(dx, dy);
  entry.animTick++;
  if (entry.animTick % 10 === 0) entry.frame = entry.frame === 0 ? 1 : 0;
} else {
  entry.frame = 0;
}

entry.sprite?.setFrame(getFrameIndex(entry.dir, entry.frame));
entry.lastX = x;
entry.lastY = y;
```

### `rebakeLocalPlayerSprite(equippedItems)`

Called from `main.ts` when the local player's equipped gear changes:
```typescript
rebakeLocalPlayerSprite(equippedItems: ItemData[]) {
  if (!this.myIdentityHex) return;
  const entry = this.players.get(this.myIdentityHex);
  if (!entry) return;
  const forgeEquipped = buildForgeEquipped(equippedItems);
  const hash = equippedHash(forgeEquipped);
  if (hash === entry.equippedHash) return;
  bakePlayerTexture(this, `player_${this.myIdentityHex}`, forgeEquipped, this.myRace);
  entry.sprite?.setTexture(`player_${this.myIdentityHex}`, getFrameIndex(entry.dir, entry.frame));
  entry.equippedHash = hash;
}
```

---

## Phase 5 — Dual-render ground items

**File: `src/game/scenes/GameScene.ts`**

### Updated GroundItemEntry

```typescript
interface GroundItemEntry {
  // Legacy
  glow: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Text;
  // Pixel art
  cardSprite: Phaser.GameObjects.Image | null;
}
```

### `upsertGroundItem(idStr, groundX, groundY, icon, rarity, itemRow?)`

Add optional `itemRow` parameter (the full item row, needed for pixel art generation).

When creating/updating:
1. Create legacy glow+ring+icon as today (unchanged)
2. If `itemRow?.itemType` is non-empty:
   - Call `bakeGroundItemTexture(this, `ground_${idStr}`, itemRow)`
   - Create `this.add.image(groundX, groundY, `ground_${idStr}`)` at depth 8, visible only if `this.pixelArtMode`
   - Add a subtle pulsing tween on the card sprite for visual life (`scale` oscillates 0.95→1.05 over 1s)
3. If no `itemType` (legacy): `cardSprite = null`

The rarity-colored glow `Arc` is kept behind the card art even in pixel art mode — it gives a nice aura effect. Only `ring` and `icon` (the emoji) are hidden.

### In `main.ts` — pass item rows to `upsertGroundItem`

```typescript
conn.db.item.onInsert((_ctx, row) => {
  if (row.location === 'ground') {
    scene.upsertGroundItem(row.id.toString(), row.groundX, row.groundY, row.icon, row.rarity, row);
  }
  // ...
});
```

---

## Phase 6 — Pixel art in gear HUD (bottom strip)

**File: `src/game/scenes/GameScene.ts`**

### Updated GearSlotHud

```typescript
interface GearSlotHud {
  bg:         Phaser.GameObjects.Rectangle;
  label:      Phaser.GameObjects.Text;   // slot letter (legacy)
  cardCanvas: HTMLCanvasElement | null;  // pixel art overlay (DOM element, absolutely positioned)
}
```

The gear HUD strip sits in the Phaser canvas at a fixed screen position. Add a matching `<div id="gear-hud-overlay">` in `buildGearHUD()` — an absolutely positioned DOM layer that sits on top of the canvas at the same coordinates. Each slot gets a `<canvas>` inside this div.

### `updateGearHud(equipped: ItemData[])`

For each slot:
- Legacy path (unchanged): update `label.setText(slotLetter)` or item icon
- Pixel art path: if the slot has an item with `itemType`, call `renderItemCardToCanvas(canvas, item)` from `phaser-sprites.ts`. The canvas is sized to the slot (28×28px). If no item or legacy item, clear the canvas.

The DOM canvas overlay is `display:none` when pixel art mode is off, `display:block` when on. This keeps the Phaser layer and DOM layer in sync with the toggle.

---

## Phase 7 — Pixel art character preview in HubScreen

**File: `src/ui/HubScreen.ts`**

Add an animated character preview panel to the hub screen (equivalent to `LiveScene` in the forge but simpler — no wandering AI, just an idle/walking preview).

### Location
Insert a `<canvas id="hub-char-preview">` (240×180px) in the hub layout, above the gear slot panel.

### `startCharPreview(equipped: ItemData[], race: string)`
Called when the hub opens:
```typescript
private previewAnimId: number | null = null;

startCharPreview(equipped: ItemData[], race: string) {
  const canvas = document.getElementById('hub-char-preview') as HTMLCanvasElement;
  if (!canvas) return;
  canvas.width = 240; canvas.height = 180;
  const ctx = canvas.getContext('2d')!;
  const forgeEquipped = buildForgeEquipped(equipped);  // same helper as GameScene
  let tick = 0, frame: 0 | 1 = 0, dir: Direction = 'down';

  const loop = () => {
    tick++;
    if (tick % 30 === 0) {
      // Cycle through directions: down → left → up → right → down
      const dirs: Direction[] = ['down', 'left', 'up', 'right'];
      dir = dirs[Math.floor(tick / 30) % 4];
    }
    if (tick % 10 === 0) frame = frame === 0 ? 1 : 0;

    // Draw dark background
    ctx.fillStyle = '#080612';
    ctx.fillRect(0, 0, 240, 180);
    // Subtle grid
    ctx.strokeStyle = '#100e1a';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < 240; x += 16) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,180); ctx.stroke(); }
    for (let y = 0; y < 180; y += 16) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(240,y); ctx.stroke(); }

    // Draw character at center, 4× scale
    const cx = 120, cy = 90, scale = 4;
    const base = charSprite(dir, frame, race);
    const px = cx - 8 * scale, py = cy - 8 * scale;
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
      if (base[r][c]) { ctx.fillStyle = base[r][c]; ctx.fillRect(px + c*scale, py + r*scale, scale, scale); }
    }
    // Gear overlays
    const layerOrder = ['Boots','Leggings','Chestplate','Gauntlets','Helmet','Shield','Sword','Axe','Spear','Dagger','Staff','Bow'];
    for (const type of layerOrder) {
      const slot = IA[type]?.slot;
      if (!slot) continue;
      const item = forgeEquipped[slot];
      if (!item || item.itemType !== type) continue;
      gearOverlay(type, dir, frame, item.palette).forEach(({r, c, color}) => {
        ctx.fillStyle = color;
        ctx.fillRect(px + c*scale, py + r*scale, scale, scale);
      });
    }
    this.previewAnimId = requestAnimationFrame(loop);
  };
  this.previewAnimId = requestAnimationFrame(loop);
}

stopCharPreview() {
  if (this.previewAnimId !== null) {
    cancelAnimationFrame(this.previewAnimId);
    this.previewAnimId = null;
  }
}
```

### Wiring in `main.ts`

```typescript
// When hub opens:
hubScreen.show(charToState(myChar), getMyItems(), highestFloorCleared);
hubScreen.startCharPreview(getMyItems().filter(i => i.location === 'equipped'), myChar.race);

// When hub hides:
hubScreen.hide();
hubScreen.stopCharPreview();
```

Update the hub's `update()` method: when equipped items change mid-hub (equip/unequip), call `startCharPreview()` again to restart the preview with new gear. Stop the old one first.

---

## Phase 8 — Wire equip events to sprite rebake

**File: `src/main.ts`**

In the `item.onUpdate` handler, when the local player's equipped items change:
```typescript
conn.db.item.onUpdate((_ctx, old, row) => {
  // ... existing ground item + refreshHub logic ...
  if (row.ownerId.toHexString() === myIdentityHex) {
    const equipped = getMyItems().filter(i => i.location === 'equipped');
    scene.updateGearHud(equipped);
    scene.rebakeLocalPlayerSprite(equipped);  // ← add this
    if (!myChar?.deployed) {
      hubScreen.stopCharPreview();
      hubScreen.startCharPreview(equipped, myChar?.race ?? 'aluvian');
    }
  }
});
```

`rebakeLocalPlayerSprite` already checks the hash before rebaking, so calling it on every item update is safe.

---

## Phase 9 — Cleanup (after validation)

Once the pixel art mode has been tested in-game and the toggle comparison shows correctness:

1. Remove `body`, `inner` arcs from `PlayerEntry` and their creation/update code in `upsertPlayerSprite`
2. Remove `ring`, `icon` from `GroundItemEntry` and their creation/update code
3. Remove `label` from `GearSlotHud` and its legacy update path
4. Remove the `setPixelArtMode` toggle and `pixelArtMode` flag — pixel art is now the only renderer
5. Remove the toggle button from `SettingsPanel`
6. Remove `setting_pixel_art` from localStorage usage

This cleanup pass is entirely mechanical — find and delete, no logic changes.

---

## Complete File Change Summary

| File | Type | Change |
|------|------|--------|
| `src/game/gear/pixel-gear.ts` | **CREATE** | Balance engine + pixel art generator + stat translation |
| `src/game/gear/sprite-system.ts` | **CREATE** | charSprite + gearOverlay + getFacing |
| `src/game/gear/phaser-sprites.ts` | **CREATE** | Phaser texture baking, card art rendering |
| `spacetimedb/src/index.ts` | **EDIT** | Add `itemType`, `paletteGame`, `tierIdx` to item table; update `rollItem()` and `rollArmorItem()` |
| `src/ui/SettingsPanel.ts` | **EDIT** | Add pixel art toggle, `onPixelArtToggle` callback, `getPixelArtOn()` |
| `src/game/scenes/GameScene.ts` | **EDIT** | Dual-render PlayerEntry + GroundItemEntry; `setPixelArtMode()`; animation loop; `rebakeLocalPlayerSprite()` |
| `src/ui/HubScreen.ts` | **EDIT** | Add `<canvas>` preview; `startCharPreview()` / `stopCharPreview()` |
| `src/ui/InGamePanel.ts` | **EDIT** | Replace emoji gear icons with canvas card art |
| `src/main.ts` | **EDIT** | Wire `onPixelArtToggle`; wire equip changes to `rebakeLocalPlayerSprite` + `startCharPreview` |

---

## Implementation Order

| Phase | What | Dependency |
|-------|------|------------|
| 1 | Create `pixel-gear.ts`, `sprite-system.ts`, `phaser-sprites.ts` | None — safe to do first |
| 2 | Add pixel art toggle to `SettingsPanel` + wire in `main.ts` | Phase 1 |
| 3 | Schema change — add fields to item table, update `rollItem` | Phase 1; requires `spacetime publish` + `spacetime:generate` |
| 4 | Dual-render player sprites in `GameScene` | Phases 1, 2, 3 |
| 5 | Dual-render ground items in `GameScene` | Phases 1, 2, 3 |
| 6 | Pixel art gear HUD strip | Phases 1, 3 |
| 7 | Hub character preview | Phase 1 |
| 8 | Wire equip → rebake | Phases 4, 7 |
| 9 | Cleanup (remove legacy renderer) | All phases validated |

Each phase is independently deployable. After Phase 2, the toggle exists but does nothing visible. After Phase 4, toggling switches player rendering. After Phase 5, ground items also switch. The game remains fully playable throughout.
