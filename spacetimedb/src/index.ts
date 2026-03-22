import { schema, table, t, SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

// ── World constants ─────────────────────────────────────────────────────────────

const WORLD_W = 2400;
const WORLD_H = 2400;

const AI_INTERVAL_US  = 100_000n;
const CMB_INTERVAL_US = 500_000n;
const INTER_WAVE_US   = 8_000_000n;

const ENEMY_ATTACK_RANGE  = 44;
const PLAYER_ATTACK_RANGE = 90;
const PLAYER_BASE_DAMAGE  = 12;

const PLAYER_SPAWN_X = 1200;
const PLAYER_SPAWN_Y = 1350;

// ── Portal / world-bridge constants ────────────────────────────────────────────

// Portals in HOME worlds (near spawn)
const PORTAL_HUB_X   = 1050;  const PORTAL_HUB_Y   = 1350;  // left — goes to HUB
const PORTAL_GRIND_X = 1350;  const PORTAL_GRIND_Y = 1350;  // right — goes to GRIND
// Portal in HUB and GRIND worlds (center)
const PORTAL_HOME_X  = 1200;  const PORTAL_HOME_Y  = 1200;  // returns to HOME
const PORTAL_RANGE   = 70;

// Hub world dungeon entry portals — 5×2 grid (mirrored client-side)
const HUB_DUNGEON_X_START = 800;
const HUB_DUNGEON_X_STEP  = 150;
const HUB_DUNGEON_Y1      = 900;   // floors 1–5
const HUB_DUNGEON_Y2      = 700;   // floors 6–10

// ── Character system constants ──────────────────────────────────────────────────

const ATTR_TOTAL    = 200;
const ATTR_MIN      = 10;
const ATTR_MAX      = 100;
const SKILL_CREDITS = 32;
const SPEC_CAP      = 70;

const SKILL_UNTRAINED   = 0;
const SKILL_TRAINED     = 1;
const SKILL_SPECIALIZED = 2;

const TOKEN_INTERVAL_US = 60_000_000n;

const CR_MILESTONES: Array<{ xp: number; cr: number }> = [
  { xp: 500,    cr: 1 },
  { xp: 2000,   cr: 2 },
  { xp: 5000,   cr: 2 },
  { xp: 10000,  cr: 2 },
  { xp: 20000,  cr: 2 },
  { xp: 50000,  cr: 2 },
  { xp: 150000, cr: 2 },
];

function checkMilestones(totalXp: bigint, earnedCredits: number): number {
  let earned = 0;
  for (const m of CR_MILESTONES) if (Number(totalXp) >= m.xp) earned += m.cr;
  return Math.max(0, earned - earnedCredits);
}

// ── Race data ───────────────────────────────────────────────────────────────────

const RACE_BONUSES: Record<string, Record<string, number>> = {
  aluvian:    { STR: 5, END: 5 },
  gharundim:  { FOC: 5, SELF: 5 },
  sho:        { COORD: 5, QUICK: 5 },
  viamontian: { STR: 3, COORD: 3, END: 3 },
  umbraen:    { FOC: 5, QUICK: 5 },
};

const SKILL_COSTS: Record<string, [number, number]> = {
  heavy:      [6, 6], light:      [4, 4], missile:    [6, 6],
  war_magic:  [8, 8], life_magic: [6, 6], melee_def:  [4, 4],
  run:        [2, 2], alchemy:    [2, 2], item_magic: [4, 4],
};

interface SkillDef { attrs: string[]; div: number; }
const SKILL_DEFS: Record<string, SkillDef> = {
  heavy:      { attrs: ['STR', 'COORD'],   div: 3 },
  light:      { attrs: ['COORD', 'QUICK'], div: 3 },
  missile:    { attrs: ['COORD'],          div: 2 },
  war_magic:  { attrs: ['FOC', 'SELF'],    div: 3 },
  life_magic: { attrs: ['FOC', 'COORD'],   div: 3 },
  item_magic: { attrs: ['FOC', 'SELF'],    div: 3 },
  melee_def:  { attrs: ['COORD', 'QUICK'], div: 3 },
  run:        { attrs: ['QUICK'],          div: 1 },
  alchemy:    { attrs: ['FOC', 'COORD'],   div: 3 },
};

// ── Enemy data ──────────────────────────────────────────────────────────────────

interface EnemyStat { hp: number; damage: number; speed: number; xp: number; dropChance: number; }

const ENEMY_STATS: Record<string, EnemyStat> = {
  drudge:     { hp: 20,  damage: 3,  speed: 14, xp: 5,  dropChance: 0.12 },
  olthoi:     { hp: 55,  damage: 7,  speed: 9,  xp: 12, dropChance: 0.22 },
  shadow:     { hp: 30,  damage: 5,  speed: 18, xp: 8,  dropChance: 0.18 },
  tusker:     { hp: 80,  damage: 10, speed: 7,  xp: 18, dropChance: 0.28 },
  virindi:    { hp: 45,  damage: 6,  speed: 12, xp: 15, dropChance: 0.30 },
  banderling: { hp: 65,  damage: 8,  speed: 8,  xp: 10, dropChance: 0.18 },
  // OlthoiLayer ambient spawn — hatchlings, super weak, barely any drops
  larva:      { hp: 5,   damage: 1,  speed: 12, xp: 1,  dropChance: 0.01 },
};

// ── Named waves ─────────────────────────────────────────────────────────────────

const WAVE_DEFS: Array<{ name: string; types: string[]; count: number }> = [
  { name: 'Drudge Scouts',     types: ['drudge'],                                           count: 10 },
  { name: 'Shadow Ambush',     types: ['shadow'],                                           count: 8  },
  { name: 'Drudge Warband',    types: ['drudge', 'banderling'],                             count: 14 },
  { name: 'Olthoi Brood',      types: ['olthoi'],                                           count: 6  },
  { name: 'Shadow Legion',     types: ['shadow', 'virindi'],                                count: 12 },
  { name: 'Tusker Stampede',   types: ['tusker'],                                           count: 6  },
  { name: 'Virindi Apparatus', types: ['virindi', 'shadow'],                                count: 10 },
  { name: 'The Horde',         types: ['drudge', 'olthoi', 'shadow', 'tusker', 'banderling'], count: 20 },
  { name: 'Olthoi Guard',      types: ['olthoi', 'tusker'],                                 count: 12 },
  { name: "Bael'Zharon",       types: ['shadow', 'virindi', 'tusker'],                      count: 16 },
];

const TOTAL_WAVES = WAVE_DEFS.length;

// ── Gear data ────────────────────────────────────────────────────────────────────

const GEAR_TIER_NAMES = ['Scuffed', 'Serviceable', 'Quality', 'Superior', 'Exquisite', 'Atlan'];
const GEAR_TIER_MULT  = [1.0, 1.3, 1.7, 2.2, 2.8, 3.6];

function waveTier(waveNum: number): number {
  if (waveNum <= 2) return 0;
  if (waveNum <= 4) return 1;
  if (waveNum <= 6) return 2;
  if (waveNum <= 8) return 3;
  if (waveNum <= 9) return 4;
  return 5;
}

const GEAR_SLOTS  = ['weapon', 'head', 'chest', 'hands', 'feet', 'trinket'];
const BONUS_STATS = ['hp', 'sp', 'ar', 'as', 'xp'];
const ITEM_GROUND_LIFETIME_US = 30_000_000n;
const BACKPACK_MAX = 6;
const VAULT_MAX    = 12;

interface GearTemplate { name: string; icon: string; stat: string; base: number; }

const GEAR_TEMPLATES: Record<string, GearTemplate[]> = {
  weapon:  [
    { name: 'War Sword',  icon: '⚔️',  stat: 'dm', base: 1.5  },
    { name: 'War Axe',    icon: '🪓',  stat: 'dm', base: 1.7  },
    { name: 'Katar',      icon: '🗡️',  stat: 'dm', base: 1.3  },
    { name: 'Sceptre',    icon: '🔮',  stat: 'dm', base: 1.8  },
  ],
  head: [
    { name: 'Armet',      icon: '⛑️',  stat: 'hp', base: 4.0  },
    { name: 'Circlet',    icon: '👑',  stat: 'xp', base: 0.04 },
    { name: 'Coif',       icon: '🪖',  stat: 'ar', base: 0.03 },
    { name: 'Bascinet',   icon: '🎭',  stat: 'sp', base: 0.04 },
  ],
  chest: [
    { name: 'Hauberk',    icon: '🛡️',  stat: 'ar', base: 0.03 },
    { name: 'Cuirass',    icon: '🦺',  stat: 'hp', base: 6.0  },
    { name: 'Corselet',   icon: '🧥',  stat: 'ar', base: 0.04 },
    { name: 'Doublet',    icon: '🎽',  stat: 'sp', base: 0.03 },
  ],
  hands: [
    { name: 'Gauntlets',  icon: '🧤',  stat: 'dm', base: 1.0  },
    { name: 'Bracers',    icon: '⚙️',  stat: 'as', base: 0.025},
    { name: 'Cestus',     icon: '✊',  stat: 'dm', base: 0.8  },
    { name: 'Wrappings',  icon: '🫳',  stat: 'xp', base: 0.03 },
  ],
  feet: [
    { name: 'Sollerets',  icon: '👢',  stat: 'sp', base: 0.05 },
    { name: 'Greaves',    icon: '🦿',  stat: 'ar', base: 0.025},
    { name: 'Sandals',    icon: '🥾',  stat: 'sp', base: 0.07 },
    { name: 'Chausses',   icon: '🩱',  stat: 'hp', base: 3.0  },
  ],
  trinket: [
    { name: 'Sigil',      icon: '📿',  stat: 'dm', base: 1.5  },
    { name: 'Scarab',     icon: '🪲',  stat: 'as', base: 0.03 },
    { name: 'Amulet',     icon: '🧿',  stat: 'hp', base: 5.0  },
    { name: 'Talisman',   icon: '🔯',  stat: 'xp', base: 0.05 },
  ],
};

const PORTAL_CAST_TIME: Record<number, bigint> = {
  [SKILL_UNTRAINED]:   12_000_000n,
  [SKILL_TRAINED]:      8_000_000n,
  [SKILL_SPECIALIZED]:  4_000_000n,
};
const PORTAL_TIER_CAP: Record<number, number> = {
  [SKILL_UNTRAINED]:   1,
  [SKILL_TRAINED]:     3,
  [SKILL_SPECIALIZED]: 5,
};

const SPAWN_POSITIONS: Array<[number, number]> = [
  [120, 120],  [2280, 120],  [120, 2280],  [2280, 2280],
  [1200, 80],  [1200, 2320], [80, 1200],   [2320, 1200],
  [600, 140],  [1800, 140],  [600, 2260],  [1800, 2260],
  [140, 600],  [2260, 600],  [140, 1800],  [2260, 1800],
];

// ── Dungeon system constants ──────────────────────────────────────────────────────

const DUNGEON_PORTAL_RANGE = 90;
const DUNGEON_PLAYER_SPAWN_X = 1200;
const DUNGEON_PLAYER_SPAWN_Y = 1350;
// Dungeon portal to next floor sits near the far end of the arena
const DUNGEON_EXIT_PORTAL_X = 1200;
const DUNGEON_EXIT_PORTAL_Y = 300;
// Hub-return portal near spawn
const DUNGEON_HUB_PORTAL_X = 1200;
const DUNGEON_HUB_PORTAL_Y = 1500;

interface BossDef {
  name: string; baseType: string; hpMult: number; spMult: number;
  xpMult: number; dropTier: number; mechanic: string; damageBonus: number;
}
const BOSS_DEFS: BossDef[] = [
  { name: 'Bloody Bones',       baseType: 'drudge',     hpMult: 3,  spMult: 1.0, xpMult: 5, dropTier: 1, mechanic: 'enrage',  damageBonus: 5  },
  { name: 'The Whisperer',      baseType: 'shadow',     hpMult: 3,  spMult: 0.7, xpMult: 5, dropTier: 1, mechanic: 'blink',   damageBonus: 7  },
  { name: 'Grunter the Brute',  baseType: 'banderling', hpMult: 4,  spMult: 0.8, xpMult: 5, dropTier: 2, mechanic: 'warcry',  damageBonus: 8  },
  { name: 'Brood Mother',       baseType: 'olthoi',     hpMult: 5,  spMult: 0.6, xpMult: 5, dropTier: 2, mechanic: 'spawn',   damageBonus: 7  },
  { name: 'Martine the Mad',    baseType: 'virindi',    hpMult: 6,  spMult: 1.0, xpMult: 5, dropTier: 3, mechanic: 'phase',   damageBonus: 10 },
  { name: 'Torgluuk',           baseType: 'tusker',     hpMult: 7,  spMult: 0.5, xpMult: 5, dropTier: 3, mechanic: 'pound',   damageBonus: 15 },
  { name: 'The Hollow One',     baseType: 'virindi',    hpMult: 7,  spMult: 1.0, xpMult: 5, dropTier: 4, mechanic: 'mirror',  damageBonus: 12 },
  { name: 'Pandemonium',        baseType: 'shadow',     hpMult: 8,  spMult: 0.8, xpMult: 5, dropTier: 4, mechanic: 'frenzy',  damageBonus: 10 },
  { name: 'Olthoi Eviscerator', baseType: 'olthoi',     hpMult: 9,  spMult: 0.7, xpMult: 5, dropTier: 5, mechanic: 'charge',  damageBonus: 20 },
  { name: "Bael'Zharon",        baseType: 'shadow',     hpMult: 12, spMult: 1.0, xpMult: 8, dropTier: 5, mechanic: 'nova',    damageBonus: 25 },
];

interface FloorDef { name: string; types: string[]; cap: number; spawnIntervalUs: bigint; diffMult: number; }
const DUNGEON_FLOOR_DEFS: FloorDef[] = [
  { name: 'Drudge Warrens',        types: ['drudge'],                                              cap: 12, spawnIntervalUs: 3_000_000n, diffMult: 1.0 },
  { name: 'Shadow Den',            types: ['shadow'],                                              cap: 10, spawnIntervalUs: 3_500_000n, diffMult: 1.2 },
  { name: 'Banderling Lair',       types: ['drudge', 'banderling'],                                cap: 16, spawnIntervalUs: 2_500_000n, diffMult: 1.4 },
  { name: 'Olthoi Nest',           types: ['olthoi'],                                              cap: 8,  spawnIntervalUs: 4_000_000n, diffMult: 1.6 },
  { name: 'Virindi Sanctum',       types: ['shadow', 'virindi'],                                   cap: 14, spawnIntervalUs: 3_000_000n, diffMult: 1.8 },
  { name: 'Tusker Canyon',         types: ['tusker'],                                              cap: 8,  spawnIntervalUs: 4_000_000n, diffMult: 2.0 },
  { name: 'Virindi Apparatus',     types: ['virindi', 'shadow'],                                   cap: 12, spawnIntervalUs: 3_000_000n, diffMult: 2.2 },
  { name: 'The Horde',             types: ['drudge', 'olthoi', 'shadow', 'tusker', 'banderling'],  cap: 22, spawnIntervalUs: 2_000_000n, diffMult: 2.5 },
  { name: 'Olthoi Guard',          types: ['olthoi', 'tusker'],                                    cap: 14, spawnIntervalUs: 3_000_000n, diffMult: 2.8 },
  { name: "Bael'Zharon's Domain",  types: ['shadow', 'virindi', 'tusker'],                         cap: 18, spawnIntervalUs: 2_000_000n, diffMult: 3.0 },
];

// ── Scheduled table definitions ──────────────────────────────────────────────────

const enemyAiSchedule = table(
  { name: 'enemy_ai_schedule', scheduled: (): any => run_enemy_ai },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);
const combatSchedule = table(
  { name: 'combat_schedule', scheduled: (): any => run_combat_tick },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt() }
);
// Wave spawn carries worldId so it knows which world to spawn the next wave in
const waveSpawnSchedule = table(
  { name: 'wave_spawn_schedule', scheduled: (): any => wave_spawn },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), worldId: t.u64() }
);
// OlthoiLayer ambient spawn — tops up larva count periodically
const olthoiLayerSchedule = table(
  { name: 'olthoi_layer_schedule', scheduled: (): any => olthoi_layer_tick },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), worldId: t.u64() }
);
// Dungeon continuous enemy spawning — one scheduler per active dungeon world
const dungeonSpawnSchedule = table(
  { name: 'dungeon_spawn_schedule', scheduled: (): any => dungeon_spawn_tick },
  { scheduledId: t.u64().primaryKey().autoInc(), scheduledAt: t.scheduleAt(), worldId: t.u64() }
);

