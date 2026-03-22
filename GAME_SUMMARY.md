# Dereth (Bullet Hell / AC×VS Game) — Full Summary

## What It Is

A top-down multiplayer browser game blending **Asheron's Call** (deep AC-faithful character system: races, attributes, skills) with **Vampire Survivors** (wave survival, constant enemy pressure). Set in ancient ruins with a fantasy-but-not-generic-fantasy aesthetic — glyphs, stone structures, lost civilizations.

The database name is `my-spacetime-app-7dl29`, server-side it's called **Dereth**.

---

## Game Loop

### 1. Authentication & Connection
- Login via **Firebase** (Google OAuth) or anonymous auth
- Firebase token is stored in Firestore and used to re-authenticate with SpacetimeDB on reconnect
- On connect, a `Player` row is created/updated; identity is established

### 2. Character Selection / Creation
- Up to **3 characters** per account
- Character creation involves:
  - Choose a **race** (Aluvian, Gharundim, Sho, Viamontian, Umbraen — each with attribute bonuses)
  - Point-buy **6 attributes** (STR, END, COORD, QUICK, FOC, SELF) — must sum to exactly 200, each 10–100
  - Spend **32 skill credits** on 9 skills at creation (trained = 1, specialized = 2): Heavy Weapons, Light Weapons, Missile, War Magic, Life Magic, Item Magic, Melee Defense, Run, Alchemy

### 3. The Hub (Lifestone Screen)
Between runs, the player lands in the **HubScreen** (browser overlay). Here they:
- Spend XP on attribute raises (scaling costs via `50 × 1.4^raised`)
- Spend XP on skill raises (scaling costs, cheaper if specialized)
- Equip/unequip gear from vault
- Spend **Tokens** to get a random vault item (tier 0–2)
- **Deploy** into their home world to start fighting
- Enter the **Dungeon** (floors 1–10) directly from the hub

### 4. The World System (Shards)
The game has distinct **world types**:

| World | Description |
|-------|-------------|
| `home` | Per-player private world. Wave survival arena. Enemies auto-spawn on first deploy. |
| `hub` | Shared social area. No enemies. Has 10 dungeon entry portals + home portal. |
| `grind` | Shared world. Constant ambient larva spawning. Great for low-effort XP. |
| `dungeon` | Instanced per-floor. 10 floors, each with a boss + continuous enemy spawns. |

Players travel between worlds via **portals** — animated ring structures visible in the game world.

### 5. In-Game (Phaser)
- **Movement**: WASD/arrows at ~20hz; client sends `movePlayer` reducer calls; server clamps to bounds and updates `PlayerPosition`
- **Auto-attack**: Server runs a combat tick every 500ms. Attacks all enemies within range (90px). Damage = `base × (1 + gear dm bonus)`. Gear `ar` (armor) reduces incoming damage (capped at 75%)
- **Enemy AI**: Server runs an AI tick every 100ms. Enemies chase nearest living online player in their world
- **Death**: On death, all equipped + backpack items are **dropped/deleted**. The run ends if no other living players remain
- **Respawn**: Returns player to home world spawn at full HP
- **Portal extraction** (P key): Cast a portal (4–12s depending on Item Magic skill level). On completion, backpack items up to your tier cap are moved to vault (excess deleted). Extracts you safely

### 6. Wave System (Home Worlds)
10 named waves, progressively harder:

| Wave | Name | Enemies |
|------|------|---------|
| 1 | Drudge Scouts | 10 drudge |
| 2 | Shadow Ambush | 8 shadow |
| 3 | Drudge Warband | 14 drudge+banderling |
| 4 | Olthoi Brood | 6 olthoi |
| 5 | Shadow Legion | 12 shadow+virindi |
| 6 | Tusker Stampede | 6 tusker |
| 7 | Virindi Apparatus | 10 virindi+shadow |
| 8 | The Horde | 20 mixed |
| 9 | Olthoi Guard | 12 olthoi+tusker |
| 10 | Bael'Zharon | 16 shadow+virindi+tusker |

- Wave 1 auto-starts on first deploy
- After a wave is cleared, 8-second inter-wave timer, then next wave spawns
- HP bonus scales: `+5 HP per wave number`
- After all 10 waves, all players in that world are portal-extracted automatically

### 7. Dungeon System (10 Floors)
Each floor is an instanced world:
- Continuous enemy spawning (interval varies per floor, 2–4s)
- One **named boss** spawns immediately
- Progress gated: must kill previous floor's boss to unlock next floor
- Boss kill awards `PlayerProgress` (highest floor cleared) to all living players in that world
- 10 boss types, each with unique mechanics:

| Boss | Mechanic |
|------|---------|
| Bloody Bones | Enrage at 50% HP (speed boost) |
| The Whisperer | Blink — teleports near players every 5s |
| Grunter the Brute | Warcry — buffs nearby minions |
| Brood Mother | Spawn — summons olthoi hatchlings every 5s |
| Martine the Mad | Phase — immune every 6s for 2s |
| Torgluuk | Charge — charges every 5s for 1s |
| The Hollow One | Mirror — spawns decoy copies every 8s |
| Pandemonium | Frenzy (mechanic defined, behavior in combat tick) |
| Olthoi Eviscerator | Charge (heavy version) |
| Bael'Zharon | Nova + passive regen |

