# Mobile Friendliness Plan — Dereth Online

## Current Problems (by severity)

### 🔴 Blockers — game is unplayable without these
1. **Fixed 1280×720 canvas** — hardcoded in `main.ts`, will not scale to phone screens
2. **Keyboard-only input** — `setupInput()` in `GameScene.ts` uses WASD/arrow keys exclusively. No touch input wired at all.
3. **No virtual joystick** — no way to move the character on mobile

### 🟠 Major — UI unusable on small screens
4. **Bottom HUD is 100px tall, rigid** — gear slots at 50px each will be cramped or cut off on a 375px-wide phone in landscape
5. **TopBar is 36px** — below Apple/Google's minimum 44px touch target recommendation
6. **InGamePanel is a 290px right-side drawer** — will overlap most of the screen on mobile
7. **HubScreen / LoginScreen / CharCreate** — fixed pixel widths, small buttons, not scrollable on short screens

### 🟡 Minor — polish / edge cases
8. **Pinch-to-zoom not disabled** — `user-scalable` missing from viewport meta, players can accidentally zoom
9. **No `safe-area-inset`** — notches and home bars on iPhone/Android will cut into the HUD
10. **Phaser camera zoom = 1.5** — on a 390px-wide phone with a 1280px canvas, the world will appear tiny
11. **SettingsPanel drops from top-right** — fine on desktop, but on a narrow screen it clips off the edge

---

## Architecture Decisions

### Canvas Scaling
Use **`Phaser.Scale.FIT`** with a fixed logical resolution of `1280×720`. Phaser scales the canvas to fill the screen while preserving aspect ratio. This is the standard approach for games — no world coordinate changes needed, everything just scales visually.

### Virtual Joystick
Build a **custom HTML overlay joystick** (not a Phaser plugin) — a fixed-position circle in the bottom-left that tracks touch. It feeds `dx/dy` values to the scene via the existing `handleMovement()` path. Benefits:
- No new dependencies
- Lives above the canvas in the HTML layer (consistent with how TopBar/BottomHud are built)
- Easy to style to match the Dereth aesthetic

### Action Buttons
A row of **4 on-screen buttons** floating above the bottom-right HUD area, visible only on touch devices:
- `⚔` — Enter portal (F key equivalent)
- `✦` — Cast recall portal (P key equivalent)
- `≡` — Character panel (C key equivalent)
- `↺` — Respawn (R key, only shown when dead)

### Responsive Panels (Hub, Login, etc.)
All HTML overlays switch to `width: min(90vw, 400px)` and get larger touch targets (min 44px button height). On small screens they scroll vertically.

---

## Implementation Plan

### Phase 1 — Canvas & Scale (foundation, everything else depends on this)

**File: `src/main.ts`**
- Replace fixed `width: 1280, height: 720` with Phaser Scale config:
  ```typescript
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  }
  ```
- Remove explicit `width`/`height` from the game config root

**File: `index.html`**
- Update viewport meta to prevent user zoom and handle notches:
  ```html
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0,
             user-scalable=no, viewport-fit=cover" />
  ```
- Add body style for safe-area padding:
  ```css
  body {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  ```

---

### Phase 2 — Virtual Joystick

**New file: `src/ui/VirtualJoystick.ts`**

A self-contained HTML overlay component:
- Outer ring: 96px circle, fixed bottom-left, semi-transparent
- Inner knob: 40px circle that follows touch within the outer ring
- Exposes `getDelta(): { dx: number; dy: number }` — normalized -1 to 1
- Fires no events; GameScene polls it each frame via `update()`
- Auto-hides when no touch is active
- Only rendered on touch devices (`'ontouchstart' in window`)

**File: `src/game/scenes/GameScene.ts`**
- Import and instantiate `VirtualJoystick` in `create()`
- In `handleMovement()`, check joystick delta alongside keyboard input:
  ```typescript
  const joyDx = this.joystick?.getDelta().dx ?? 0;
  const joyDy = this.joystick?.getDelta().dy ?? 0;
  if (dx === 0) dx = joyDx * speed;
  if (dy === 0) dy = joyDy * speed;
  ```

---

### Phase 3 — Mobile Action Buttons

**New file: `src/ui/MobileActions.ts`**