// ── Schema ───────────────────────────────────────────────────────────────────────

const spacetimedb = schema({
  player: table(
    { name: 'player', public: true },
    { identity: t.identity().primaryKey(), username: t.string(), online: t.bool(), activeCharacterId: t.u64() }
  ),
  // playerPosition is now scoped to a world shard
  playerPosition: table(
    { name: 'player_position', public: true },
    { identity: t.identity().primaryKey(), worldId: t.u64(), x: t.f32(), y: t.f32() }
  ),
  playerHealth: table(
    { name: 'player_health', public: true },
    { identity: t.identity().primaryKey(), currentHp: t.u32(), maxHp: t.u32() }
  ),

  character: table(
    { name: 'character', public: true,
      indexes: [{ accessor: 'character_identity', algorithm: 'btree', columns: ['identity'] }] },
    {
      id:         t.u64().primaryKey().autoInc(),
      identity:   t.identity(),
      charName:   t.string(),
      race:       t.string(),
      attrStr: t.u32(), attrEnd: t.u32(), attrCoord: t.u32(),
      attrQuick: t.u32(), attrFoc: t.u32(), attrSelf: t.u32(),
      raisedStr: t.u32(), raisedEnd: t.u32(), raisedCoord: t.u32(),
      raisedQuick: t.u32(), raisedFoc: t.u32(), raisedSelf: t.u32(),
      skillHeavy: t.u32(), skillLight: t.u32(), skillMissile: t.u32(),
      skillWarMagic: t.u32(), skillLifeMagic: t.u32(), skillItemMagic: t.u32(),
      skillMeleeDef: t.u32(), skillRun: t.u32(), skillAlchemy: t.u32(),
      raisedSkillHeavy: t.u32(), raisedSkillLight: t.u32(), raisedSkillMissile: t.u32(),
      raisedSkillWarMagic: t.u32(), raisedSkillLifeMagic: t.u32(), raisedSkillItemMagic: t.u32(),
      raisedSkillMeleeDef: t.u32(), raisedSkillRun: t.u32(), raisedSkillAlchemy: t.u32(),
      level: t.u32(), totalXp: t.u64(), unspentXp: t.u64(), tokens: t.u32(),
      earnedCredits: t.u32(),
      deployed: t.bool(), lastTokenMicros: t.u64(),
      // Which world shard this player is currently in (0 = not deployed)
      currentWorldId: t.u64(),
      // The player's persistent home world (set on first deploy)
      homeWorldId: t.u64(),
    }
  ),

  item: table(
    {
      name: 'item', public: true,
      indexes: [{ accessor: 'item_owner_id', algorithm: 'btree', columns: ['ownerId'] }],
    },
    {
      id:        t.u64().primaryKey().autoInc(),
      ownerId:   t.identity(),
      slot:      t.string(),
      itemName:  t.string(),
      icon:      t.string(),
      rarity:    t.u32(),
      stat:      t.string(),
      val:       t.f32(),
      bonusStat: t.string(),
      bonusVal:  t.f32(),
      location:       t.string(),
      groundX:        t.f32(),
      groundY:        t.f32(),
      worldId:        t.u64(),        // world where this item sits on the ground (0 = not on ground)
      expiresAtMicros: t.u64(),
      itemType:    t.string().default(''),    // Forge item type e.g. 'Sword', 'Helmet' ('' = legacy)
      paletteGame: t.string().default(''),   // Palette game name e.g. 'SLSO8' ('' = legacy)
    }
  ),

  portalCast: table(
    { name: 'portal_cast', public: true },
    {
      identity:          t.identity().primaryKey(),
      startedAtMicros:   t.u64(),
      completesAtMicros: t.u64(),
      tierCap:           t.u32(),
    }
  ),

  // Enemies are scoped to a world shard
  enemy: table(
    { name: 'enemy', public: true,
      indexes: [{ accessor: 'enemy_world_id', algorithm: 'btree', columns: ['worldId'] }] },
    {
      id:        t.u64().primaryKey().autoInc(),
      worldId:   t.u64(),
      enemyType: t.string(),
      x: t.f32(), y: t.f32(),
      currentHp: t.u32(), maxHp: t.u32(),
      damage:    t.u32(),
      // Boss fields (isBoss=false, bossLevel=-1 for regular enemies)
      isBoss:    t.bool(),
      bossLevel: t.i32(),    // -1 = regular, 0–9 = BOSS_DEFS index
      mechTimer: t.u64(),    // µs timestamp of last mechanic activation
      mechState: t.string(), // 'normal' | 'enraged' | 'phaseImmune' | 'charging'
    }
  ),

  // Per-character dungeon progress: highest floor boss killed
  playerProgress: table(
    { name: 'player_progress', public: true },
    {
      characterId:         t.u64().primaryKey(),
      highestFloorCleared: t.u32(),
    }
  ),

  // World shard — one per player (replaces the single global gameState + bell)
  world: table(
    { name: 'world', public: true },
    {
      id:                     t.u64().primaryKey().autoInc(),
      ownerIdentity:          t.identity(),
      // Position in the abstract global map (used to show relative "distance")
      globalX:                t.f32(),
      globalY:                t.f32(),
      // Game state for this shard
      isActive:               t.bool(),
      waveNumber:             t.u32(),
      waveName:               t.string(),
      wavePhase:              t.string(),    // 'idle' | 'combat' | 'waiting'
      nextWaveAtMicros:       t.u64(),
      // Bell state for this shard
      bellCooldownUntilMicros: t.u64(),
      // 'home' | 'hub' | 'grind' | 'dungeon'
      worldType: t.string(),
      // 0 = not a dungeon, 1–10 = dungeon floor
      dungeonLevel: t.u32(),
    }
  ),

  // Portal living in a specific world — destination resolved by type
  worldPortal: table(
    { name: 'world_portal', public: true,
      indexes: [{ accessor: 'world_portal_world_id', algorithm: 'btree', columns: ['worldId'] }] },
    {
      id:         t.u64().primaryKey().autoInc(),
      worldId:    t.u64(),    // which world this portal lives in
      portalType: t.string(), // 'to_hub' | 'to_grind' | 'to_home'
    }
  ),

  enemyAiSchedule,
  combatSchedule,
  waveSpawnSchedule,
  olthoiLayerSchedule,
  dungeonSpawnSchedule,
});
export default spacetimedb;

// ── Helpers ──────────────────────────────────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function prand(seed: bigint, salt: number): number {
  const x = Number((seed ^ (seed >> 17n) ^ BigInt(salt * 2654435761)) & 0xffffffffn);
  return (x >>> 0) / 0x100000000;
}
function prandBool(seed: bigint, salt: number, chance: number): boolean {
  return prand(seed, salt) < chance;
}
function prandInt(seed: bigint, salt: number, max: number): number {
  return Math.floor(prand(seed, salt) * max);
}

// ── Pixel art metadata helpers ───────────────────────────────────────────────────

