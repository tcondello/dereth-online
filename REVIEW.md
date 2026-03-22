# Dereth Online — Design & Architecture Review

Comprehensive line-by-line review of all game systems, art, logic, and orchestration.
Organized by priority: **Bugs** → **Visual/HUD** → **Game Logic** → **Architecture** → **Performance** → **Missing Content**.

---

## BUGS (Fix First)

### 1. Auto-attack range mismatch
**Files:** `GameScene.ts:186`, `spacetimedb/src/index.ts:14`
Client fires visual attacks at `CLIENT_ATTACK_RANGE = 160` but server only applies damage at `PLAYER_ATTACK_RANGE = 90`. Players see their character swinging and projectiles flying at enemies they can't actually hit. Visuals are lying to the player.
**Fix:** Lower client range to ≤ 85 or raise server range to match 160.

### 2. `larva` missing from `ENEMY_TYPE_DATA`
**File:** `GameScene.ts:56–65`
The `larva` enemy type (spawned by the olthoi ambient tick in the dungeon layer) is not in the `ENEMY_TYPE_DATA` map. It falls back to `{ color: 0xc62828, letter: '?', size: 14, xp: 0 }`. Larva show as red `?` circles and give no XP popup on kill. The pixel art archetype (blob/slime) is properly set up in `enemy-sprites.ts` — it just needs the matching entry here.
**Fix:** Add `larva: { color: 0x4a8a3a, letter: 'l', size: 7, xp: 1 }`.

### 3. `hydra` missing from `ENEMY_TYPE_DATA`
**File:** `GameScene.ts:56–65`
The Hydra boss uses a BossRenderer for its sprite, but `removeEnemySprite` still looks up `ENEMY_TYPE_DATA[entry.type]` for death burst color and XP popup. With no entry it falls back to the wrong color and shows no XP. Also the fallback `size: 14` is used to position the death burst at the wrong location relative to the 64px canvas sprite.
**Fix:** Add `hydra: { color: 0x2a5a2a, letter: 'H', size: 32, xp: 30 }`.

### 4. `pound` mechanic unimplemented
**File:** `spacetimedb/src/index.ts` — BOSS_DEFS index 5
Torgluuk (floor 6 boss, Tusker) is assigned `mechanic: 'pound'` but there is no `case 'pound':` in the `run_enemy_ai` switch block. He functions as a regular enemy with boosted stats. Either implement the mechanic or reassign him to an existing one (`charge` fits thematically).

### 5. Camera follows hidden object in pixel art mode
**File:** `GameScene.ts:505`
`this.cameras.main.startFollow(body, true, 0.1, 0.1)` follows the Arc circle. In pixel art mode the circle is hidden (`body.setVisible(false)`) but Phaser still tracks its position, and the circle position updates perfectly, so this actually still works — but it's fragile. If the circle is ever destroyed or recycled, the camera detaches. Better to follow a dedicated invisible anchor or the sprite itself.

### 6. Player HP bar still created and tracked for local player
**File:** `GameScene.ts:480–482`
The small 28×3px HP bar above the player's head is now redundant — the BottomHud orb covers HP with full animation. For the local player this is confirmed unnecessary (user noted). For other players it's useful. HP bar is updated every `updatePlayerHealth` call even when the player is self.
**Fix:** Skip creating `hpBg`/`hpBar` when `isMe`, and skip the `setSize` call in `updatePlayerHealth` for self.

### 7. Toast stack doesn't reset cleanly
**File:** `GameScene.ts:1249–1262`
`toastY` is a simple accumulator that increments on show and decrements on expire. If two toasts arrive at the same time, the second one stacks correctly. But if one expires while another is still visible, `toastY -= SLOT_H` can put subsequent toasts in the wrong slot — there's no per-toast slot tracking. After a few loots the stack can drift.
**Fix:** Track each toast's slot index independently, or use a queue array and reflow positions on each expiry.

---

## VISUAL / HUD