A fixed HTML overlay showing 4 circular buttons, only on touch devices:
- Positioned above the bottom-right corner (clears the minimap)
- Buttons: Portal (`F`), Recall (`P`), Panel (`C`), Respawn (`R`)
- Respawn button hidden unless `setDead(true)` is called
- Each button fires the corresponding scene event via callbacks

**File: `src/main.ts`**
- Instantiate `MobileActions` and wire its callbacks to the same events as the keyboard handlers
- Show/hide alongside bottomHud

**File: `src/game/scenes/GameScene.ts`**
- Pass `setBottomHud()` equivalent: `setMobileActions(actions: MobileActions)`

---

### Phase 4 — Bottom HUD Responsive

**File: `src/ui/BottomHud.ts`**
- Detect mobile: `const isMobile = window.innerWidth < 768`
- On mobile:
  - HUD height: `120px` (more room for touch)
  - Gear slot size: `40px` instead of `50px`, reduce gap
  - HP orb: `64px` instead of `80px`
  - Minimap canvas: `80px` instead of `96px`
  - Font sizes bump up slightly (more readable on retina screens)
- Add `padding-bottom: env(safe-area-inset-bottom)` to the HUD element

---

### Phase 5 — TopBar Responsive

**File: `src/ui/TopBar.ts`**
- Height: `36px` → `44px` on mobile (via `window.innerWidth` check)
- Settings and Logout buttons: `26×26px` → `36×36px` on mobile
- This propagates to SettingsPanel's `top: 36px` → `top: 44px`

---

### Phase 6 — HTML Panel Overlays

**Files: `LoginScreen.ts`, `HubScreen.ts`, `CharacterCreate.ts`, `CharacterSelect.ts`, `InGamePanel.ts`, `SettingsPanel.ts`**

Each panel needs:
- `width: min(96vw, 400px)` — fills screen on mobile, capped on desktop
- Button heights: `min-height: 44px`
- Input heights: `min-height: 44px`
- `overflow-y: auto` on scrollable containers with `max-height: calc(100vh - 80px)`
- Font sizes: bump up `8px`/`9px` text to `11px` minimum on mobile (unreadable otherwise)

**InGamePanel specifically:**
- On mobile, changes from a right-side drawer to a **bottom sheet** (slides up from bottom, 85vh tall)
- Full-width: `width: 100vw` instead of `290px`
- Closes by tapping outside (backdrop tap)

**SettingsPanel specifically:**
- On mobile: `width: 100vw`, `right: 0`, styled as a full-width dropdown

---

### Phase 7 — Phaser Camera Zoom

**File: `src/game/scenes/GameScene.ts` — `setupCamera()`**
- Current: hardcoded `setZoom(1.5)`
- Mobile needs less zoom so more world is visible:
  ```typescript
  const zoom = window.innerWidth < 768 ? 1.0 : 1.5;
  this.cameras.main.setZoom(zoom);
  ```

---

## File Change Summary

| File | Change |
|------|--------|
| `index.html` | Viewport meta + safe-area body padding |
| `src/main.ts` | Phaser Scale config, instantiate VirtualJoystick + MobileActions |
| `src/game/scenes/GameScene.ts` | Poll joystick in handleMovement(), wire MobileActions, adjust camera zoom |
| `src/ui/BottomHud.ts` | Responsive sizing on mobile |
| `src/ui/TopBar.ts` | Taller touch targets on mobile |
| `src/ui/LoginScreen.ts` | Responsive width + touch targets |
| `src/ui/HubScreen.ts` | Responsive width + scrollable + touch targets |
| `src/ui/CharacterCreate.ts` | Responsive width + touch targets |
| `src/ui/CharacterSelect.ts` | Responsive width + touch targets |
| `src/ui/InGamePanel.ts` | Bottom sheet on mobile |
| `src/ui/SettingsPanel.ts` | Full-width on mobile |
| `src/ui/VirtualJoystick.ts` | **NEW** — touch joystick |
| `src/ui/MobileActions.ts` | **NEW** — on-screen action buttons |

---

## Recommended Build Order

1. **Phase 1** — Canvas scale (unblocks all visual testing on mobile)
2. **Phase 2** — Virtual joystick (makes game playable)
3. **Phase 3** — Action buttons (makes all actions accessible)
4. **Phase 4–5** — HUD + TopBar responsive (polish)
5. **Phase 6** — Panel overlays responsive (polish)
6. **Phase 7** — Camera zoom (feel)

Phases 1–3 make the game playable on mobile. Phases 4–7 make it feel native.