// Forge item types per game slot (mirrors client SLOT_ITEM_TYPES)
const SLOT_TO_ITEM_TYPES: Record<string, string[]> = {
  weapon:  ['Sword', 'Axe', 'Spear', 'Dagger', 'Staff', 'Bow'],
  head:    ['Helmet'],
  chest:   ['Chestplate'],
  hands:   ['Gauntlets'],
  feet:    ['Boots', 'Leggings'],
  trinket: ['Shield'],
};

// Palette game names by forge tier (game rarity 0–5 → min(rarity,4))
const PIXEL_PALETTE_GAMES: string[][] = [
  ['My Own Summer', 'Lava-GB'],
  ['Oil 6', 'Curiosities'],
  ['Modern Interface', 'SLSO8'],
  ['Japanese Woodblock', 'NOPAL-12'],
  ['Retro 8-Bit', 'Deep Sea', 'Vinik24', 'Fantasy 24'],
];

function pickServerItemType(slot: string, seed: bigint): string {
  const types = SLOT_TO_ITEM_TYPES[slot] ?? ['Sword'];
  return types[prandInt(seed, 5, types.length)];
}

function pickServerPaletteGame(rarity: number, seed: bigint): string {
  const tier  = Math.min(rarity, 4);
  const games = PIXEL_PALETTE_GAMES[tier];
  return games[prandInt(seed, 6, games.length)];
}

// Returns (x, y) for dungeon entry portals in the hub — mirrors client grid
function hubDungeonPortalPos(level: number): [number, number] {
  const col = (level - 1) % 5;
  const row = Math.floor((level - 1) / 5);
  return [HUB_DUNGEON_X_START + col * HUB_DUNGEON_X_STEP, row === 0 ? HUB_DUNGEON_Y1 : HUB_DUNGEON_Y2];
}

// Returns the physical (x, y, range) of a portal given its type and the current world type
function getPortalPhysicalPos(portalType: string, worldType: string): [number, number, number] {
  if (portalType === 'to_hub') {
    return worldType === 'dungeon'
      ? [DUNGEON_HUB_PORTAL_X, DUNGEON_HUB_PORTAL_Y, DUNGEON_PORTAL_RANGE]
      : [PORTAL_HUB_X, PORTAL_HUB_Y, PORTAL_RANGE];
  }
  if (portalType === 'to_grind') return [PORTAL_GRIND_X, PORTAL_GRIND_Y, PORTAL_RANGE];
  if (portalType === 'to_home')  return [PORTAL_HOME_X,  PORTAL_HOME_Y,  PORTAL_RANGE];
  if (portalType.startsWith('to_dungeon_')) {
    const level = parseInt(portalType.split('_')[2], 10);
    if (worldType === 'dungeon') return [DUNGEON_EXIT_PORTAL_X, DUNGEON_EXIT_PORTAL_Y, DUNGEON_PORTAL_RANGE];
    const [px, py] = hubDungeonPortalPos(level);
    return [px, py, PORTAL_RANGE];
  }
  return [0, 0, 0];
}

function getCharMaxHp(char: any): number {
  return Math.floor((char.attrEnd + char.raisedEnd) / 2) + 10;
}

function getPlayerDamage(ctx: any, identity: any): number {
  const player = ctx.db.player.identity.find(identity);
  const char = (player && player.activeCharacterId > 0n) ? ctx.db.character.id.find(player.activeCharacterId) : undefined;
  if (!char) return PLAYER_BASE_DAMAGE;
  const bonusDmg = getGearBonus(ctx, identity, 'dm');
  return Math.floor(PLAYER_BASE_DAMAGE * (1 + bonusDmg));
}

function getGearBonus(ctx: any, identity: any, statKey: string): number {
  let bonus = 0;
  for (const it of ctx.db.item.item_owner_id.filter(identity)) {
    if (it.location !== 'equipped') continue;
    if (it.stat === statKey)      bonus += it.val;
    if (it.bonusStat === statKey) bonus += it.bonusVal;
  }
  return bonus;
}

function getArmorReduction(ctx: any, identity: any): number {
  return Math.min(0.75, getGearBonus(ctx, identity, 'ar'));
}

function getEvadeChance(char: any): number {
  const meleeDef = char.skillMeleeDef;
  return meleeDef === SKILL_SPECIALIZED ? 0.12 : meleeDef === SKILL_TRAINED ? 0.06 : 0;
}

function xpToLevel(totalXp: bigint): number {
  let level = 1, req = 100, total = 0;
  while (level < 275) {
    if (Number(totalXp) < total + req) break;
    total += req;
    req = Math.floor(req * 1.15);
    level++;
  }
  return level;
}

function attrXpCost(raised: number): number {
  return Math.floor(50 * Math.pow(1.4, raised));
}

function skillXpCostFn(raised: number, specialized: boolean): number {
  return Math.floor((specialized ? 15 : 30) * Math.pow(1.4, raised));
}

function effSkill(char: any, skillId: string): number {
  const def = SKILL_DEFS[skillId];
  if (!def) return 0;
  const attrMap: Record<string, number> = {
    STR: char.attrStr + char.raisedStr, END: char.attrEnd + char.raisedEnd,
    COORD: char.attrCoord + char.raisedCoord, QUICK: char.attrQuick + char.raisedQuick,
    FOC: char.attrFoc + char.raisedFoc, SELF: char.attrSelf + char.raisedSelf,
  };
  const base = def.attrs.reduce((s, a) => s + (attrMap[a] ?? 0), 0) / def.div;
  const skillLevelMap: Record<string, number> = {
    heavy: char.skillHeavy, light: char.skillLight, missile: char.skillMissile,
    war_magic: char.skillWarMagic, life_magic: char.skillLifeMagic, item_magic: char.skillItemMagic,
    melee_def: char.skillMeleeDef, run: char.skillRun, alchemy: char.skillAlchemy,
  };
  const raisedMap: Record<string, number> = {
    heavy: char.raisedSkillHeavy, light: char.raisedSkillLight, missile: char.raisedSkillMissile,
    war_magic: char.raisedSkillWarMagic, life_magic: char.raisedSkillLifeMagic, item_magic: char.raisedSkillItemMagic,
    melee_def: char.raisedSkillMeleeDef, run: char.raisedSkillRun, alchemy: char.raisedSkillAlchemy,
  };
  const lvl     = skillLevelMap[skillId] ?? 0;
  const raised  = raisedMap[skillId] ?? 0;
  const specBonus = lvl === SKILL_SPECIALIZED ? 10 : 0;
  return Math.floor(base) + raised + specBonus;
}

function awardXpAll(ctx: any, xp: number, worldId: bigint) {
  for (const char of ctx.db.character.iter()) {
    if (!char.deployed || char.currentWorldId !== worldId) continue;
    const hp = ctx.db.playerHealth.identity.find(char.identity);
    if (!hp || hp.currentHp === 0) continue;
    const bonus      = getGearBonus(ctx, char.identity, 'xp');
    const earned     = BigInt(Math.round(xp * (1 + bonus)));
    const newTotal   = char.totalXp + earned;
    const newUnspent = char.unspentXp + earned;
    const newLevel   = xpToLevel(newTotal);
    const newCr      = checkMilestones(newTotal, char.earnedCredits);
    ctx.db.character.id.update({
      ...char,
      totalXp: newTotal, unspentXp: newUnspent,
      level: newLevel,
      earnedCredits: char.earnedCredits + newCr,
    });
  }
}

function rollItem(seed: bigint, ownerId: any, waveNum: number, x: number, y: number, now: bigint, worldId: bigint): any {
  const slotIdx = prandInt(seed, 0, GEAR_SLOTS.length);
  const slot    = GEAR_SLOTS[slotIdx];
  const tmpls   = GEAR_TEMPLATES[slot];
  const tmpl    = tmpls[prandInt(seed, 1, tmpls.length)];
  const ti      = Math.min(waveTier(waveNum) + (prandBool(seed, 2, 0.2) ? 1 : 0), 5);
  const mult    = GEAR_TIER_MULT[ti];
  const val     = parseFloat((tmpl.base * mult).toFixed(3));

  let bonusStat = '', bonusVal = 0;
  if (ti >= 2 && prandBool(seed, 3, 0.1 + ti * 0.1)) {
    const opts = BONUS_STATS.filter(s => s !== tmpl.stat);
    const bk   = opts[prandInt(seed, 4, opts.length)];
    const bBases: Record<string, number> = { hp: 2 + ti * 2, sp: 0.01 + ti * 0.01, ar: 0.005 + ti * 0.005, as: 0.005 + ti * 0.005, xp: 0.01 + ti * 0.01 };
    bonusStat = bk; bonusVal = bBases[bk] ?? 0;
  }
  return {
    id: 0n, ownerId,
    slot, itemName: `${GEAR_TIER_NAMES[ti]} ${tmpl.name}`, icon: tmpl.icon,
    rarity: ti, stat: tmpl.stat, val, bonusStat, bonusVal,
    location: 'ground', groundX: x, groundY: y,
    worldId, expiresAtMicros: now + ITEM_GROUND_LIFETIME_US,
    itemType: pickServerItemType(slot, seed), paletteGame: pickServerPaletteGame(ti, seed),
  };
}

// Boss guaranteed armor drop — always picks head/chest/hands/feet slot
const ARMOR_SLOTS = ['head', 'chest', 'hands', 'feet'];

function rollArmorItem(seed: bigint, ownerId: any, waveNum: number, x: number, y: number, now: bigint, worldId: bigint): any {
  const slotIdx = prandInt(seed, 0, ARMOR_SLOTS.length);
  const slot    = ARMOR_SLOTS[slotIdx];
  const tmpls   = GEAR_TEMPLATES[slot];
  const tmpl    = tmpls[prandInt(seed, 1, tmpls.length)];
  const ti      = Math.min(waveTier(waveNum) + (prandBool(seed, 2, 0.3) ? 1 : 0), 5);
  const mult    = GEAR_TIER_MULT[ti];
  const val     = parseFloat((tmpl.base * mult).toFixed(3));

  let bonusStat = '', bonusVal = 0;
  if (ti >= 1 && prandBool(seed, 3, 0.2 + ti * 0.1)) {
    const opts = BONUS_STATS.filter(s => s !== tmpl.stat);
    const bk   = opts[prandInt(seed, 4, opts.length)];
    const bBases: Record<string, number> = { hp: 2 + ti * 2, sp: 0.01 + ti * 0.01, ar: 0.005 + ti * 0.005, as: 0.005 + ti * 0.005, xp: 0.01 + ti * 0.01 };
    bonusStat = bk; bonusVal = bBases[bk] ?? 0;
  }
  return {
    id: 0n, ownerId,
    slot, itemName: `${GEAR_TIER_NAMES[ti]} ${tmpl.name}`, icon: tmpl.icon,
    rarity: ti, stat: tmpl.stat, val, bonusStat, bonusVal,
    location: 'ground', groundX: x, groundY: y,
    worldId, expiresAtMicros: now + ITEM_GROUND_LIFETIME_US,
    itemType: pickServerItemType(slot, seed), paletteGame: pickServerPaletteGame(ti, seed),
  };
}

// ── Character helpers ────────────────────────────────────────────────────────────

function getActiveChar(ctx: any): any | undefined {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (!player || player.activeCharacterId === 0n) return undefined;
  return ctx.db.character.id.find(player.activeCharacterId);
}

// ── World shard helpers ──────────────────────────────────────────────────────────