### 8. Remove world-space player HP bar for self
**File:** `GameScene.ts:480–482, 536–539`
See bug #6. The BottomHud orb is the canonical HP display. The tiny floating bar above the player sprite is visual noise, especially at 1.5× zoom where it overlaps the character label. Remove it for `isMe`; keep it for other players (it's useful in multiplayer).

### 9. No dedicated boss HP bar
**Files:** `GameScene.ts:576–578` (6px orange bar), `BottomHud.ts`
Bosses currently use the same small floating HP bar as regular enemies (just 6px tall instead of 3px). For a boss fight this is insufficient — especially for the Hydra where the 4-head system makes total boss HP ambiguous. A centered full-width HP bar at the top of screen (like classic action RPGs) during a boss encounter would dramatically improve the fight feel.
**Suggested approach:** In `GameScene`, when a boss enemy enters the world, add a dedicated boss bar to `buildHUD()`. Hide it normally, show it when `isBoss && currentHp > 0`.

### 10. Boss aura doesn't animate
**File:** `GameScene.ts:560`
`bossAura` is created at 0.25 alpha and never tweened. It's a static ring. A pulsing alpha tween (`0.15 ↔ 0.45`, 1200ms yoyo) would make bosses immediately visually distinctive when they enter.

### 11. Enemy HP bar position wrong for pixel art sprites
**Files:** `GameScene.ts:576, 600–602`
HP bar Y is `y - data.size - 6` using the logical circle radius (e.g., 12 for drudge = `y - 18`). But the pixel art sprite is 32×32 pixels displayed at `ENEMY_FRAME_SIZE` (64px with scale). The HP bar floats at the circle position (18px up) not at the top of the 32px sprite (32px up). All enemy HP bars are too low when pixel art is on.
**Fix:** When `entry.sprite` is present, use sprite display height / 2 for the Y offset instead of `data.size`.

### 12. World debug text visible in production
**File:** `GameScene.ts:280–284`
`worldDebugText` shows `World 12345678` on screen at all times. This leaks internal IDs and clutters the UI. Should be hidden behind a debug flag or removed entirely.

### 13. Player label shows for self
**File:** `GameScene.ts:476–478`
The username label renders above the local player's own sprite. The player already knows their name. Only other players' names need labels. Hide when `isMe`.

### 14. Ground item glow/ring/icon created even in pixel art mode
**File:** `GameScene.ts:640–680`
`upsertGroundItem` always creates glow, ring, and icon Text objects, even when `pixelArtMode` is already on. `setPixelArtMode` then hides them immediately. Those objects are allocated and rendered (just invisible). If ground items are frequent this wastes memory. Better to skip creating them if pixel art mode is already active.

### 15. World tile glyphs are expensive Text objects
**File:** `GameScene.ts:221–226`
The ancient ruin glyphs (᚛, ⊕, etc.) scattered across the floor are created as individual Phaser Text objects with alpha 0.06. With a 2400×2400 world at 80px tiles = 900 tiles, approximately 1 glyph per 40 tiles = ~22–25 Text objects that are permanently in the scene graph. Text objects have overhead. These should be baked into a RenderTexture or drawn as Graphics so they're effectively a single object.

### 16. Wave banner hard-codes max 10 waves
**File:** `GameScene.ts:330`
`waveNum >= 10 ? 'ALL WAVES CLEARED'` is hardcoded. If `TOTAL_WAVES` on the server ever changes, the banner condition won't match. Use a shared constant or receive the total from the server's `waveName`/`wavePhase` data.

---

## GAME LOGIC

### 17. Skills don't affect combat
**Files:** `spacetimedb/src/index.ts` — `run_combat_tick`
The skill system (`SKILL_DEFS`, heavy/light/missile/war_magic etc.) is fully defined and players can train/specialize skills, but `run_combat_tick` uses `PLAYER_BASE_DAMAGE` with only weapon `dm` stat and armor `ar` modifier. No skill level is factored in. This is the biggest missing AC-authenticity feature — training heavy weapons should matter.
**Suggested scaling:** `damage = baseDmg * weaponMult * (1 + skill_level * 0.15)` where skill_level = 0/1/2 for untrained/trained/specialized.