### 8. Loot System
- Enemies drop items on death based on `dropChance` (12–30% depending on type)
- Items spawn on the ground, expire after 30 seconds
- Players walking over ground items auto-pick them up into backpack (6 slots max)
- 6-slot gear system: weapon, head, chest, hands, feet, trinket
- 6 rarity tiers: Scuffed → Serviceable → Quality → Superior → Exquisite → Atlan
- Items have a primary stat + optional bonus stat (at tier ≥2)
- Primary stats: `dm` (damage), `hp`, `ar` (armor reduction), `as` (attack speed), `xp` (XP bonus), `sp` (attack speed)
- Portal extraction tier cap depends on Item Magic skill level

### 9. Progression
- **XP** earned by all living deployed players in a world when enemies die (XP gear bonus applies)
- **Level** computed from total XP (275 max, ~15% scaling per level)
- **Unspent XP** used to raise attributes and skills between runs
- **Tokens** earned at XP milestones (CR system, 7 milestones) — spend on vault loot
- Token passive generation: +1 token per minute while deployed

---

## Enemy Types

| Type | HP | Damage | Speed | XP | Drop% |
|------|----|--------|-------|----|-------|
| Drudge | 20 | 3 | 14 | 5 | 12% |
| Olthoi | 55 | 7 | 9 | 12 | 22% |
| Shadow | 30 | 5 | 18 | 8 | 18% |
| Tusker | 80 | 10 | 7 | 18 | 28% |
| Virindi | 45 | 6 | 12 | 15 | 30% |
| Banderling | 65 | 8 | 8 | 10 | 18% |
| Larva (grind) | 5 | 1 | 12 | 1 | 1% |

---

## Client UI

All UI outside the game canvas is plain TypeScript/HTML overlay classes (no React):

- **LoginScreen** — Firebase auth (Google sign-in)
- **CharacterSelect** — list of up to 3 characters, link to create
- **CharacterCreate** — full race/attribute/skill creation form
- **HubScreen** — between-run management: gear, XP spending, dungeon entry, token spending
- **InGamePanel** — in-game character panel (toggle with `C`) for gear and XP
- **TopBar** — settings button + logout (shown while deployed)
- **SettingsPanel** — radar toggle
- **Radar** — minimap-style overlay showing enemies and players

### Input (in-game)
| Key | Action |
|-----|--------|
| WASD / Arrows | Move |
| C | Toggle character panel |
| F | Toggle portal cast start/cancel |
| P | Start/cancel portal extraction |
| R | Respawn (when dead) |

---

## Technical Architecture

### Server — SpacetimeDB (TypeScript, v2)
Single file: `spacetimedb/src/index.ts`

**Tables:**
- `player` — identity, username, online status, active character ID
- `player_position` — identity, worldId, x, y (public, world-scoped subscriptions)
- `player_health` — identity, currentHp, maxHp (public)
- `character` — full AC-style character sheet (all attributes, all skill levels/raises, level, XP, tokens)
- `item` — gear with slot/stat/rarity/location (`equipped`|`backpack`|`vault`|`ground`)
- `portal_cast` — in-progress portal extraction state
- `enemy` — worldId, type, position, HP, boss state/mechanics
- `world` — world shard state (type, wave number/name/phase, timers)
- `world_portal` — portals within a world (type-resolved to positions server-side)
- `player_progress` — highest dungeon floor cleared per character

**Scheduled reducers (server-side game loop):**
- `run_enemy_ai` — every 100ms: move enemies toward nearest player, activate boss mechanics
- `run_combat_tick` — every 500ms: auto-attack enemies in range, apply damage, handle death/loot drops
- `wave_spawn` — fires after inter-wave timer; spawns the next named wave
- `olthoi_layer_tick` — periodic ambient larva spawning in the grind world
- `dungeon_spawn_tick` — per-floor continuous enemy spawning in dungeon worlds

**Player reducers:**
`create_character`, `select_character`, `deploy_player`, `move_player`, `logout`, `respawn_player`, `set_player_name`, `spend_xp`, `spend_skill_xp`, `spend_token`, `equip_item`, `unequip_item`, `move_to_vault`, `start_portal_cast`, `cancel_portal_cast`, `enter_portal`, `enter_dungeon`

### Client — Phaser 3 + TypeScript + Vite
- Single `GameScene` — renders a 2400×2400 tile-based world, all entities as geometric shapes (no sprite assets yet)
- World background: procedural tiled floor with rare glyph decorations
- Enemy visuals: colored circles with letter labels + floating HP bars
- Player visuals: colored circles (color = race) with username labels
- Portal visuals: animated ring pairs with proximity prompts
- Camera follows local player with world bounds clamped

### State Sync
- Client subscribes to global tables (`player`, `character`, `item`, etc.) on connect
- Subscribes to world-scoped tables (`player_position`, `enemy`, `world_portal`) per world shard, re-subscribing on world transitions
- SpacetimeDB `onInsert`/`onUpdate`/`onDelete` callbacks drive all rendering — no client-side game state

### Deployment
- **Database**: SpacetimeDB maincloud (`wss://maincloud.spacetimedb.com`, database `my-spacetime-app-7dl29`)
- **Client**: Vite build, deployable to any static host (Firebase Hosting via `firebase.json` + `.firebaserc`)
- **Auth**: Firebase project for Google OAuth
- Token persistence: SpacetimeDB-issued auth token stored in both `localStorage` and Firestore (linked to Firebase UID for cross-device continuity)

**Dev workflow:**
```bash
cd my-spacetime-app
spacetime publish          # push server module to maincloud
npm run spacetime:generate # regenerate client bindings
npm run dev                # local Vite dev server
```