// Find or create the HOME world for a player, adding HUB/GRIND portals on creation
function findOrCreateHomeWorld(ctx: any, identity: any): any {
  const existing = [...ctx.db.world.iter()].find(
    w => w.ownerIdentity.toHexString() === identity.toHexString() && w.worldType === 'home'
  );
  if (existing) return existing;

  const homeCount = [...ctx.db.world.iter()].filter(w => w.worldType === 'home').length;
  const col = homeCount % 2 === 0 ? -1 : 1;
  const row = Math.floor(homeCount / 2);
  const globalX = col * (200 + row * 150);
  const globalY = row * 100;

  const world = ctx.db.world.insert({
    id: 0n,
    ownerIdentity: identity,
    globalX, globalY,
    isActive: false,
    waveNumber: 0, waveName: '', wavePhase: 'idle',
    nextWaveAtMicros: 0n,
    bellCooldownUntilMicros: 0n,
    worldType: 'home', dungeonLevel: 0,
  });

  // Add portals pointing to the shared HUB and GRIND worlds
  ctx.db.worldPortal.insert({ id: 0n, worldId: world.id, portalType: 'to_hub' });
  ctx.db.worldPortal.insert({ id: 0n, worldId: world.id, portalType: 'to_grind' });
  return world;
}

// Deactivate a dungeon world and clean up if the departing player was the last one
function maybeDeactivateDungeon(ctx: any, dungeonWorldId: bigint, departingCharId: bigint | undefined) {
  const anyRemaining = [...ctx.db.character.iter()].some(
    (c: any) => c.id !== departingCharId && c.deployed && c.currentWorldId === dungeonWorldId
  );
  if (!anyRemaining) endRun(ctx, dungeonWorldId);
}

// End the current run in a specific world shard
function endRun(ctx: any, worldId: bigint) {
  const world = ctx.db.world.id.find(worldId);
  if (!world?.isActive) return;
  for (const e of ctx.db.enemy.iter()) {
    if (e.worldId === worldId) ctx.db.enemy.id.delete(e.id);
  }
  ctx.db.world.id.update({
    ...world, isActive: false, waveNumber: 0,
    waveName: '', wavePhase: 'idle', nextWaveAtMicros: 0n,
  });
}

function handlePlayerDeath(ctx: any, identity: any) {
  // Drop equipped and backpack items
  for (const it of ctx.db.item.item_owner_id.filter(identity)) {
    if (it.location === 'equipped' || it.location === 'backpack') {
      ctx.db.item.id.delete(it.id);
    }
  }
  const player = ctx.db.player.identity.find(identity);
  const char = (player && player.activeCharacterId > 0n)
    ? ctx.db.character.id.find(player.activeCharacterId) : undefined;
  const worldId = char?.currentWorldId ?? 0n;
  if (char) ctx.db.character.id.update({ ...char, deployed: false, currentWorldId: 0n });

  // End run if no other deployed living players remain in this world
  const anyAlive = worldId > 0n && [...ctx.db.character.iter()].some(c => {
    if (c.identity.toHexString() === identity.toHexString()) return false;
    if (!c.deployed || c.currentWorldId !== worldId) return false;
    const hp = ctx.db.playerHealth.identity.find(c.identity);
    return hp && hp.currentHp > 0;
  });
  if (!anyAlive && worldId > 0n) endRun(ctx, worldId);
}

function completedAllWaves(ctx: any, worldId: bigint) {
  for (const char of ctx.db.character.iter()) {
    if (!char.deployed || char.currentWorldId !== worldId) continue;
    completePortalExtract(ctx, char.identity, 5);
  }
  endRun(ctx, worldId);
}

function completePortalExtract(ctx: any, identity: any, tierCap: number) {
  let vaultCount = [...ctx.db.item.item_owner_id.filter(identity)]
    .filter(it => it.location === 'vault').length;

  for (const it of ctx.db.item.item_owner_id.filter(identity)) {
    if (it.location !== 'backpack') continue;
    if (it.rarity > tierCap) {
      ctx.db.item.id.delete(it.id);
    } else if (vaultCount < VAULT_MAX) {
      ctx.db.item.id.update({ ...it, location: 'vault' });
      vaultCount++;
    } else {
      ctx.db.item.id.delete(it.id);
    }
  }
  ctx.db.portalCast.identity.delete(identity);
  const player = ctx.db.player.identity.find(identity);
  const char = (player && player.activeCharacterId > 0n)
    ? ctx.db.character.id.find(player.activeCharacterId) : undefined;
  if (char) {
    const maxHp = getCharMaxHp(char);
    ctx.db.character.id.update({ ...char, deployed: false, currentWorldId: 0n });
    const hp = ctx.db.playerHealth.identity.find(identity);
    if (hp) ctx.db.playerHealth.identity.update({ ...hp, currentHp: maxHp, maxHp });
  }
}

// Spawn a single enemy into a world shard
function spawnEnemy(ctx: any, enemyType: string, x: number, y: number, worldId: bigint, hpBonus = 0,
  isBoss = false, bossLevel = -1, damage = 0) {
  const base = ENEMY_STATS[enemyType] ?? ENEMY_STATS.drudge;
  ctx.db.enemy.insert({
    id: 0n, worldId, enemyType, x, y,
    currentHp: base.hp + hpBonus, maxHp: base.hp + hpBonus,
    damage: damage > 0 ? damage : base.damage,
    isBoss, bossLevel,
    mechTimer: 0n, mechState: 'normal',
  });
}

// Spawn the floor boss into a dungeon world
function spawnDungeonBoss(ctx: any, level: number, worldId: bigint, now: bigint) {
  const bossIdx  = level - 1;
  const bd       = BOSS_DEFS[bossIdx];
  const base     = ENEMY_STATS[bd.baseType] ?? ENEMY_STATS.drudge;
  const diffMult = DUNGEON_FLOOR_DEFS[bossIdx].diffMult;
  const hp       = Math.floor(base.hp * bd.hpMult * diffMult);
  // Spawn boss near center so players encounter it during the run
  const bossX = DUNGEON_EXIT_PORTAL_X + (prand(now, 0) - 0.5) * 200;
  const bossY = DUNGEON_EXIT_PORTAL_Y + 200;
  ctx.db.enemy.insert({
    id: 0n, worldId,
    enemyType: bd.baseType,
    x: bossX, y: bossY,
    currentHp: hp, maxHp: hp,
    damage: base.damage + bd.damageBonus,
    isBoss: true, bossLevel: bossIdx,
    mechTimer: now, mechState: 'normal',
  });
}

// Find an active dungeon world at the given level, or create a fresh one
function findOrCreateDungeonWorld(ctx: any, level: number): any {
  const floor = DUNGEON_FLOOR_DEFS[level - 1];
  // Look for an existing active dungeon world at this level
  const existing = [...ctx.db.world.iter()].find(
    (w: any) => w.worldType === 'dungeon' && w.dungeonLevel === level && w.isActive
  );
  if (existing) return existing;

  // Create a fresh dungeon world
  const world = ctx.db.world.insert({
    id: 0n, ownerIdentity: ctx.sender,
    globalX: 0, globalY: 0,
    isActive: true,
    waveNumber: level, waveName: floor.name, wavePhase: 'dungeon',
    nextWaveAtMicros: 0n, bellCooldownUntilMicros: 0n,
    worldType: 'dungeon', dungeonLevel: level,
  });

  // Hub-return portal (P-key extract also works, this is for walking out)
  ctx.db.worldPortal.insert({ id: 0n, worldId: world.id, portalType: 'to_hub' });
  // Next-floor portal — locked until boss kill, gated in enter_portal reducer
  if (level < 10) {
    ctx.db.worldPortal.insert({ id: 0n, worldId: world.id, portalType: `to_dungeon_${level + 1}` });
  }

  // Spawn the boss
  const now = ctx.timestamp.microsSinceUnixEpoch;
  spawnDungeonBoss(ctx, level, world.id, now);

  // Kick off the continuous spawn scheduler
  ctx.db.dungeonSpawnSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(now + floor.spawnIntervalUs),
    worldId: world.id,
  });

  return world;
}

// Award boss kill progress to all living players in the dungeon world
function handleBossDeathProgress(ctx: any, floorLevel: number, worldId: bigint) {
  for (const pos of ctx.db.playerPosition.iter()) {
    if (pos.worldId !== worldId) continue;
    const hp = ctx.db.playerHealth.identity.find(pos.identity);
    if (!hp || hp.currentHp === 0) continue;
    const player = ctx.db.player.identity.find(pos.identity);
    if (!player || player.activeCharacterId === 0n) continue;
    const charId = player.activeCharacterId;
    const prog = ctx.db.playerProgress.characterId.find(charId);
    if (!prog) {
      ctx.db.playerProgress.insert({ characterId: charId, highestFloorCleared: floorLevel });
    } else if (floorLevel > prog.highestFloorCleared) {
      ctx.db.playerProgress.characterId.update({ ...prog, highestFloorCleared: floorLevel });
    }
  }
}

// Spawn all enemies for a named wave into a specific world shard; returns wave name
function spawnNamedWave(ctx: any, waveNum: number, worldId: bigint): string {
  const idx = Math.min(waveNum - 1, WAVE_DEFS.length - 1);
  const def = WAVE_DEFS[idx];
  const seed = BigInt(waveNum) * 999983n + worldId;
  const hpBonus = (waveNum - 1) * 5;
  for (let i = 0; i < def.count; i++) {
    const posIdx = prandInt(seed + BigInt(i), 0, SPAWN_POSITIONS.length);
    const [sx, sy] = SPAWN_POSITIONS[posIdx];
    const typeIdx  = prandInt(seed + BigInt(i), 1, def.types.length);
    spawnEnemy(ctx, def.types[typeIdx], sx + prand(seed + BigInt(i), 2) * 60 - 30,
      sy + prand(seed + BigInt(i), 3) * 60 - 30, worldId, hpBonus);
  }
  return def.name;
}