### 18. Run skill has no effect
**File:** `spacetimedb/src/index.ts`
`run` skill is defined in `SKILL_DEFS` and can be trained, but `move_player` uses a flat speed from `ENEMY_STATS` for enemies and flat `MOVE_SPEED = 200` for players. Training run skill should increase player movement speed.
**Suggested:** In `move_player` (or read from character row), apply: `speed * (1 + run_skill * 0.20)`.

### 19. Melee Defense skill has no effect
Same pattern as run/combat — trained but not used anywhere in damage calculation. Should reduce incoming damage or increase dodge chance.

### 20. No item-magic skill gate on dungeon portals
**File:** `spacetimedb/src/index.ts` — `PORTAL_TIER_CAP`
`PORTAL_TIER_CAP` is defined (untrained=1, trained=3, specialized=5) but it's unclear if it's enforced in `enter_dungeon` or `enter_portal`. If not enforced, the skill system gate has no real teeth.

### 21. Dungeon floor 4 "Hydra Lair" spawns olthoi and shadow — but not the Hydra boss
**File:** `spacetimedb/src/index.ts:235`
`DUNGEON_FLOOR_DEFS[3]` = `{ name: 'Hydra Lair', types: ['olthoi', 'shadow'], ... }`. The regular ambient enemies are olthoi/shadow, which is fine — but the floor name implies the Hydra boss should appear here. The Hydra boss IS `BOSS_DEFS[3]` so it should naturally spawn as this floor's boss. Confirm the boss spawn index matches the floor index.

### 22. Bael'Zharon wave spawns enemies, not the actual boss
**File:** `spacetimedb/src/index.ts:116`
Wave 10 is named `"Bael'Zharon"` but `WAVE_DEFS[9]` spawns `['shadow', 'virindi', 'tusker']` — just a heavy mixed wave. The actual Bael'Zharon boss is floor 10 in the dungeon. The home world wave should either rename to reflect it's just a heavy wave, or trigger a boss spawn to make wave 10 a true climax.

### 23. Hub and Grind worlds have no enemy cap
**File:** `spacetimedb/src/index.ts` — shared world handling
Hub and Grind are shared worlds. As more players arrive and ring bells, enemies accumulate. There's no global cap for these worlds (only per-wave counts). With many players, shared worlds can become unplayable. Add a `maxEnemies` check before any wave or ambient spawn in non-home worlds.

### 24. Stale dungeon worlds if player disconnects mid-run
**File:** `spacetimedb/src/index.ts` — `maybeDeactivateDungeon()`
If a player crashes without a clean `logout` reducer call, their dungeon world persists indefinitely with its spawn timers still running. `clientDisconnected` should also call world deactivation cleanup. Confirm this is handled in the `clientDisconnected` lifecycle hook.