function doDeployPlayer(ctx: any, char: any) {
  const maxHp  = getCharMaxHp(char);
  const now    = ctx.timestamp.microsSinceUnixEpoch;
  const world  = findOrCreateHomeWorld(ctx, char.identity);
  const worldId = world.id;

  const pos = ctx.db.playerPosition.identity.find(char.identity);
  if (!pos) {
    ctx.db.playerPosition.insert({ identity: char.identity, worldId, x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y });
  } else {
    ctx.db.playerPosition.identity.update({ ...pos, worldId, x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y });
  }
  const hp = ctx.db.playerHealth.identity.find(char.identity);
  if (!hp) {
    ctx.db.playerHealth.insert({ identity: char.identity, currentHp: maxHp, maxHp });
  } else {
    ctx.db.playerHealth.identity.update({ ...hp, currentHp: maxHp, maxHp });
  }
  ctx.db.character.id.update({
    ...char, deployed: true, currentWorldId: worldId,
    homeWorldId: worldId, lastTokenMicros: now,
  });

  // Auto-start wave 1 the first time someone enters this home world
  const freshWorld = ctx.db.world.id.find(worldId);
  if (freshWorld && !freshWorld.isActive) {
    const waveName = spawnNamedWave(ctx, 1, worldId);
    ctx.db.world.id.update({
      ...freshWorld, isActive: true, waveNumber: 1,
      waveName, wavePhase: 'combat', nextWaveAtMicros: 0n,
      bellCooldownUntilMicros: 0n,
    });
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────────

export const init = spacetimedb.init(ctx => {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  ctx.db.enemyAiSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + AI_INTERVAL_US) });
  ctx.db.combatSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + CMB_INTERVAL_US) });

  // Create the shared HUB world (social area — 0 enemies, no bell)
  const hub = ctx.db.world.insert({
    id: 0n, ownerIdentity: ctx.sender,
    globalX: 0, globalY: -500,
    isActive: false, waveNumber: 0, waveName: '', wavePhase: 'idle',
    nextWaveAtMicros: 0n, bellCooldownUntilMicros: 0n,
    worldType: 'hub', dungeonLevel: 0,
  });
  ctx.db.worldPortal.insert({ id: 0n, worldId: hub.id, portalType: 'to_home' });
  // Dungeon entry portals in the hub — 10 floors
  for (let i = 1; i <= 10; i++) {
    ctx.db.worldPortal.insert({ id: 0n, worldId: hub.id, portalType: `to_dungeon_${i}` });
  }

  // Create the shared GRIND world (constant larva spawning)
  const grind = ctx.db.world.insert({
    id: 0n, ownerIdentity: ctx.sender,
    globalX: 0, globalY: 500,
    isActive: true, waveNumber: 0, waveName: 'The Grind', wavePhase: 'grind',
    nextWaveAtMicros: 0n, bellCooldownUntilMicros: 0n,
    worldType: 'grind', dungeonLevel: 0,
  });
  ctx.db.worldPortal.insert({ id: 0n, worldId: grind.id, portalType: 'to_home' });

  // Start ambient spawn for GRIND
  ctx.db.olthoiLayerSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(now + 3_000_000n),
    worldId: grind.id,
  });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (!existing) {
    ctx.db.player.insert({ identity: ctx.sender, username: 'Traveler', online: true, activeCharacterId: 0n });
  } else {
    ctx.db.player.identity.update({ ...existing, online: true });
  }
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player && player.activeCharacterId > 0n) {
    const char = ctx.db.character.id.find(player.activeCharacterId);
    if (char?.deployed && char.currentWorldId > 0n) {
      const maxHp = getCharMaxHp(char);
      if (!ctx.db.playerPosition.identity.find(ctx.sender))
        ctx.db.playerPosition.insert({ identity: ctx.sender, worldId: char.currentWorldId, x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y });
      if (!ctx.db.playerHealth.identity.find(ctx.sender))
        ctx.db.playerHealth.insert({ identity: ctx.sender, currentHp: maxHp, maxHp });
    }
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player) ctx.db.player.identity.update({ ...player, online: false });

  // Remove position immediately — no ghost body for disconnected players
  if (ctx.db.playerPosition.identity.find(ctx.sender)) {
    ctx.db.playerPosition.identity.delete(ctx.sender);
  }

  // Wipe the run — send back to hub on reconnect (no item loss, unlike death)
  if (player && player.activeCharacterId > 0n) {
    const char = ctx.db.character.id.find(player.activeCharacterId);
    if (char?.deployed) {
      const worldId = char.currentWorldId;
      ctx.db.character.id.update({ ...char, deployed: false, currentWorldId: 0n });
      // End the world run if this was the last player in it
      if (worldId > 0n) {
        const anyRemaining = [...ctx.db.character.iter()].some(
          c => c.id !== char.id && c.deployed && c.currentWorldId === worldId
        );
        if (!anyRemaining) endRun(ctx, worldId);
      }
    }
  }
});

// ── Character creation ────────────────────────────────────────────────────────────

export const create_character = spacetimedb.reducer(
  {
    charName: t.string(), race: t.string(),
    attrStr: t.u32(), attrEnd: t.u32(), attrCoord: t.u32(),
    attrQuick: t.u32(), attrFoc: t.u32(), attrSelf: t.u32(),
    skillHeavy: t.u32(), skillLight: t.u32(), skillMissile: t.u32(),
    skillWarMagic: t.u32(), skillLifeMagic: t.u32(), skillItemMagic: t.u32(),
    skillMeleeDef: t.u32(), skillRun: t.u32(), skillAlchemy: t.u32(),
  },
  (ctx, args) => {
    const charCount = [...ctx.db.character.character_identity.filter(ctx.sender)].length;
    if (charCount >= 3) throw new SenderError('Character limit reached (max 3)');

    const totalAttr = args.attrStr + args.attrEnd + args.attrCoord + args.attrQuick + args.attrFoc + args.attrSelf;
    if (totalAttr !== ATTR_TOTAL) throw new SenderError(`Attributes must sum to ${ATTR_TOTAL}`);
    for (const v of [args.attrStr, args.attrEnd, args.attrCoord, args.attrQuick, args.attrFoc, args.attrSelf]) {
      if (v < ATTR_MIN || v > ATTR_MAX) throw new SenderError(`Each attribute must be ${ATTR_MIN}–${ATTR_MAX}`);
    }

    const skills = [args.skillHeavy, args.skillLight, args.skillMissile, args.skillWarMagic,
      args.skillLifeMagic, args.skillItemMagic, args.skillMeleeDef, args.skillRun, args.skillAlchemy];
    const skillIds = ['heavy', 'light', 'missile', 'war_magic', 'life_magic', 'item_magic', 'melee_def', 'run', 'alchemy'];
    let usedCredits = 0, usedSpec = 0;
    for (let i = 0; i < skills.length; i++) {
      const lvl = skills[i];
      if (lvl < 0 || lvl > 2) throw new SenderError(`Invalid skill level`);
      const costs = SKILL_COSTS[skillIds[i]];
      if (costs) {
        usedCredits += lvl >= 1 ? costs[0] : 0;
        usedCredits += lvl >= 2 ? costs[1] : 0;
        if (lvl === 2) usedSpec += costs[1];
      }
    }
    if (usedCredits > SKILL_CREDITS) throw new SenderError(`Skill credits over limit (used ${usedCredits})`);
    if (usedSpec > SPEC_CAP) throw new SenderError(`Specialization credits over cap`);

    const newChar = ctx.db.character.insert({
      id: 0n,
      identity: ctx.sender,
      charName: args.charName.trim(), race: args.race,
      attrStr: args.attrStr, attrEnd: args.attrEnd, attrCoord: args.attrCoord,
      attrQuick: args.attrQuick, attrFoc: args.attrFoc, attrSelf: args.attrSelf,
      raisedStr: 0, raisedEnd: 0, raisedCoord: 0,
      raisedQuick: 0, raisedFoc: 0, raisedSelf: 0,
      skillHeavy: args.skillHeavy, skillLight: args.skillLight, skillMissile: args.skillMissile,
      skillWarMagic: args.skillWarMagic, skillLifeMagic: args.skillLifeMagic, skillItemMagic: args.skillItemMagic,
      skillMeleeDef: args.skillMeleeDef, skillRun: args.skillRun, skillAlchemy: args.skillAlchemy,
      raisedSkillHeavy: 0, raisedSkillLight: 0, raisedSkillMissile: 0,
      raisedSkillWarMagic: 0, raisedSkillLifeMagic: 0, raisedSkillItemMagic: 0,
      raisedSkillMeleeDef: 0, raisedSkillRun: 0, raisedSkillAlchemy: 0,
      level: 1, totalXp: 0n, unspentXp: 0n, tokens: 0,
      earnedCredits: 0,
      deployed: false, lastTokenMicros: 0n,
      currentWorldId: 0n,
      homeWorldId: 0n,
    });
    const p = ctx.db.player.identity.find(ctx.sender);
    if (p) ctx.db.player.identity.update({ ...p, username: args.charName.trim(), activeCharacterId: newChar.id });
  }
);

export const select_character = spacetimedb.reducer(
  { characterId: t.u64() },
  (ctx, { characterId }) => {
    const char = ctx.db.character.id.find(characterId);
    if (!char || char.identity.toHexString() !== ctx.sender.toHexString())
      throw new SenderError('Character not found');
    const player = ctx.db.player.identity.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    ctx.db.player.identity.update({ ...player, activeCharacterId: characterId });
  }
);

// ── Player reducers ───────────────────────────────────────────────────────────────

export const deploy_player = spacetimedb.reducer(ctx => {
  const char = getActiveChar(ctx);
  if (!char) throw new SenderError('Create a character first');
  doDeployPlayer(ctx, char);
});

export const move_player = spacetimedb.reducer(
  { x: t.f32(), y: t.f32() },
  (ctx, { x, y }) => {
    const hp = ctx.db.playerHealth.identity.find(ctx.sender);
    if (hp && hp.currentHp === 0) return;
    const pos = ctx.db.playerPosition.identity.find(ctx.sender);
    if (!pos) return;
    ctx.db.playerPosition.identity.update({
      ...pos,
      x: Math.max(0, Math.min(WORLD_W, x)),
      y: Math.max(0, Math.min(WORLD_H, y)),
    });
  }
);

export const logout = spacetimedb.reducer(ctx => {
  const char = getActiveChar(ctx);
  if (char?.deployed) {
    ctx.db.character.id.update({ ...char, deployed: false, currentWorldId: 0n });
  }
  if (ctx.db.playerPosition.identity.find(ctx.sender)) {
    ctx.db.playerPosition.identity.delete(ctx.sender);
  }
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player) ctx.db.player.identity.update({ ...player, online: false, activeCharacterId: 0n });
});

export const respawn_player = spacetimedb.reducer(ctx => {
  const char = getActiveChar(ctx);
  if (!char) {
    const hp = ctx.db.playerHealth.identity.find(ctx.sender);
    if (hp) ctx.db.playerHealth.identity.update({ ...hp, currentHp: hp.maxHp });
    return;
  }
  doDeployPlayer(ctx, char);
});

export const set_player_name = spacetimedb.reducer(
  { username: t.string() },
  (ctx, { username }) => {
    const p = ctx.db.player.identity.find(ctx.sender);
    if (!p) throw new SenderError('Player not found');
    ctx.db.player.identity.update({ ...p, username });
  }
);

// ── XP & progression ──────────────────────────────────────────────────────────────

export const spend_xp = spacetimedb.reducer(
  { attribute: t.string() },
  (ctx, { attribute }) => {
    const char = getActiveChar(ctx);
    if (!char) throw new SenderError('No character');
    const raisedMap: Record<string, number> = {
      STR: char.raisedStr, END: char.raisedEnd, COORD: char.raisedCoord,
      QUICK: char.raisedQuick, FOC: char.raisedFoc, SELF: char.raisedSelf,
    };
    if (!(attribute in raisedMap)) throw new SenderError(`Unknown attribute: ${attribute}`);
    const raised = raisedMap[attribute];
    const cost   = BigInt(attrXpCost(raised));
    if (char.unspentXp < cost) throw new SenderError('Not enough XP');
    const updates: any = { ...char, unspentXp: char.unspentXp - cost };
    if      (attribute === 'STR')   updates.raisedStr   = raised + 1;
    else if (attribute === 'END')   updates.raisedEnd   = raised + 1;
    else if (attribute === 'COORD') updates.raisedCoord = raised + 1;
    else if (attribute === 'QUICK') updates.raisedQuick = raised + 1;
    else if (attribute === 'FOC')   updates.raisedFoc   = raised + 1;
    else if (attribute === 'SELF')  updates.raisedSelf  = raised + 1;
    ctx.db.character.id.update(updates);
    if (attribute === 'END') {
      const newChar = ctx.db.character.id.find(char.id)!;
      const maxHp   = getCharMaxHp(newChar);
      const hp      = ctx.db.playerHealth.identity.find(ctx.sender);
      if (hp) ctx.db.playerHealth.identity.update({ ...hp, maxHp, currentHp: Math.min(hp.currentHp, maxHp) });
    }
  }
);

export const spend_skill_xp = spacetimedb.reducer(
  { skillId: t.string() },
  (ctx, { skillId }) => {
    const char = getActiveChar(ctx);
    if (!char) throw new SenderError('No character');
    const skillLevelMap: Record<string, number> = {
      heavy: char.skillHeavy, light: char.skillLight, missile: char.skillMissile,
      war_magic: char.skillWarMagic, life_magic: char.skillLifeMagic, item_magic: char.skillItemMagic,
      melee_def: char.skillMeleeDef, run: char.skillRun, alchemy: char.skillAlchemy,
    };
    const level = skillLevelMap[skillId];
    if (level === undefined) throw new SenderError(`Unknown skill: ${skillId}`);
    if (level === SKILL_UNTRAINED) throw new SenderError('Cannot raise untrained skill');
    const raisedMap: Record<string, number> = {
      heavy: char.raisedSkillHeavy, light: char.raisedSkillLight, missile: char.raisedSkillMissile,
      war_magic: char.raisedSkillWarMagic, life_magic: char.raisedSkillLifeMagic, item_magic: char.raisedSkillItemMagic,
      melee_def: char.raisedSkillMeleeDef, run: char.raisedSkillRun, alchemy: char.raisedSkillAlchemy,
    };
    const raised = raisedMap[skillId] ?? 0;
    const cost   = BigInt(skillXpCostFn(raised, level === SKILL_SPECIALIZED));
    if (char.unspentXp < cost) throw new SenderError('Not enough XP');
    const updates: any = { ...char, unspentXp: char.unspentXp - cost };
    const fieldMap: Record<string, string> = {
      heavy: 'raisedSkillHeavy', light: 'raisedSkillLight', missile: 'raisedSkillMissile',
      war_magic: 'raisedSkillWarMagic', life_magic: 'raisedSkillLifeMagic', item_magic: 'raisedSkillItemMagic',
      melee_def: 'raisedSkillMeleeDef', run: 'raisedSkillRun', alchemy: 'raisedSkillAlchemy',
    };
    updates[fieldMap[skillId]] = raised + 1;
    ctx.db.character.id.update(updates);
  }
);

export const spend_token = spacetimedb.reducer(ctx => {
  const char = getActiveChar(ctx);
  if (!char) throw new SenderError('No character');
  if (char.tokens < 1) throw new SenderError('No tokens');
  if ([...ctx.db.item.item_owner_id.filter(ctx.sender)].filter(i => i.location === 'vault').length >= VAULT_MAX)
    throw new SenderError('Vault is full');
  const now  = ctx.timestamp.microsSinceUnixEpoch;
  const seed = now ^ BigInt(char.tokens * 999983);
  const slotIdx = prandInt(seed, 0, GEAR_SLOTS.length);
  const slot    = GEAR_SLOTS[slotIdx];
  const tmpls   = GEAR_TEMPLATES[slot];
  const tmpl    = tmpls[prandInt(seed, 1, tmpls.length)];
  const ti      = prandInt(seed, 2, 3);
  const val     = parseFloat((tmpl.base * GEAR_TIER_MULT[ti]).toFixed(3));
  ctx.db.item.insert({
    id: 0n, ownerId: ctx.sender,
    slot, itemName: `${GEAR_TIER_NAMES[ti]} ${tmpl.name}`, icon: tmpl.icon,
    rarity: ti, stat: tmpl.stat, val, bonusStat: '', bonusVal: 0,
    location: 'vault', groundX: 0, groundY: 0, worldId: 0n, expiresAtMicros: 0n,
    itemType: pickServerItemType(slot, seed), paletteGame: pickServerPaletteGame(ti, seed),
  });
  ctx.db.character.id.update({ ...char, tokens: char.tokens - 1 });
});

// ── Gear management ───────────────────────────────────────────────────────────────

export const equip_item = spacetimedb.reducer(
  { itemId: t.u64() },
  (ctx, { itemId }) => {
    const it = ctx.db.item.id.find(itemId);
    if (!it || it.ownerId.toHexString() !== ctx.sender.toHexString()) throw new SenderError('Item not found');
    const cur = [...ctx.db.item.item_owner_id.filter(ctx.sender)].find(i => i.location === 'equipped' && i.slot === it.slot);
    if (cur) ctx.db.item.id.update({ ...cur, location: 'vault' });
    ctx.db.item.id.update({ ...it, location: 'equipped' });
  }
);

export const unequip_item = spacetimedb.reducer(
  { itemId: t.u64() },
  (ctx, { itemId }) => {
    const it = ctx.db.item.id.find(itemId);
    if (!it || it.ownerId.toHexString() !== ctx.sender.toHexString()) throw new SenderError('Item not found');
    ctx.db.item.id.update({ ...it, location: 'vault' });
  }
);

export const move_to_vault = spacetimedb.reducer(
  { itemId: t.u64() },
  (ctx, { itemId }) => {
    const it = ctx.db.item.id.find(itemId);
    if (!it || it.ownerId.toHexString() !== ctx.sender.toHexString()) throw new SenderError('Item not found');
    if (it.location !== 'backpack') throw new SenderError('Item not in backpack');
    const vaultCount = [...ctx.db.item.item_owner_id.filter(ctx.sender)].filter(i => i.location === 'vault').length;
    if (vaultCount >= VAULT_MAX) throw new SenderError('Vault full');
    ctx.db.item.id.update({ ...it, location: 'vault' });
  }
);

// ── Portal extraction ──────────────────────────────────────────────────────────────

export const start_portal_cast = spacetimedb.reducer(ctx => {
  const char = getActiveChar(ctx);
  if (!char?.deployed) throw new SenderError('Not deployed');
  const hp = ctx.db.playerHealth.identity.find(ctx.sender);
  if (!hp || hp.currentHp === 0) throw new SenderError('Cannot cast while dead');
  if (ctx.db.portalCast.identity.find(ctx.sender)) throw new SenderError('Already casting');
  const itemMagicLvl = char.skillItemMagic;
  const castTime     = PORTAL_CAST_TIME[itemMagicLvl] ?? PORTAL_CAST_TIME[SKILL_UNTRAINED];
  const tierCap      = PORTAL_TIER_CAP[itemMagicLvl]  ?? PORTAL_TIER_CAP[SKILL_UNTRAINED];
  const now          = ctx.timestamp.microsSinceUnixEpoch;
  ctx.db.portalCast.insert({
    identity: ctx.sender,
    startedAtMicros:   now,
    completesAtMicros: now + castTime,
    tierCap,
  });
});

export const cancel_portal_cast = spacetimedb.reducer(ctx => {
  if (ctx.db.portalCast.identity.find(ctx.sender))
    ctx.db.portalCast.identity.delete(ctx.sender);
});

// ── World portal travel ────────────────────────────────────────────────────────────

export const enter_portal = spacetimedb.reducer(
  { portalId: t.u64() },
  (ctx, { portalId }) => {
    const portal = ctx.db.worldPortal.id.find(portalId);
    if (!portal) throw new SenderError('Portal not found');

    const pos = ctx.db.playerPosition.identity.find(ctx.sender);
    if (!pos) throw new SenderError('Not deployed');

    const char = getActiveChar(ctx);
    const currentWorld = ctx.db.world.id.find(pos.worldId);
    const currentWorldType = currentWorld?.worldType ?? 'home';

    // ── Unified range check (works for all portal types) ─────────────────────
    const [prtX, prtY, prtRange] = getPortalPhysicalPos(portal.portalType, currentWorldType);
    if (dist(pos.x, pos.y, prtX, prtY) > prtRange)
      throw new SenderError('Too far from portal');

    // ── Dungeon portals (to_dungeon_N) ────────────────────────────────────────
    if (portal.portalType.startsWith('to_dungeon_')) {
      const level = parseInt(portal.portalType.split('_')[2], 10);
      if (isNaN(level) || level < 1 || level > 10) throw new SenderError('Invalid dungeon level');

      // Progress gate: floor 1 is always open; higher floors require prior boss kill
      if (level > 1 && char) {
        const prog = ctx.db.playerProgress.characterId.find(char.id);
        if (level > (prog?.highestFloorCleared ?? 0) + 1)
          throw new SenderError('Defeat the previous floor boss first');
      }

      // In-dungeon next-floor portal: must have cleared this floor's boss first
      if (currentWorldType === 'dungeon' && char) {
        const prog = ctx.db.playerProgress.characterId.find(char.id);
        if ((prog?.highestFloorCleared ?? 0) < (currentWorld?.dungeonLevel ?? 0))
          throw new SenderError("Defeat this floor's boss first");
      }

      const oldWorldId = pos.worldId;
      const dungeonWorld = findOrCreateDungeonWorld(ctx, level);

      // Init HP for characters that have never deployed (entering dungeon directly from hub UI)
      if (char) {
        const maxHp = getCharMaxHp(char);
        const hp = ctx.db.playerHealth.identity.find(ctx.sender);
        if (!hp) ctx.db.playerHealth.insert({ identity: ctx.sender, currentHp: maxHp, maxHp });
      }

      ctx.db.playerPosition.identity.update({
        ...pos, worldId: dungeonWorld.id, x: DUNGEON_PLAYER_SPAWN_X, y: DUNGEON_PLAYER_SPAWN_Y,
      });
      if (ctx.db.portalCast.identity.find(ctx.sender))
        ctx.db.portalCast.identity.delete(ctx.sender);
      if (char) ctx.db.character.id.update({ ...char, deployed: true, currentWorldId: dungeonWorld.id });

      // Clean up the old dungeon world if this player was the last one in it
      if (currentWorldType === 'dungeon') maybeDeactivateDungeon(ctx, oldWorldId, char?.id);
      return;
    }

    // ── Standard portals (to_hub, to_grind, to_home) ─────────────────────────
    let arriveX: number, arriveY: number, destWorldId: bigint;

    if (portal.portalType === 'to_hub') {
      arriveX = PORTAL_HOME_X; arriveY = PORTAL_HOME_Y + 150;
      const hub = [...ctx.db.world.iter()].find((w: any) => w.worldType === 'hub');
      if (!hub) throw new SenderError('Hub world not found');
      destWorldId = hub.id;
    } else if (portal.portalType === 'to_grind') {
      arriveX = PORTAL_HOME_X; arriveY = PORTAL_HOME_Y + 150;
      const grind = [...ctx.db.world.iter()].find((w: any) => w.worldType === 'grind');
      if (!grind) throw new SenderError('Grind world not found');
      destWorldId = grind.id;
    } else {
      // to_home
      arriveX = PLAYER_SPAWN_X; arriveY = PLAYER_SPAWN_Y;
      if (!char) throw new SenderError('No character');
      destWorldId = char.homeWorldId > 0n
        ? char.homeWorldId
        : findOrCreateHomeWorld(ctx, ctx.sender).id;
    }

    const oldWorldId = pos.worldId;
    ctx.db.playerPosition.identity.update({ ...pos, worldId: destWorldId, x: arriveX, y: arriveY });
    if (ctx.db.portalCast.identity.find(ctx.sender))
      ctx.db.portalCast.identity.delete(ctx.sender);
    if (char) ctx.db.character.id.update({ ...char, currentWorldId: destWorldId });

    // Clean up dungeon world if this player was the last one in it
    if (currentWorldType === 'dungeon') maybeDeactivateDungeon(ctx, oldWorldId, char?.id);
  }
);

// Direct dungeon entry reducer — called from hub UI buttons
export const enter_dungeon = spacetimedb.reducer(
  { level: t.u32() },
  (ctx, { level }) => {
    if (level < 1 || level > 10) throw new SenderError('Invalid dungeon level');
    const char = getActiveChar(ctx);
    if (!char) throw new SenderError('No active character');

    // Floor progress gate
    if (level > 1) {
      const prog = ctx.db.playerProgress.characterId.find(char.id);
      if (level > (prog?.highestFloorCleared ?? 0) + 1)
        throw new SenderError('Defeat the previous floor boss first');
    }

    const now = ctx.timestamp.microsSinceUnixEpoch;
    const dungeonWorld = findOrCreateDungeonWorld(ctx, level);
    const maxHp = getCharMaxHp(char);

    // Initialize position (create if this character has never deployed)
    const pos = ctx.db.playerPosition.identity.find(ctx.sender);
    if (!pos) {
      ctx.db.playerPosition.insert({
        identity: ctx.sender, worldId: dungeonWorld.id,
        x: DUNGEON_PLAYER_SPAWN_X, y: DUNGEON_PLAYER_SPAWN_Y,
      });
    } else {
      ctx.db.playerPosition.identity.update({
        ...pos, worldId: dungeonWorld.id,
        x: DUNGEON_PLAYER_SPAWN_X, y: DUNGEON_PLAYER_SPAWN_Y,
      });
    }

    // Initialize health (create if this character has never deployed)
    const hp = ctx.db.playerHealth.identity.find(ctx.sender);
    if (!hp) {
      ctx.db.playerHealth.insert({ identity: ctx.sender, currentHp: maxHp, maxHp });
    } else {
      ctx.db.playerHealth.identity.update({ ...hp, currentHp: maxHp, maxHp });
    }

    if (ctx.db.portalCast.identity.find(ctx.sender))
      ctx.db.portalCast.identity.delete(ctx.sender);
    ctx.db.character.id.update({ ...char, deployed: true, currentWorldId: dungeonWorld.id, lastTokenMicros: now });
  }
);