### 25. Hydra body is immune while heads alive — but this isn't communicated to players
**File:** `spacetimedb/src/index.ts` — damage routing
When all 4 heads are alive, damage routes to the lowest-HP head and the body takes nothing. The player has no in-game feedback that they need to target/damage heads. The boss HP bar (#9 above) could show "HEAD HP" vs "BODY HP" to communicate the mechanic visually.

### 26. `dropChance: 0` for hydra means no loot from a 5-floor boss
**File:** `spacetimedb/src/index.ts:99`
The hydra archetype has `dropChance: 0`. This is intentional to prevent double-loot (heads + body), but when the hydra body dies it also has no drop. The player kills an epic boss and gets nothing. The boss death should guarantee a `dropTier: 2` item from `BOSS_DEFS[3]`.
**Fix:** Trigger guaranteed loot from `spawnDungeonBoss`'s death handling rather than from `dropChance`, which is the regular random loot roll.

---

## ARCHITECTURE & CODE QUALITY

### 27. Critical constants duplicated between client and server
These values are defined independently in both files and will drift:
- `WORLD_W/H = 2400` — server `index.ts:6–7`, client `GameScene.ts:18–19`
- `PORTAL_RANGE = 70` — server `index.ts:27`, client `GameScene.ts:27`
- `DUNGEON_EXIT_PORTAL_X/Y`, `DUNGEON_HUB_PORTAL_X/Y` — both files
- `BASE_ATTACK_INTERVAL_MS = 500` — client, matching `CMB_INTERVAL_US = 500_000n` on server
- Spawn positions are only on the server but affect client display

These should live in a single `shared-constants.ts` imported by both — or at minimum be clearly marked with `// MUST MATCH server constant` comments.

### 28. `ENEMY_TYPE_DATA` and `ENEMY_STATS` are parallel structures
`ENEMY_TYPE_DATA` in the client and `ENEMY_STATS` in the server both define per-enemy data. They can drift. XP in `ENEMY_TYPE_DATA` (used for popup display only) should match `xp` in server `ENEMY_STATS` — and they do right now, but only by convention. Consider whether XP should come from the server row (`enemy.xp` could be a table field) rather than a client-side lookup.

### 29. Pixel art mode only affects players and ground items, not enemies
**File:** `GameScene.ts:423–437`
`setPixelArtMode` toggles player circles/sprites and ground item glow/card. But enemies are unconditionally pixel art (no toggle). The `pixelArtMode` boolean is therefore only "player pixel art mode." The setting is confusing — rename to `setPlayerPixelArt` or make the setting also toggle enemy circles vs sprites for consistency.

### 30. `mechState` string format is brittle
**Files:** `boss-renderer.ts:20–30`, `spacetimedb/src/index.ts`
`"hydra:XXXX:P"` is parsed with `split(':')` in the client. If any future boss mechanic uses a colon in its state (e.g., `"blink:target:1234"`), parsing breaks. Consider using a structured separator like `|` or switching to a small JSON-encoded string.

### 31. Boss mechanics are a monolithic switch
**File:** `spacetimedb/src/index.ts` — `run_enemy_ai`
~200 lines of if/else and switch cases for boss mechanics (enrage, blink, warcry, hydra, phase, mirror, charge, nova, frenzy). Adding a new boss requires editing multiple locations. This is fine at 10 bosses but will become maintenance-heavy with more. Consider extracting each mechanic into a named function: `handleEnrage(ctx, enemy, now)`, etc.

### 32. `paintPixelSlots()` / `itemPixelHTML()` duplicated across UI files
The Explore agent found identical helper functions in both `InGamePanel.ts` and `BottomHud.ts`. Extract to `src/ui/ui-utils.ts`.

### 33. Rarity is magic numbers throughout
Rarity is stored as `u32` (0–5) in the DB and referenced everywhere as bare numbers. No enum, no named constants. `RARITY_COLORS[rarity]`, `RARITY_HEX_CSS[rarity]`, `waveTier()` all use numeric comparisons. A `RARITY` enum or `const RARITY = { SCUFFED: 0, ... }` object would make intent clear and prevent invalid values (6, 255, etc.) from silently doing nothing.

---

## PERFORMANCE

### 34. Minimap redraws every Phaser frame
**File:** `BottomHud.ts` — `updateMinimap()`
Full 96×96 canvas clear + clip + enemy dots + player dot + portal dots every frame. At 60fps this is 60 full minimap redraws per second. Throttle to ~15fps (accumulate a timer, only redraw when >66ms has elapsed).

### 35. World floor tiles are 900 individual `fillRect` calls
**File:** `GameScene.ts:209–228`
The `buildWorld()` loop calls `g.fillRect()` 900 times. While Graphics batches these at draw time, the command buffer is large. More critically, each glyph tile creates a `this.add.text()` object that persists in the scene graph. Render the entire floor once to a `RenderTexture` and use that as a static background image instead.

### 36. Sprite pools needed for combat effects
**File:** `GameScene.ts` — attack/impact functions
Every melee swing creates a new `Graphics` object, tweens it, then destroys it. Every impact creates 5 `Arc` objects. For a party of 3 players each attacking at 500ms intervals = 6 Graphics + 30 Arcs created/destroyed per second. At scale this causes GC pressure. Phaser's `Group` with `maxSize` and `createMultiple` can pre-allocate a pool.

### 37. `run_enemy_ai` is O(E × P) for every tick
**File:** `spacetimedb/src/index.ts` — `run_enemy_ai`
Each of E enemies iterates all P players to find the nearest one. At 20 enemies × 4 players = 80 comparisons per 100ms tick — fine now. At 100 enemies it's 400/tick, still OK. At 500 enemies (end-game Hub) it's 2000/tick. Not urgent but worth a spatial index (grid buckets) when scaling up.

---

## MISSING CONTENT & SYSTEMS

### 38. No audio system
Zero sound in the game. This is the single biggest "game feel" gap. Wave start, wave clear, level up, loot drop, boss enter, boss death, footsteps, combat hits, portal whoosh — even placeholder Web Audio API beeps would make the game feel dramatically more alive. Phaser's `this.sound.add()` with a sound sprite is the right approach.

### 39. No boss introduction sequence
When a boss spawns in the dungeon there's no fanfare — it just appears. A 2-second camera shake + boss name banner + boss HP bar reveal would make boss encounters feel like events. The wave banner system is already built; reuse it for boss intros.

### 40. Unicorn has no special behavior
Wave 3 "Unicorn Glade" spawns unicorns which behave identically to other enemies (move toward player, attack). The creature-lab unicorn sprite is beautifully distinctive. Give them a unique behavior — e.g., brief speed burst (charge) or a rainbow particle trail to match the aesthetic.

### 41. No visual difference between dungeon floor types
All dungeon floors render identically — same dark stone tile background, same border. Floor 1 (Drudge Warrens) and floor 10 (Bael'Zharon's Domain) look the same. Each floor type should have a distinct background tint or overlay: warm orange for Drudge Warrens, deep purple for Bael'Zharon, toxic green for Hydra Lair, etc. `buildWorld()` could accept a tint parameter.

### 42. No visual for skill level (Trained/Specialized)
**File:** `InGamePanel.ts`
Skills show their level numerically but there's no iconic distinction between Untrained / Trained / Specialized. AC used visual badges. Even a simple color change (grey / yellow / gold) or a ★ symbol would make skill progression feel rewarding.

### 43. No party/co-op UI
Multiple players can be in the same Hub/Grind world but there's no party indicator, shared health bars for teammates, or party damage numbers. Even just seeing other players' HP status on a small panel would enable coordination.

### 44. No leaderboard or persistent run history
Every run is ephemeral. No record of fastest dungeon clear, highest wave reached, most kills, etc. A `leaderboard` table with weekly/all-time entries per character would give players a reason to keep pushing.

### 45. Bell mechanic for home world waves is not visible in-game
The CLAUDE.md design doc mentions "ringing the bell is a deliberate choice to start a wave." There's no bell object visible in the home world — waves seem to auto-start. If the bell mechanic was deprioritized, the design intent note in `CLAUDE.md` should be updated to reflect the auto-wave implementation.

### 46. Crafting system absent
Referenced in `PLAN.md` but no tables, reducers, or UI for it. Salvaging items gives XP, but there's no path to upgrade gear. With 6 rarity tiers and the AC-inspired aesthetic, a forge/crafting system would be the natural next progression system after leveling.

---

## QUICK WIN SUMMARY

Items that can be fixed in under an hour each, sorted by impact:

| # | Fix | Impact |
|---|-----|--------|
| 8 | Remove local player world-space HP bar | Visual clutter gone |
| 2 | Add `larva` to `ENEMY_TYPE_DATA` | Fixes `?` larva in dungeon |
| 3 | Add `hydra` to `ENEMY_TYPE_DATA` | Fixes boss death effect |
| 10 | Add alpha tween to boss aura | Immediate visual polish |
| 11 | Fix enemy HP bar Y offset for sprites | HP bars align to sprite tops |
| 12 | Hide world debug text | Cleaner production build |
| 13 | Hide self username label | Less screen clutter |
| 4 | Assign `pound` → `charge` for Torgluuk | Boss actually has a mechanic |
| 26 | Guarantee loot on boss death | Boss kill feels rewarding |
| 1 | Fix attack range mismatch (set client to 85) | Player attacks feel accurate |