// ── Scheduled: Wave spawn ─────────────────────────────────────────────────────────

export const wave_spawn = spacetimedb.reducer(
  { arg: waveSpawnSchedule.rowType },
  (ctx, { arg }) => {
    const world = ctx.db.world.id.find(arg.worldId);
    if (!world?.isActive || world.wavePhase !== 'waiting') return;
    const waveNum  = world.waveNumber + 1;
    const waveName = spawnNamedWave(ctx, waveNum, world.id);
    ctx.db.world.id.update({
      ...world, waveNumber: waveNum, waveName, wavePhase: 'combat', nextWaveAtMicros: 0n,
    });
  }
);

// ── Scheduled: Enemy AI tick ───────────────────────────────────────────────────────

export const run_enemy_ai = spacetimedb.reducer(
  { arg: enemyAiSchedule.rowType },
  (ctx, _args) => {
    const now = ctx.timestamp.microsSinceUnixEpoch;

    for (const enemy of ctx.db.enemy.iter()) {
      let nearestDist = Infinity, nearestX = 0, nearestY = 0, found = false;
      for (const pos of ctx.db.playerPosition.iter()) {
        if (pos.worldId !== enemy.worldId) continue;
        const p = ctx.db.player.identity.find(pos.identity);
        if (!p?.online) continue;
        const hp = ctx.db.playerHealth.identity.find(pos.identity);
        if (hp && hp.currentHp === 0) continue;
        const d = dist(enemy.x, enemy.y, pos.x, pos.y);
        if (d < nearestDist) { nearestDist = d; nearestX = pos.x; nearestY = pos.y; found = true; }
      }

      // ── Boss mechanics ──────────────────────────────────────────────────────
      if (enemy.isBoss && enemy.bossLevel >= 0) {
        const bd      = BOSS_DEFS[enemy.bossLevel];
        const mech    = bd.mechanic;
        const elapsed = now - enemy.mechTimer;
        let updates: any = { ...enemy };

        if (mech === 'enrage' && updates.mechState !== 'enraged' && enemy.currentHp < enemy.maxHp / 2) {
          updates.mechState = 'enraged';
          updates.mechTimer = now;
          // Speed boost encoded by storing mechState; movement below checks it
        }

        if (mech === 'blink' && elapsed > 5_000_000n && found) {
          // Teleport near a random player
          updates.x = nearestX + (prand(now, 1) - 0.5) * 300;
          updates.y = nearestY + (prand(now, 2) - 0.5) * 300;
          updates.mechTimer = now;
        }

        if (mech === 'warcry' && elapsed > 5_000_000n) {
          // Give nearby non-boss enemies a temporary speed flag via mechState = 'buffed'
          // We can't store per-enemy buffs, so we approximate: directly move them faster this tick
          for (const other of ctx.db.enemy.enemy_world_id.filter(enemy.worldId)) {
            if (other.isBoss || other.id === enemy.id) continue;
            if (dist(other.x, other.y, enemy.x, enemy.y) > 150) continue;
            ctx.db.enemy.id.update({ ...other, mechState: 'warcry_buffed', mechTimer: now });
          }
          updates.mechTimer = now;
        }

        if (mech === 'spawn' && elapsed > 5_000_000n) {
          const world = ctx.db.world.id.find(enemy.worldId);
          const level = world?.dungeonLevel ?? 1;
          const diff  = DUNGEON_FLOOR_DEFS[level - 1]?.diffMult ?? 1;
          for (let si = 0; si < 2; si++) {
            const sa = (prand(now, si) * Math.PI * 2);
            spawnEnemy(ctx, 'olthoi',
              enemy.x + Math.cos(sa) * 40, enemy.y + Math.sin(sa) * 40,
              enemy.worldId, Math.floor(diff * 5)
            );
          }
          updates.mechTimer = now;
        }

        if (mech === 'phase') {
          if (updates.mechState === 'phaseImmune' && elapsed > 2_000_000n) {
            updates.mechState = 'normal';
            updates.mechTimer = now;
          } else if (updates.mechState !== 'phaseImmune' && elapsed > 6_000_000n) {
            updates.mechState = 'phaseImmune';
            updates.mechTimer = now;
          }
        }

        if (mech === 'mirror' && elapsed > 8_000_000n) {
          for (let mi = 0; mi < 2; mi++) {
            const ma = prand(now, mi) * Math.PI * 2;
            ctx.db.enemy.insert({
              id: 0n, worldId: enemy.worldId,
              enemyType: enemy.enemyType,
              x: enemy.x + Math.cos(ma) * 60, y: enemy.y + Math.sin(ma) * 60,
              currentHp: 1, maxHp: 1, damage: 1,
              isBoss: false, bossLevel: -1, mechTimer: 0n, mechState: 'decoy',
            });
          }
          updates.mechTimer = now;
        }

        if (mech === 'charge') {
          if (updates.mechState === 'charging' && elapsed > 1_000_000n) {
            updates.mechState = 'normal';
            updates.mechTimer = now;
          } else if (updates.mechState !== 'charging' && elapsed > 5_000_000n) {
            updates.mechState = 'charging';
            updates.mechTimer = now;
          }
        }

        // Bael'Zharon regen (nova mechanic)
        if (mech === 'nova') {
          const regenHp = Math.floor(enemy.maxHp * 0.001);
          if (regenHp > 0 && enemy.currentHp < enemy.maxHp) {
            updates.currentHp = Math.min(enemy.maxHp, enemy.currentHp + regenHp);
          }
        }

        ctx.db.enemy.id.update(updates);
        // Re-read updated enemy for movement
        const refreshed = ctx.db.enemy.id.find(enemy.id);
        if (!refreshed) continue;
        // Phase immune: skip movement this tick
        if (refreshed.mechState === 'phaseImmune') continue;
        // Movement with mechanic modifiers
        if (found && nearestDist > ENEMY_ATTACK_RANGE) {
          let spd = (ENEMY_STATS[refreshed.enemyType] ?? ENEMY_STATS.drudge).speed * bd.spMult;
          if (refreshed.mechState === 'enraged') spd *= 2;
          if (refreshed.mechState === 'charging') spd *= 3;
          const dx = nearestX - refreshed.x, dy = nearestY - refreshed.y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          ctx.db.enemy.id.update({
            ...refreshed,
            x: Math.max(0, Math.min(WORLD_W, refreshed.x + (dx / d) * spd)),
            y: Math.max(0, Math.min(WORLD_H, refreshed.y + (dy / d) * spd)),
          });
        }
        continue; // skip standard movement block
      }

      // ── Regular enemy movement ──────────────────────────────────────────────
      if (found && nearestDist > ENEMY_ATTACK_RANGE) {
        let spd = (ENEMY_STATS[enemy.enemyType] ?? ENEMY_STATS.drudge).speed;
        // Warcry buff — move faster for one tick
        if (enemy.mechState === 'warcry_buffed') spd *= 1.3;
        // Frenzy aura — check if a Pandemonium boss is nearby
        for (const boss of ctx.db.enemy.enemy_world_id.filter(enemy.worldId)) {
          if (!boss.isBoss || boss.bossLevel < 0) continue;
          if (BOSS_DEFS[boss.bossLevel]?.mechanic !== 'frenzy') continue;
          if (dist(boss.x, boss.y, enemy.x, enemy.y) < 100) { spd *= 1.5; break; }
        }
        const dx = nearestX - enemy.x, dy = nearestY - enemy.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        ctx.db.enemy.id.update({
          ...enemy,
          x: Math.max(0, Math.min(WORLD_W, enemy.x + (dx / d) * spd)),
          y: Math.max(0, Math.min(WORLD_H, enemy.y + (dy / d) * spd)),
        });
      }
    }

    // Ground item expiry and auto-pickup (scoped by worldId)
    for (const it of ctx.db.item.iter()) {
      if (it.location !== 'ground') continue;
      if (it.expiresAtMicros > 0n && now > it.expiresAtMicros) {
        ctx.db.item.id.delete(it.id);
        continue;
      }
      for (const pos of ctx.db.playerPosition.iter()) {
        if (pos.worldId !== it.worldId) continue;
        const p = ctx.db.player.identity.find(pos.identity);
        if (!p?.online) continue;
        const hp = ctx.db.playerHealth.identity.find(pos.identity);
        if (!hp || hp.currentHp === 0) continue;
        if (dist(it.groundX, it.groundY, pos.x, pos.y) > 55) continue;

        const bpCount = [...ctx.db.item.item_owner_id.filter(pos.identity)]
          .filter(x => x.location === 'backpack').length;
        if (bpCount >= BACKPACK_MAX) continue;

        const cur = [...ctx.db.item.item_owner_id.filter(pos.identity)]
          .find(x => x.location === 'equipped' && x.slot === it.slot);
        const shouldEquip = !cur || it.rarity > cur.rarity ||
          (it.rarity === cur.rarity && it.val > cur.val);

        if (shouldEquip) {
          if (cur) ctx.db.item.id.update({ ...cur, location: 'backpack' });
          ctx.db.item.id.update({ ...it, ownerId: pos.identity, location: 'equipped', expiresAtMicros: 0n, worldId: 0n });
        } else {
          ctx.db.item.id.update({ ...it, ownerId: pos.identity, location: 'backpack', expiresAtMicros: 0n, worldId: 0n });
        }
        break;
      }
    }

    ctx.db.enemyAiSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + AI_INTERVAL_US) });
  }
);

// ── Scheduled: Combat tick ─────────────────────────────────────────────────────────

export const run_combat_tick = spacetimedb.reducer(
  { arg: combatSchedule.rowType },
  (ctx, _args) => {
    const now = ctx.timestamp.microsSinceUnixEpoch;

    // Portal cast completions
    for (const cast of ctx.db.portalCast.iter()) {
      if (now >= cast.completesAtMicros) {
        completePortalExtract(ctx, cast.identity, cast.tierCap);
      }
    }

    // Token awards
    for (const char of ctx.db.character.iter()) {
      if (!char.deployed) continue;
      const hp = ctx.db.playerHealth.identity.find(char.identity);
      if (!hp || hp.currentHp === 0) continue;
      if (char.lastTokenMicros > 0n && (now - char.lastTokenMicros) >= TOKEN_INTERVAL_US) {
        ctx.db.character.id.update({ ...char, tokens: char.tokens + 1, lastTokenMicros: now });
      }
    }

    // Player auto-attacks — scoped to same world shard as enemies
    const enemyDamage = new Map<bigint, number>();
    for (const pos of ctx.db.playerPosition.iter()) {
      const p = ctx.db.player.identity.find(pos.identity);
      if (!p?.online) continue;
      const hp = ctx.db.playerHealth.identity.find(pos.identity);
      if (hp && hp.currentHp === 0) continue;

      const dmg = getPlayerDamage(ctx, pos.identity);
      let nearestDist = PLAYER_ATTACK_RANGE, nearestId: bigint | null = null;
      for (const enemy of ctx.db.enemy.iter()) {
        if (enemy.worldId !== pos.worldId) continue;   // same world only
        const d = dist(pos.x, pos.y, enemy.x, enemy.y);
        if (d < nearestDist) { nearestDist = d; nearestId = enemy.id; }
      }
      if (nearestId !== null) {
        enemyDamage.set(nearestId, (enemyDamage.get(nearestId) ?? 0) + dmg);
      }
    }

    for (const [id, dmg] of enemyDamage) {
      const enemy = ctx.db.enemy.id.find(id);
      if (!enemy) continue;
      // Phase-immune bosses take no damage
      if (enemy.isBoss && enemy.mechState === 'phaseImmune') continue;
      const newHp = enemy.currentHp > dmg ? enemy.currentHp - Math.floor(dmg) : 0;
      if (newHp === 0) {
        const stats   = ENEMY_STATS[enemy.enemyType] ?? ENEMY_STATS.drudge;
        const seed    = now + enemy.id;
        const world   = ctx.db.world.id.find(enemy.worldId);
        const waveNum = world?.waveNumber ?? 1;

        if (enemy.isBoss && enemy.bossLevel >= 0) {
          // Boss guaranteed loot drop
          const bd       = BOSS_DEFS[enemy.bossLevel];
          const bossXp   = Math.round(stats.xp * bd.xpMult);
          awardXpAll(ctx, bossXp, enemy.worldId);
          // Boss always drops an armor piece at its tier
          ctx.db.item.insert(rollArmorItem(seed, ctx.sender, bd.dropTier * 2, enemy.x, enemy.y, now, enemy.worldId));
          // Bael'Zharon bonus T6 armor drop (30%)
          if (bd.mechanic === 'nova' && prandBool(seed, 99, 0.3)) {
            ctx.db.item.insert(rollArmorItem(seed + 1n, ctx.sender, 11, enemy.x + 30, enemy.y + 30, now, enemy.worldId));
          }
          // Award floor progress to all living players in this world
          if (world?.worldType === 'dungeon') {
            handleBossDeathProgress(ctx, world.dungeonLevel, enemy.worldId);
            // Schedule boss respawn in 60 seconds
            const freshWorld = ctx.db.world.id.find(enemy.worldId);
            if (freshWorld) {
              ctx.db.world.id.update({ ...freshWorld, nextWaveAtMicros: now + 60_000_000n });
            }
          }
        } else {
          // Regular enemy drop
          if (prandBool(seed, 5, stats.dropChance)) {
            ctx.db.item.insert(rollItem(seed, ctx.sender, waveNum, enemy.x, enemy.y, now, enemy.worldId));
          }
          awardXpAll(ctx, stats.xp, enemy.worldId);
        }
        ctx.db.enemy.id.delete(id);
      } else {
        ctx.db.enemy.id.update({ ...enemy, currentHp: newHp });
      }
    }

    // ── Boss AoE mechanics: pound and nova damage players ─────────────────────
    for (const enemy of ctx.db.enemy.iter()) {
      if (!enemy.isBoss || enemy.bossLevel < 0) continue;
      const bd      = BOSS_DEFS[enemy.bossLevel];
      const elapsed = now - enemy.mechTimer;

      if (bd.mechanic === 'pound' && elapsed > 4_000_000n) {
        const aoeRange = 80;
        for (const pos of ctx.db.playerPosition.iter()) {
          if (pos.worldId !== enemy.worldId) continue;
          if (dist(pos.x, pos.y, enemy.x, enemy.y) > aoeRange) continue;
          const hp = ctx.db.playerHealth.identity.find(pos.identity);
          if (!hp || hp.currentHp === 0) continue;
          const char = (() => { const p = ctx.db.player.identity.find(pos.identity); return p && p.activeCharacterId > 0n ? ctx.db.character.id.find(p.activeCharacterId) : undefined; })();
          const armor  = char ? getArmorReduction(ctx, pos.identity) : 0;
          const dmg    = Math.ceil((6 + (enemy.bossLevel + 1) * 1.5) * (1 - armor));
          const newHp  = hp.currentHp > dmg ? hp.currentHp - dmg : 0;
          ctx.db.playerHealth.identity.update({ ...hp, currentHp: newHp });
          if (ctx.db.portalCast.identity.find(pos.identity))
            ctx.db.portalCast.identity.delete(pos.identity);
          if (newHp === 0) handlePlayerDeath(ctx, pos.identity);
        }
        ctx.db.enemy.id.update({ ...enemy, mechTimer: now });
      }

      if (bd.mechanic === 'nova' && elapsed > 8_000_000n) {
        const aoeRange = 120;
        for (const pos of ctx.db.playerPosition.iter()) {
          if (pos.worldId !== enemy.worldId) continue;
          if (dist(pos.x, pos.y, enemy.x, enemy.y) > aoeRange) continue;
          const hp = ctx.db.playerHealth.identity.find(pos.identity);
          if (!hp || hp.currentHp === 0) continue;
          const char = (() => { const p = ctx.db.player.identity.find(pos.identity); return p && p.activeCharacterId > 0n ? ctx.db.character.id.find(p.activeCharacterId) : undefined; })();
          const armor = char ? getArmorReduction(ctx, pos.identity) : 0;
          const dmg   = Math.ceil((8 + (enemy.bossLevel + 1) * 2) * (1 - armor));
          const newHp = hp.currentHp > dmg ? hp.currentHp - dmg : 0;
          ctx.db.playerHealth.identity.update({ ...hp, currentHp: newHp });
          if (ctx.db.portalCast.identity.find(pos.identity))
            ctx.db.portalCast.identity.delete(pos.identity);
          if (newHp === 0) handlePlayerDeath(ctx, pos.identity);
        }
        ctx.db.enemy.id.update({ ...enemy, mechTimer: now });
      }
    }

    // Wave completion check — per world shard
    for (const world of ctx.db.world.iter()) {
      if (!world.isActive || world.wavePhase !== 'combat') continue;
      const enemyCount = [...ctx.db.enemy.iter()].filter(e => e.worldId === world.id).length;
      if (enemyCount === 0) {
        if (world.waveNumber >= TOTAL_WAVES) {
          completedAllWaves(ctx, world.id);
        } else {
          const nextAt = now + INTER_WAVE_US;
          ctx.db.world.id.update({ ...world, wavePhase: 'waiting', nextWaveAtMicros: nextAt });
          ctx.db.waveSpawnSchedule.insert({
            scheduledId: 0n,
            scheduledAt: ScheduleAt.time(nextAt),
            worldId: world.id,
          });
        }
      }
    }

    // Enemies attack players — scoped to same world shard
    const playerDamage = new Map<string, number>();
    for (const enemy of ctx.db.enemy.iter()) {
      for (const pos of ctx.db.playerPosition.iter()) {
        if (pos.worldId !== enemy.worldId) continue;   // same world only
        const hp = ctx.db.playerHealth.identity.find(pos.identity);
        if (!hp || hp.currentHp === 0) continue;
        if (dist(enemy.x, enemy.y, pos.x, pos.y) >= ENEMY_ATTACK_RANGE) continue;
        const key = pos.identity.toHexString();
        playerDamage.set(key, (playerDamage.get(key) ?? 0) + enemy.damage);
      }
    }

    for (const [hex, rawDmg] of playerDamage) {
      for (const hp of ctx.db.playerHealth.iter()) {
        if (hp.identity.toHexString() !== hex) continue;
        const playerRec = ctx.db.player.identity.find(hp.identity);
        const char = (playerRec && playerRec.activeCharacterId > 0n) ? ctx.db.character.id.find(playerRec.activeCharacterId) : undefined;
        if (char && prandBool(now + BigInt(hex.charCodeAt(0) * 999), 7, getEvadeChance(char))) break;

        const armor = getArmorReduction(ctx, hp.identity);
        const dmg   = Math.ceil(rawDmg * (1 - armor));
        const newHp = hp.currentHp > dmg ? hp.currentHp - dmg : 0;
        ctx.db.playerHealth.identity.update({ ...hp, currentHp: newHp });

        if (ctx.db.portalCast.identity.find(hp.identity))
          ctx.db.portalCast.identity.delete(hp.identity);

        if (newHp === 0) handlePlayerDeath(ctx, hp.identity);
        break;
      }
    }

    ctx.db.combatSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(now + CMB_INTERVAL_US) });
  }
);

// ── Dungeon continuous spawn ──────────────────────────────────────────────────────

export const dungeon_spawn_tick = spacetimedb.reducer(
  { arg: dungeonSpawnSchedule.rowType },
  (ctx, { arg }) => {
    const worldId = arg.worldId;
    const world   = ctx.db.world.id.find(worldId);
    if (!world || world.worldType !== 'dungeon' || !world.isActive) return;

    const now      = ctx.timestamp.microsSinceUnixEpoch;
    const level    = world.dungeonLevel;
    const floor    = DUNGEON_FLOOR_DEFS[level - 1];
    const diff     = floor.diffMult;
    const hpBonus  = Math.floor((level - 1) * 8 * diff);

    // Respawn boss every 60 seconds after it dies (nextWaveAtMicros tracks the respawn time)
    const allEnemies = [...ctx.db.enemy.enemy_world_id.filter(worldId)];
    const bossAlive  = allEnemies.some((e: any) => e.isBoss);
    if (!bossAlive && world.nextWaveAtMicros > 0n && now >= world.nextWaveAtMicros) {
      spawnDungeonBoss(ctx, level, worldId, now);
      ctx.db.world.id.update({ ...world, nextWaveAtMicros: 0n });
    }

    // Count non-boss enemies alive; don't exceed cap
    const current = allEnemies.filter((e: any) => !e.isBoss).length;
    const toSpawn = Math.max(0, Math.min(3, floor.cap - current));

    for (let i = 0; i < toSpawn; i++) {
      const seed   = now + BigInt(i * 31337) + worldId;
      const posIdx = prandInt(seed, i * 3, SPAWN_POSITIONS.length);
      const [sx, sy] = SPAWN_POSITIONS[posIdx];
      const typeIdx  = prandInt(seed, i * 3 + 1, floor.types.length);
      const type     = floor.types[typeIdx];
      spawnEnemy(ctx, type,
        sx + (prand(seed, i * 3 + 2) - 0.5) * 80,
        sy + (prand(seed, i * 3 + 3) - 0.5) * 80,
        worldId, hpBonus
      );
    }

    // Reschedule
    ctx.db.dungeonSpawnSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(now + floor.spawnIntervalUs),
      worldId,
    });
  }
);

// ── OlthoiLayer ambient spawn ─────────────────────────────────────────────────────

const LARVA_CAP         = 20;  // max larvae alive at once
const LARVA_BATCH       = 3;   // spawn up to this many per tick
const OLTHOI_TICK_US    = 6_000_000n; // 6 seconds between top-ups

export const olthoi_layer_tick = spacetimedb.reducer(
  { arg: olthoiLayerSchedule.rowType },
  (ctx, { arg }) => {
    const worldId = arg.worldId;
    const world   = ctx.db.world.id.find(worldId);
    if (!world || world.worldType !== 'grind') return;

    const now     = ctx.timestamp.microsSinceUnixEpoch;
    const current = [...ctx.db.enemy.iter()].filter(e => e.worldId === worldId).length;
    const toSpawn = Math.min(LARVA_BATCH, LARVA_CAP - current);

    for (let i = 0; i < toSpawn; i++) {
      const pos = SPAWN_POSITIONS[prandInt(now, i * 17 + current, SPAWN_POSITIONS.length)];
      spawnEnemy(ctx, 'larva', pos[0], pos[1], worldId, 0);
    }

    // Reschedule next tick
    ctx.db.olthoiLayerSchedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(now + OLTHOI_TICK_US),
      worldId,
    });
  }
);
