import Phaser from 'phaser';
import { BottomHud } from '../../ui/BottomHud';
import { VirtualJoystick } from '../../ui/VirtualJoystick';
import { MobileActions } from '../../ui/MobileActions';
import {
  bakePlayerTexture, bakeGroundItemTexture,
  equippedHash, getFrameIndex, EquippedPxItem, FRAME_WIDTH,
} from '../gear/phaser-sprites';
import { getFacing } from '../gear/sprite-system';
import {
  WeaponCategory, getWeaponCategory, isRanged,
  TRAVEL_MS, IMPACT_COLORS, projKey, bakeProjectileTextures,
} from '../gear/projectile-sprites';
import {
  bakeAllEnemyTextures, getEnemyFrameIndex, ENEMY_FRAME_SIZE,
} from '../enemies/enemy-textures';
import { BossRenderer } from '../enemies/boss-renderer';
import {
  playHit, playKill, playLevelUp, playLootDrop,
  playWaveStart, playBossEnter, playBossDeath, playPlayerDeath,
  playPortalStart, playPortalTravel, playWaveCleared,
} from '../audio/SoundSystem';

const WORLD_WIDTH  = 2400;
const WORLD_HEIGHT = 2400;
const MOVE_SPEED   = 200;
const SEND_INTERVAL = 50;

// Portal positions: HOME world has HUB (left) + GRIND (right); HUB/GRIND have HOME (center)
const PORTAL_HUB_X   = 1050;  const PORTAL_HUB_Y   = 1350;
const PORTAL_GRIND_X = 1350;  const PORTAL_GRIND_Y = 1350;
const PORTAL_HOME_X  = 1200;  const PORTAL_HOME_Y  = 1200;
const WORLD_PORTAL_RANGE = 70;

// Dungeon portal positions — must mirror server constants
const DUNGEON_EXIT_PORTAL_X  = 1200;
const DUNGEON_EXIT_PORTAL_Y  = 300;
const DUNGEON_HUB_PORTAL_X   = 1200;
const DUNGEON_HUB_PORTAL_Y   = 1500;
const HUB_DUNGEON_X_START    = 800;
const HUB_DUNGEON_X_STEP     = 150;
const HUB_DUNGEON_Y1         = 900;   // floors 1–5
const HUB_DUNGEON_Y2         = 700;   // floors 6–10

// Race colors for player circle
const RACE_COLORS: Record<string, number> = {
  aluvian:    0xddc080,
  gharundim:  0x8888dd,
  sho:        0x80cc80,
  viamontian: 0xcc6666,
  umbraen:    0xaa88cc,
};
const RACE_INNER: Record<string, number> = {
  aluvian:    0xddc080,
  gharundim:  0xc4a060,
  sho:        0xccb888,
  viamontian: 0xd4b898,
  umbraen:    0x9988aa,
};

// Enemy colors, letters, and XP (matching server ENEMY_STATS)
const ENEMY_TYPE_DATA: Record<string, { color: number; letter: string; size: number; xp: number }> = {
  drudge:     { color: 0x8a7a5a, letter: 'D', size: 12, xp: 5  },
  olthoi:     { color: 0x3a6a3a, letter: 'O', size: 18, xp: 12 },
  shadow:     { color: 0x6a4a8a, letter: 'S', size: 14, xp: 8  },
  tusker:     { color: 0x8a6a5a, letter: 'T', size: 22, xp: 18 },
  virindi:    { color: 0x6a3a8a, letter: 'V', size: 15, xp: 15 },
  banderling: { color: 0x6a7a4a, letter: 'B', size: 20, xp: 10 },
  larva:      { color: 0x4a8a3a, letter: 'l', size: 7,  xp: 1  },
  unicorn:    { color: 0xdd60a8, letter: 'U', size: 16, xp: 20 },
  hydra:      { color: 0x2a5a2a, letter: 'H', size: 32, xp: 30 },
};

const BOSS_NAMES = [
  'Bloody Bones', 'The Whisperer', 'Grunter the Brute', 'Brood Mother',
  'Martine the Mad', 'Torgluuk', 'The Hollow One', 'Pandemonium',
  'Olthoi Eviscerator', "Bael'Zharon",
];

const RARITY_HEX_CSS = ['#888888', '#4a8a4a', '#4488ee', '#aa44ee', '#ee9922', '#ffd700'];

// 6-tier rarity colors
const RARITY_COLORS = [0x7a7a7a, 0x2aaa2a, 0x4488ee, 0xaa44ee, 0xee9922, 0xffd700];

interface FloatingBar    { bg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; }
interface EnemyEntry    {
  body: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text; hp: FloatingBar;
  type: string; isBoss: boolean;
  bossAura?: Phaser.GameObjects.Arc; bossNameTag?: Phaser.GameObjects.Text;
  // Pixel art sprite
  sprite?: Phaser.GameObjects.Image;
  spriteDir: string; spriteFrame: number; spriteFrameTimer: number;
  // Dynamic canvas renderer for boss animations (hydra etc.)
  bossRenderer?: BossRenderer;
}
interface PlayerEntry   {
  body: Phaser.GameObjects.Arc; inner: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text; hp: FloatingBar;
  // Pixel art sprite (present when pixel art mode is on)
  sprite?: Phaser.GameObjects.Image;
  spriteKey?: string;      // current baked texture key
  spriteDir: string;       // facing direction
  spriteFrame: number;     // animation frame 0 or 1
  spriteFrameTimer: number; // ms accumulator for frame cycling
}
interface GroundItemEntry {
  glow: Phaser.GameObjects.Arc; ring: Phaser.GameObjects.Arc; icon: Phaser.GameObjects.Text;
  cardSprite?: Phaser.GameObjects.Image; // pixel art card (present when texture exists)
}
interface WorldPortalEntry { ring1: Phaser.GameObjects.Arc; ring2: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text; prompt: Phaser.GameObjects.Text; }

export class GameScene extends Phaser.Scene {
  private players     = new Map<string, PlayerEntry>();
  private enemies     = new Map<string, EnemyEntry>();
  private groundItems = new Map<string, GroundItemEntry>();
  private worldPortals = new Map<string, WorldPortalEntry>();

  private myIdentityHex: string | null = null;
  private myWorldId: bigint = 0n;
  private myWorldType = 'home';
  private myRace = 'aluvian';
  private isDead = false;
  private pixelArtMode = false;
  private myEquippedPx: EquippedPxItem[] = [];

  // World portal interaction
  private worldPortalPromptVisible = false;
  private activePortalId: string | null = null;

  private gameIsActive = false;
  private nextWaveMs   = 0;
  private waveNumber   = 0;
  private wavePhase    = 'idle';
  private lastWaveNumber = 0;
  private killCount    = 0;


  // Wave banner
  private waveBanner!: Phaser.GameObjects.Text;

  // Portal
  private portalCastEndMs   = 0;
  private portalCastStartMs = 0;
  private isCastingPortal   = false;
  private portalGraphics!: Phaser.GameObjects.Graphics;
  private portalBar!: FloatingBar;
  private portalLabel!: Phaser.GameObjects.Text;

  // HUD text
  private waveText!:  Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private killText!:  Phaser.GameObjects.Text;

  // Bottom HUD (HTML overlay)
  private bottomHud: BottomHud | null = null;

  // Mobile controls
  private joystick:      VirtualJoystick | null = null;
  private mobileActions: MobileActions   | null = null;

  // Player stats (updated from server)
  private myLevel     = 1;
  private myUnspentXp = 0;
  private myRunSkill  = 0; // 0=untrained, 1=trained, 2=specialized

  // Boss HP bar (shown during boss encounters)
  private bossBar: {
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
    name: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
  } | null = null;
  private bossBarEnemyId: string | null = null;

  // Toast queue
  private activeToasts: Phaser.GameObjects.Text[] = [];

  // Dead overlay
  private deadOverlay!: Phaser.GameObjects.Container;

  // Background graphics (drawn once to a render texture)
  private bgGraphics!: Phaser.GameObjects.Graphics;
  // Dungeon floor tint overlay
  private floorTintOverlay: Phaser.GameObjects.Rectangle | null = null;

  // HUD extras
  private worldDebugText!: Phaser.GameObjects.Text;

  // Keys
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up'|'down'|'left'|'right', Phaser.Input.Keyboard.Key>;
  private cKey!: Phaser.Input.Keyboard.Key;
  private fKey!: Phaser.Input.Keyboard.Key;
  private pKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;

  private sendTimer = 0;
  private lastSentX = 0;
  private lastSentY = 0;

  // Auto-attack visuals
  private attackTimer = 0;
  private readonly BASE_ATTACK_INTERVAL_MS = 500; // matches server CMB_INTERVAL_US
  private readonly CLIENT_ATTACK_RANGE = 85;      // slightly under server PLAYER_ATTACK_RANGE=90
  private equippedWeaponIcon     = '';
  private equippedWeaponItemType = '';
  private attackSpeedBonus       = 0; // sum of equipped 'as' stat bonuses
  private enemyPrevHp = new Map<string, number>();

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.buildWorld();
    this.setupCamera();
    this.setupInput();
    this.buildHUD();
    this.buildWaveBanner();
    this.buildPortalVisuals();
    this.buildDeadOverlay();
    bakeProjectileTextures(this);
    bakeAllEnemyTextures(this);
    this.joystick = new VirtualJoystick();
  }

  // ── World ──────────────────────────────────────────────────────────────────────

  private buildWorld() {
    const TILE = 80;
    const g = this.add.graphics().setDepth(0);

    for (let row = 0; row < Math.ceil(WORLD_HEIGHT / TILE); row++) {
      for (let col = 0; col < Math.ceil(WORLD_WIDTH / TILE); col++) {
        const h = (col * 73856093 ^ row * 19349663) & 0xffff;
        const s = 12 + (h % 8);
        g.fillStyle(Phaser.Display.Color.GetColor(s, s + 2, s + 5));
        g.fillRect(col * TILE, row * TILE, TILE, TILE);

        // Rare glyphs
        if (h % 40 === 0) {
          const glyphs = ['᚛', '᚜', '⊕', '◈'];
          this.add.text(col * TILE + TILE / 2, row * TILE + TILE / 2, glyphs[h % 4], {
            fontSize: '14px', color: '#c9a96e', alpha: 0.06,
          }).setOrigin(0.5).setDepth(1).setAlpha(0.06);
        }
      }
    }

    // World border
    g.lineStyle(4, 0x8b7355);
    g.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const zoom = window.innerWidth < 768 ? 1.0 : 1.5;
    this.cameras.main.setZoom(zoom);
  }

  private setupInput() {
    // Don't let Phaser swallow key events from HTML input fields
    this.input.keyboard!.disableGlobalCapture();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
    };
    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C, false);
    this.fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F, false);
    this.pKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P, false);
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R, false);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────────

  private buildHUD() {
    // Wave info — top left (below 36px top bar)
    this.waveText = this.add.text(12, 46, '', {
      fontSize: '12px', color: '#c9a96e',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(200);

    // Timer — top left below wave
    this.timerText = this.add.text(12, 62, '', {
      fontSize: '10px', color: '#ffcc44',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(200);

    // Kill count — top left
    this.killText = this.add.text(12, 78, '', {
      fontSize: '10px', color: '#aa8855',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(200);

    // World ID indicator
    this.worldDebugText = this.add.text(12, 93, '', {
      fontSize: '9px', color: '#6666aa',
      stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(200);

    // Boss HP bar — centered at top, hidden until a boss spawns
    const W = this.scale.width;
    const barW = Math.min(400, W - 80);
    const barX = W / 2 - barW / 2;
    const barY = 46; // 36px TopBar + 10px gap
    const bg   = this.add.rectangle(barX, barY, barW, 14, 0x1a0a0a, 0.92)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(201).setVisible(false);
    const fill = this.add.rectangle(barX, barY, barW, 14, 0xff6600)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(202).setVisible(false);
    const bossName = this.add.text(W / 2, barY + 7, '', {
      fontSize: '10px', fontStyle: 'bold', color: '#ffaa44',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(203).setVisible(false);
    const bossLabel = this.add.text(barX + barW + 4, barY + 7, '', {
      fontSize: '9px', color: '#888888', stroke: '#000000', strokeThickness: 1,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(203).setVisible(false);
    this.bossBar = { bg, fill, name: bossName, label: bossLabel };
  }

  updateGearHud(equipped: Array<{ slot: string; rarity: number; icon: string; stat: string; val: number; bonusStat: string; bonusVal: number; itemType?: string; paletteGame?: string }>) {
    const weapon = equipped.find(e => e.slot === 'weapon');
    this.equippedWeaponIcon     = weapon?.icon     ?? '';
    this.equippedWeaponItemType = weapon?.itemType ?? '';

    // Compute total attack speed bonus from all equipped items
    this.attackSpeedBonus = equipped.reduce((sum, it) => {
      return sum + (it.stat === 'as' ? it.val : 0) + (it.bonusStat === 'as' ? it.bonusVal : 0);
    }, 0);

    this.bottomHud?.updateGear(equipped as any);
  }

  // ── Wave banner ────────────────────────────────────────────────────────────────

  private buildWaveBanner() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.waveBanner = this.add.text(W / 2, H / 2 - 80, '', {
      fontSize: '28px', color: '#ee9922',
      stroke: '#000000', strokeThickness: 4,
      shadow: { x: 0, y: 0, blur: 20, color: '#ee5500', fill: true },
    })
      .setOrigin(0.5).setScrollFactor(0).setDepth(250).setAlpha(0);
  }

  showWaveBanner(name: string, waveNum: number, total: number) {
    this.tweens.killTweensOf(this.waveBanner);
    this.waveBanner
      .setText(`Wave ${waveNum}/${total}  ·  ${name}`)
      .setColor('#ee9922').setAlpha(1);
    this.tweens.add({
      targets: this.waveBanner,
      alpha: 0, delay: 2000, duration: 1000, ease: 'Linear',
    });
  }

  private showClearedBanner(waveNum: number) {
    this.tweens.killTweensOf(this.waveBanner);
    this.waveBanner
      .setText(waveNum >= 10 ? `ALL WAVES CLEARED  ·  PORTAL OPENS` : `Wave ${waveNum} Cleared  ·  Next in 8s`)
      .setColor(waveNum >= 10 ? '#ffd700' : '#44cc44').setAlpha(1);
    this.tweens.add({
      targets: this.waveBanner,
      alpha: 0, delay: 2500, duration: 1000, ease: 'Linear',
    });
  }

  showLevelUp(level: number) {
    playLevelUp();
    const W = this.scale.width;
    const H = this.scale.height;
    const txt = this.add.text(W / 2, H / 2 - 40, `LEVEL UP  ·  Lv ${level}`, {
      fontSize: '32px', fontStyle: 'bold', color: '#ffd700',
      stroke: '#000000', strokeThickness: 5,
      shadow: { x: 0, y: 0, blur: 24, color: '#ee9900', fill: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(260).setAlpha(0);

    this.tweens.add({
      targets: txt, alpha: 1, duration: 300,
      onComplete: () => {
        this.tweens.add({
          targets: txt, alpha: 0, y: txt.y - 20,
          delay: 1800, duration: 600, ease: 'Quad.In',
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  // ── Portal visuals ─────────────────────────────────────────────────────────────

  private buildPortalVisuals() {
    this.portalGraphics = this.add.graphics().setDepth(15);

    const W = this.scale.width;
    const CX = W / 2;
    const Y  = this.scale.height - 140;

    this.portalBar = {
      bg:  this.add.rectangle(CX - 40, Y, 80, 6, 0x222244, 0.9)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(205).setVisible(false),
      bar: this.add.rectangle(CX - 40, Y, 80, 6, 0x8844ee)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(206).setVisible(false),
    };

    this.portalLabel = this.add.text(CX, Y - 10, '', {
      fontSize: '9px', color: '#aa88ff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(207).setVisible(false);
  }

  setPortalCast(startMs: number, endMs: number) {
    this.portalCastStartMs = startMs;
    this.portalCastEndMs   = endMs;
    this.isCastingPortal   = true;
    this.portalBar.bg.setVisible(true);
    this.portalBar.bar.setVisible(true);
    this.portalLabel.setText('[P] Cancel  ·  Casting Portal...').setVisible(true);
    playPortalStart();
  }

  clearPortalCast() {
    this.isCastingPortal = false;
    this.portalCastEndMs = 0;
    this.portalBar.bg.setVisible(false);
    this.portalBar.bar.setVisible(false);
    this.portalLabel.setVisible(false);
    this.portalGraphics.clear();
  }

  // ── Dead overlay ───────────────────────────────────────────────────────────────

  private buildDeadOverlay() {
    const W = this.scale.width;
    const H = this.scale.height;

    const bg    = this.add.rectangle(W / 2, H / 2, W, H, 0x8b0000, 0.30);
    const title = this.add.text(W / 2, H / 2 - 40, 'FALLEN IN DERETH', {
      fontSize: '40px', color: '#8b0000',
      stroke: '#000000', strokeThickness: 4,
      shadow: { x: 0, y: 0, blur: 20, color: '#8b0000', fill: true },
    }).setOrigin(0.5);
    const hint = this.add.text(W / 2, H / 2 + 20, 'Returning to Lifestone...', {
      fontSize: '16px', color: '#887766',
    }).setOrigin(0.5);

    this.deadOverlay = this.add.container(0, 0, [bg, title, hint])
      .setScrollFactor(0).setDepth(300).setVisible(false);
  }

  // ── Public API ─────────────────────────────────────────────────────────────────

  setMyIdentity(hex: string) { this.myIdentityHex = hex; }
  setMyRace(race: string)    { this.myRace = race; }

  setPixelArtMode(enabled: boolean) {
    this.pixelArtMode = enabled;
    for (const [, entry] of this.players) {
      entry.body.setVisible(!enabled);
      entry.inner.setVisible(!enabled);
      if (entry.sprite) entry.sprite.setVisible(enabled);
    }
    // Enemies always use pixel art sprites — not toggled by pixelArtMode
    for (const [, entry] of this.groundItems) {
      entry.glow.setVisible(!enabled);
      entry.ring.setVisible(!enabled);
      entry.icon.setVisible(!enabled);
      if (entry.cardSprite) entry.cardSprite.setVisible(enabled);
    }
  }

  // Called from main.ts when local player equips/unequips an item
  rebakeLocalPlayerSprite(equipped: Array<{ slot: string; itemType?: string; paletteGame?: string; rarity: number }>) {
    // Always update the cache so upsertPlayerSprite reads the right gear even if called before the sprite exists
    this.myEquippedPx = equipped
      .filter(e => e.itemType && e.paletteGame)
      .map(e => ({ itemType: e.itemType!, paletteGame: e.paletteGame!, rarity: e.rarity }));

    if (!this.myIdentityHex) return;
    const entry = this.players.get(this.myIdentityHex);
    if (!entry || !entry.sprite) return;

    const newKey = equippedHash(this.myRace, this.myEquippedPx);
    if (newKey !== entry.spriteKey) {
      bakePlayerTexture(this, newKey, this.myRace, this.myEquippedPx);
      entry.sprite.setTexture(newKey, getFrameIndex(entry.spriteDir, entry.spriteFrame));
      entry.spriteKey = newKey;
    }
  }

  setPlayerStats(level: number, unspentXp: bigint, runSkill = 0) {
    this.myLevel     = level;
    this.myUnspentXp = Number(unspentXp);
    this.myRunSkill  = runSkill;
  }

  incrementKill() {
    this.killCount++;
  }

  upsertPlayerSprite(hex: string, x: number, y: number, username: string, race = 'aluvian') {
    let entry = this.players.get(hex);
    const isMe  = hex === this.myIdentityHex;
    const outerCol = RACE_COLORS[race]  ?? 0xc9a96e;
    const innerCol = RACE_INNER[race]   ?? 0xc9a96e;

    if (!entry) {
      const body  = this.add.circle(x, y, 12, outerCol).setDepth(10);
      const inner = this.add.circle(x, y, 8,  innerCol).setDepth(11);
      // Own username label is redundant — only show for other players
      const label = this.add.text(x, y - 20, username, {
        fontSize: '9px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(12).setVisible(!isMe);

      // HP bar above head — only useful for other players; local HP is in BottomHud orb
      const hpBg  = this.add.rectangle(x, y - 16, 28, 3, 0x300000).setDepth(13).setVisible(!isMe);
      const hpBar = this.add.rectangle(x, y - 16, 28, 3, 0x882200)
        .setOrigin(0.5).setDepth(14).setVisible(!isMe);

      entry = {
        body, inner, label, hp: { bg: hpBg, bar: hpBar },
        spriteDir: 'down', spriteFrame: 0, spriteFrameTimer: 0,
      };
      this.players.set(hex, entry);

      // Pixel art sprite (starts invisible until mode is active)
      const spriteRace = isMe ? this.myRace : race;
      const equippedPx = isMe ? this.myEquippedPx : [];
      const spriteKey = equippedHash(spriteRace, equippedPx);
      bakePlayerTexture(this, spriteKey, spriteRace, equippedPx);
      const sprite = this.add.image(x, y, spriteKey, 0)
        .setDisplaySize(FRAME_WIDTH, FRAME_WIDTH).setDepth(10)
        .setVisible(this.pixelArtMode);
      entry.sprite = sprite;
      entry.spriteKey = spriteKey;

      // In pixel art mode: hide legacy circles
      body.setVisible(!this.pixelArtMode);
      inner.setVisible(!this.pixelArtMode);

      if (isMe) this.cameras.main.startFollow(body, true, 0.1, 0.1);
    } else {
      if (!isMe) {
        entry.body.setPosition(x, y);
        entry.inner.setPosition(x, y);
        entry.sprite?.setPosition(x, y);
      }
      entry.body.setFillStyle(outerCol);
      entry.inner.setFillStyle(innerCol);
      entry.label.setText(username).setPosition(entry.body.x, entry.body.y - 20);
      entry.hp.bg.setPosition(entry.body.x, entry.body.y - 16);
      entry.hp.bar.setPosition(entry.body.x, entry.body.y - 16);
    }
  }

  updatePlayerHealth(hex: string, currentHp: number, maxHp: number) {
    const isMe = hex === this.myIdentityHex;

    if (isMe) {
      this.bottomHud?.updateHp(currentHp, maxHp);
      if (currentHp === 0 && !this.isDead) {
        this.isDead = true;
        this.deadOverlay.setVisible(true);
        this.mobileActions?.setDead(true);
        playPlayerDeath();
      } else if (currentHp > 0 && this.isDead) {
        this.isDead = false;
        this.deadOverlay.setVisible(false);
        this.mobileActions?.setDead(false);
      }
    }

    const entry = this.players.get(hex);
    if (!entry || isMe) return;
    const pct = maxHp > 0 ? currentHp / maxHp : 0;
    entry.hp.bar.setSize(28 * pct, 3);
  }

  removePlayerSprite(hex: string) {
    const entry = this.players.get(hex);
    if (!entry) return;
    entry.body.destroy(); entry.inner.destroy();
    entry.label.destroy();
    entry.hp.bg.destroy(); entry.hp.bar.destroy();
    entry.sprite?.destroy();
    this.players.delete(hex);
  }

  upsertEnemySprite(idStr: string, x: number, y: number, currentHp: number, maxHp: number, enemyType: string, isBoss = false, bossLevel = 0, mechState = '') {
    let entry = this.enemies.get(idStr);
    const baseData = ENEMY_TYPE_DATA[enemyType] ?? { color: 0xc62828, letter: '?', size: 14 };
    // Bosses are 2× larger
    const data = isBoss ? { ...baseData, size: baseData.size * 2 } : baseData;

    if (!entry) {
      // Boss: pulsing aura behind body
      let bossAura: Phaser.GameObjects.Arc | undefined;
      let bossNameTag: Phaser.GameObjects.Text | undefined;
      if (isBoss) {
        bossAura = this.add.circle(x, y, data.size + 8, 0xffaa00, 0.15).setDepth(9);
        this.tweens.add({ targets: bossAura, alpha: 0.45, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        const floorName = bossLevel >= 1 && bossLevel <= 10 ? BOSS_NAMES[bossLevel - 1] ?? '' : '';
        bossNameTag = this.add.text(x, y - data.size - 18, floorName, {
          fontSize: '10px', fontStyle: 'bold', color: '#ffaa00',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(14);

        // Boss fanfare: camera shake + banner + sound
        this.cameras.main.shake(600, 0.012);
        if (floorName) this.showWaveBanner(`⚔ ${floorName}`, bossLevel, bossLevel);
        playBossEnter();

        // Show boss HP bar
        if (this.bossBar) {
          const barW = this.bossBar.bg.width;
          this.bossBar.bg.setVisible(true);
          this.bossBar.fill.setVisible(true).setDisplaySize(barW, 14);
          this.bossBar.name.setText(floorName).setVisible(true);
          this.bossBar.label.setText('').setVisible(true);
          this.bossBarEnemyId = idStr;
        }
      }

      // Circles are fallback only — hidden when pixel art sprite is available
      const hasPxSprite = this.textures.exists(`enemy_${enemyType}`);
      const body  = this.add.circle(x, y, data.size, data.color).setDepth(10).setVisible(!hasPxSprite);
      const label = this.add.text(x, y, baseData.letter, {
        fontSize: `${data.size}px`, fontStyle: 'bold',
        color: '#dddddd', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(11).setVisible(!hasPxSprite);

      // HP bar Y: use sprite half-height for pixel art enemies, circle radius for fallback
      const hpOffY = this.textures.exists(`enemy_${enemyType}`) || (isBoss && enemyType === 'hydra')
        ? (isBoss ? 36 : ENEMY_FRAME_SIZE / 2 + 4)
        : data.size + 6;
      const hpBg  = this.add.rectangle(x, y - hpOffY, data.size * 2 + 4, isBoss ? 6 : 3, 0x300000).setDepth(12);
      const hpBar = this.add.rectangle(x, y - hpOffY, data.size * 2 + 4, isBoss ? 6 : 3, isBoss ? 0xff6600 : 0xcc0000)
        .setOrigin(0.5).setDepth(13);

      // Pixel art sprite — hydra boss uses a dynamic canvas renderer
      let sprite: Phaser.GameObjects.Image | undefined;
      let bossRenderer: BossRenderer | undefined;
      if (isBoss && enemyType === 'hydra') {
        const bossKey = `boss_canvas_${idStr}`;
        bossRenderer = new BossRenderer(this, bossKey);
        if (mechState) bossRenderer.applyMechState(mechState);
        sprite = this.add.image(x, y, bossKey).setDisplaySize(64, 64).setDepth(10);
        // Hide fallback circles — boss uses the canvas sprite
        body.setVisible(false);
        label.setVisible(false);
      } else {
        const spriteKey = `enemy_${enemyType}`;
        const spriteSize = isBoss ? ENEMY_FRAME_SIZE * 2 : ENEMY_FRAME_SIZE;
        sprite = this.textures.exists(spriteKey)
          ? this.add.image(x, y, spriteKey, 0).setDisplaySize(spriteSize, spriteSize).setDepth(10)
          : undefined;
      }

      entry = {
        body, label, hp: { bg: hpBg, bar: hpBar }, type: enemyType, isBoss, bossAura, bossNameTag,
        sprite, bossRenderer, spriteDir: 'down', spriteFrame: 0, spriteFrameTimer: 0,
      };
      this.enemies.set(idStr, entry);
      this.enemyPrevHp.set(idStr, currentHp);
    } else {
      // Track facing direction from movement delta
      const dx = x - entry.body.x, dy = y - entry.body.y;
      if (dx !== 0 || dy !== 0) entry.spriteDir = getFacing(dx, dy);

      // Boss renderer: apply mechState changes and movement
      if (entry.bossRenderer) {
        if (mechState) entry.bossRenderer.applyMechState(mechState);
        entry.bossRenderer.setMoving(dx !== 0 || dy !== 0);
      }

      entry.body.setPosition(x, y);
      entry.label.setPosition(x, y);
      const barY = y - data.size - 6;
      entry.hp.bg.setPosition(x, barY);
      entry.hp.bar.setPosition(x, barY);
      if (entry.sprite) entry.sprite.setPosition(x, y);
      if (entry.bossAura) entry.bossAura.setPosition(x, y);
      if (entry.bossNameTag) entry.bossNameTag.setPosition(x, y - data.size - 18);

      // Show hit effect if HP dropped
      const prevHp = this.enemyPrevHp.get(idStr);
      if (prevHp !== undefined && currentHp < prevHp) {
        this.showHitEffect(x, y - data.size, prevHp - currentHp);
        playHit();
        if (entry.bossRenderer) entry.bossRenderer.playHurt();
        else this.flashEnemy(entry, data.color);
      }
      this.enemyPrevHp.set(idStr, currentHp);
    }

    const pct = maxHp > 0 ? currentHp / maxHp : 0;
    entry.hp.bar.setSize((data.size * 2 + 4) * pct, isBoss ? 6 : 3);

    // Update dedicated boss HP bar
    if (isBoss && this.bossBar && this.bossBarEnemyId === idStr) {
      const barW = this.bossBar.bg.width;
      this.bossBar.fill.setDisplaySize(Math.max(0, barW * pct), 14);
      // Hydra immunity: no heads alive — body is invulnerable
      const headMask = mechState.startsWith('hydra:') ? mechState.split(':')[1] : null;
      const isHydraImmune = headMask !== null && !headMask.includes('1');
      if (isHydraImmune) {
        this.bossBar.fill.setFillStyle(0x444444);
        this.bossBar.label.setText('IMMUNE  ·  sever the heads');
      } else {
        this.bossBar.fill.setFillStyle(0xff6600);
        this.bossBar.label.setText(`${currentHp} / ${maxHp}`);
      }
    }
  }

  removeEnemySprite(idStr: string) {
    this.incrementKill();
    const entry = this.enemies.get(idStr);
    if (!entry) return;
    const data = ENEMY_TYPE_DATA[entry.type] ?? { color: 0xc62828, size: 14, xp: 0 };
    this.showDeathBurst(entry.body.x, entry.body.y, data.color, data.size);
    if (data.xp > 0) this.showXpGain(entry.body.x, entry.body.y, data.xp);
    if (entry.isBoss) {
      playBossDeath();
      // Hide dedicated boss HP bar
      if (this.bossBar && this.bossBarEnemyId === idStr) {
        this.bossBar.bg.setVisible(false);
        this.bossBar.fill.setVisible(false);
        this.bossBar.name.setVisible(false);
        this.bossBar.label.setVisible(false);
        this.bossBarEnemyId = null;
      }
    } else {
      playKill();
    }
    entry.body.destroy(); entry.label.destroy();
    entry.hp.bg.destroy(); entry.hp.bar.destroy();
    entry.sprite?.destroy();
    entry.bossAura?.destroy();
    entry.bossNameTag?.destroy();
    entry.bossRenderer?.destroy();
    this.enemies.delete(idStr);
    this.enemyPrevHp.delete(idStr);
  }

  // ── Ground items ───────────────────────────────────────────────────────────────

  upsertGroundItem(
    idStr: string, x: number, y: number, icon: string, rarity: number,
    itemType = '', paletteGame = '', stat = '', val = 0, bonusStat = '', bonusVal = 0,
  ) {
    // Clear stale entry first
    this.removeGroundItem(idStr);

    const col  = RARITY_COLORS[rarity] ?? 0x888888;

    // Soft glow background
    const glow = this.add.circle(x, y, 12, col, 0.25).setDepth(7);
    this.tweens.add({ targets: glow, alpha: 0.6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // Rarity-colored ring
    const ring = this.add.circle(x, y, 12, col, 0).setDepth(7)
      .setStrokeStyle(1.5, col, 0.8);

    // Item icon
    const iconTxt = this.add.text(x, y, icon, {
      fontSize: '14px',
    }).setOrigin(0.5).setDepth(8);

    // Gentle float up/down
    this.tweens.add({ targets: [iconTxt, ring], y: y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // Pixel art card sprite
    let cardSprite: Phaser.GameObjects.Image | undefined;
    const cardKey = `item_card_${idStr}`;
    const hasPx = bakeGroundItemTexture(this, cardKey, itemType, paletteGame, rarity, stat, val, bonusStat, bonusVal);
    if (hasPx) {
      cardSprite = this.add.image(x, y, cardKey)
        .setDisplaySize(24, 24).setDepth(8)
        .setVisible(this.pixelArtMode);
      this.tweens.add({ targets: cardSprite, y: y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    // Legacy objects hidden in pixel art mode (if card available)
    if (this.pixelArtMode && hasPx) {
      glow.setVisible(false);
      ring.setVisible(false);
      iconTxt.setVisible(false);
    }

    this.groundItems.set(idStr, { glow, ring, icon: iconTxt, cardSprite });
  }

  removeGroundItem(idStr: string) {
    const entry = this.groundItems.get(idStr);
    if (!entry) return;
    this.tweens.killTweensOf(entry.glow);
    this.tweens.killTweensOf(entry.ring);
    this.tweens.killTweensOf(entry.icon);
    if (entry.cardSprite) this.tweens.killTweensOf(entry.cardSprite);
    entry.glow.destroy(); entry.ring.destroy(); entry.icon.destroy();
    entry.cardSprite?.destroy();
    const cardKey = `item_card_${idStr}`;
    if (this.textures.exists(cardKey)) this.textures.remove(cardKey);
    this.groundItems.delete(idStr);
  }

  updateGameState(isActive: boolean, waveNumber: number, nextWaveMs: number, waveName = '', wavePhase = 'idle') {
    const waveChanged   = isActive && waveNumber !== this.lastWaveNumber && waveNumber > 0;
    const justCleared   = isActive && wavePhase === 'waiting' && this.wavePhase === 'combat';
    const prevPhase     = this.wavePhase;

    this.gameIsActive   = isActive;
    this.nextWaveMs     = nextWaveMs;
    this.waveNumber     = waveNumber;
    this.wavePhase      = wavePhase;
    this.lastWaveNumber = waveNumber;

    void prevPhase; // suppress unused warning

    if (!isActive) {
      this.waveText.setText('');
      this.timerText.setText('');
      this.killCount = 0;
      return;
    }

    if (waveChanged && waveName) {
      this.showWaveBanner(waveName, waveNumber, 10);
      playWaveStart();
    }
    if (justCleared) {
      this.showClearedBanner(waveNumber);
      playWaveCleared();
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    this.handleMovement(delta);
    this.handleRespawnInput();
    this.handleCharPanelInput();
    this.handleWorldPortalInput();
    this.handlePortalInput();
    this.tickHUD();
    this.tickPortalUI();
    this.tickAutoAttack(delta);
    this.tickRadar();
    this.tickEnemySprites(delta);
  }

  private tickRadar() {
    if (!this.bottomHud || !this.myIdentityHex) return;
    const me = this.players.get(this.myIdentityHex);
    if (!me) { this.bottomHud.updateMinimap(0, 0, [], []); return; }

    const myX = me.body.x;
    const myY = me.body.y;

    const enemies: Array<{ x: number; y: number; isBoss: boolean }> = [];
    for (const [, e] of this.enemies) {
      enemies.push({ x: e.body.x, y: e.body.y, isBoss: e.isBoss });
    }

    const otherPlayers: Array<{ x: number; y: number }> = [];
    for (const [hex, p] of this.players) {
      if (hex === this.myIdentityHex) continue;
      otherPlayers.push({ x: p.body.x, y: p.body.y });
    }

    const portals: Array<{ x: number; y: number }> = [];
    for (const [, entry] of this.worldPortals) {
      portals.push({ x: entry.ring1.x, y: entry.ring1.y });
    }

    this.bottomHud.updateMinimap(myX, myY, enemies, otherPlayers, portals);
  }

  private tickEnemySprites(delta: number) {
    for (const [, entry] of this.enemies) {
      // Boss with dynamic canvas renderer — advance its animation, skip atlas frame cycling
      if (entry.bossRenderer) {
        entry.bossRenderer.update(delta);
        continue;
      }
      if (!entry.sprite) continue;
      // Flyers animate at 2× speed (matches creature-lab: every 6 ticks vs 12)
      const interval = (entry.type === 'shadow' || entry.type === 'virindi') ? 100 : 200;
      entry.spriteFrameTimer += delta;
      if (entry.spriteFrameTimer >= interval) {
        entry.spriteFrame = (entry.spriteFrame + 1) % 4;
        entry.spriteFrameTimer = 0;
      }
      entry.sprite.setFrame(getEnemyFrameIndex(entry.spriteDir, entry.spriteFrame));
    }
  }

  setRadarVisible(v: boolean) { this.bottomHud?.setMinimapVisible(v); }

  setBottomHud(hud: BottomHud) { this.bottomHud = hud; }

  setMobileActions(actions: MobileActions) { this.mobileActions = actions; }

  showMobileControls() {
    this.joystick?.show();
  }

  hideMobileControls() {
    this.joystick?.hide();
  }

  getIsCastingPortal(): boolean { return this.isCastingPortal; }

  enterNearestPortal() {
    if (!this.myIdentityHex) return;
    const me = this.players.get(this.myIdentityHex);
    if (!me) return;
    for (const [id, entry] of this.worldPortals) {
      const dx = me.body.x - entry.ring1.x;
      const dy = me.body.y - entry.ring1.y;
      if (Math.sqrt(dx * dx + dy * dy) < WORLD_PORTAL_RANGE) {
        this.events.emit('enterPortal', BigInt(id));
        return;
      }
    }
  }

  private handleMovement(delta: number) {
    if (!this.myIdentityHex || this.isDead) return;
    const entry = this.players.get(this.myIdentityHex);
    if (!entry) return;

    // Run skill: trained +20%, specialized +40%
    const runMult = this.myRunSkill === 2 ? 1.40 : this.myRunSkill === 1 ? 1.20 : 1.0;
    const speed = MOVE_SPEED * runMult * (delta / 1000);
    let dx = 0, dy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  dx -= speed;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += speed;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    dy -= speed;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  dy += speed;

    // Virtual joystick (mobile)
    if (dx === 0 && dy === 0 && this.joystick?.isActive()) {
      const j = this.joystick.getDelta();
      dx = j.dx * speed;
      dy = j.dy * speed;
    }

    if (dx !== 0 || dy !== 0) {
      const newX = Phaser.Math.Clamp(entry.body.x + dx, 0, WORLD_WIDTH);
      const newY = Phaser.Math.Clamp(entry.body.y + dy, 0, WORLD_HEIGHT);
      entry.body.setPosition(newX, newY);
      entry.inner.setPosition(newX, newY);
      entry.label.setPosition(newX, newY - 20);
      entry.hp.bg.setPosition(newX, newY - 16);
      entry.hp.bar.setPosition(newX, newY - 16);

      // Sync sprite position + animate facing
      if (entry.sprite) {
        entry.sprite.setPosition(newX, newY);
        entry.spriteDir = getFacing(dx, dy);
        entry.spriteFrameTimer += delta;
        if (entry.spriteFrameTimer >= 300) {
          entry.spriteFrame = entry.spriteFrame === 0 ? 1 : 0;
          entry.spriteFrameTimer = 0;
        }
        entry.sprite.setFrame(getFrameIndex(entry.spriteDir, entry.spriteFrame));
      }

      this.sendTimer += delta;
      if (
        this.sendTimer >= SEND_INTERVAL &&
        (Math.abs(newX - this.lastSentX) > 1 || Math.abs(newY - this.lastSentY) > 1)
      ) {
        this.sendTimer = 0;
        this.lastSentX = newX;
        this.lastSentY = newY;
        this.events.emit('move', newX, newY);
      }
    }
  }

  /** Force-snap the local player sprite to an exact position (e.g. after deploy/respawn). */
  snapLocalPlayerPosition(x: number, y: number) {
    if (!this.myIdentityHex) return;
    const entry = this.players.get(this.myIdentityHex);
    if (!entry) return;
    entry.body.setPosition(x, y);
    entry.inner.setPosition(x, y);
    entry.label.setPosition(x, y - 20);
    entry.hp.bg.setPosition(x, y - 16);
    entry.hp.bar.setPosition(x, y - 16);
    if (entry.sprite) entry.sprite.setPosition(x, y);
  }

  private handleRespawnInput() {
    if (this.isDead && Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.events.emit('respawnPlayer');
    }
  }

  private handleCharPanelInput() {
    if (Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.events.emit('toggleCharPanel');
    }
  }

  private handleWorldPortalInput() {
    if (!this.myIdentityHex) return;
    const me = this.players.get(this.myIdentityHex);
    if (!me) return;

    let nearPortalId: string | null = null;
    for (const [id, entry] of this.worldPortals) {
      const px = entry.ring1.x, py = entry.ring1.y;
      const dx = me.body.x - px, dy = me.body.y - py;
      const near = Math.sqrt(dx * dx + dy * dy) < WORLD_PORTAL_RANGE;
      entry.prompt.setVisible(near);
      if (near) nearPortalId = id;
    }

    if (nearPortalId && Phaser.Input.Keyboard.JustDown(this.fKey)) {
      this.events.emit('enterPortal', BigInt(nearPortalId));
    }
  }

  private handlePortalInput() {
    if (!this.gameIsActive || !this.myIdentityHex || this.isDead) return;

    if (Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.events.emit(this.isCastingPortal ? 'cancelPortalCast' : 'startPortalCast');
    }
  }

  private tickHUD() {
    this.bottomHud?.updateLevel(this.myLevel, this.myUnspentXp);

    if (!this.gameIsActive) {
      this.killText.setText('');
      this.worldDebugText.setText(this.myWorldId > 0n ? `World #${this.myWorldId}` : '');
      return;
    }

    if (this.wavePhase === 'waiting' && this.nextWaveMs > 0) {
      const s = Math.max(0, Math.ceil((this.nextWaveMs - Date.now()) / 1000));
      this.waveText.setText(`Wave ${this.waveNumber}/10`);
      this.timerText.setText(`Next wave: ${s}s`);
    } else if (this.wavePhase === 'combat') {
      this.waveText.setText(`Wave ${this.waveNumber}/10`);
      this.timerText.setText(`${this.enemies.size} alive`);
    } else {
      this.waveText.setText('');
      this.timerText.setText('');
    }

    this.killText.setText(`Kills: ${this.killCount}`);
    this.worldDebugText.setText(this.myWorldId > 0n ? `World #${this.myWorldId}` : '');
  }

  private tickPortalUI() {
    if (!this.isCastingPortal || this.portalCastEndMs === 0) return;

    const now   = Date.now();
    const total = this.portalCastEndMs - this.portalCastStartMs;
    const pct   = Math.min((now - this.portalCastStartMs) / total, 1);

    this.portalBar.bar.setSize(80 * pct, 6);

    const entry = this.myIdentityHex ? this.players.get(this.myIdentityHex) : undefined;
    if (entry) {
      this.portalGraphics.clear();
      // Two rotating arcs for v2.0 portal effect
      this.portalGraphics.lineStyle(2 + pct * 3, 0x8844cc, 0.3 + pct * 0.5);
      this.portalGraphics.beginPath();
      this.portalGraphics.arc(entry.body.x, entry.body.y, 20 + pct * 15,
        -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
      this.portalGraphics.strokePath();
      this.portalGraphics.lineStyle(2, 0x8844cc, 0.3 + pct * 0.5);
      this.portalGraphics.beginPath();
      this.portalGraphics.arc(entry.body.x, entry.body.y, 20 + pct * 15,
        Math.PI / 2, Math.PI / 2 + Math.PI * 2 * pct, false);
      this.portalGraphics.strokePath();
    }

    if (pct >= 1) this.clearPortalCast();
  }

  // ── Auto-attack visuals ────────────────────────────────────────────────────────

  // Determine weapon category from itemType (new items) or icon emoji (legacy items).
  private resolveWeaponCategory(): WeaponCategory {
    if (this.equippedWeaponItemType) {
      return getWeaponCategory(this.equippedWeaponItemType);
    }
    // Legacy items: map emoji → category so old gear also gets pixel attacks
    switch (this.equippedWeaponIcon) {
      case '🔮': return 'staff';
      case '⚔️': return 'sword';
      case '🪓': return 'axe';
      case '🗡️': return 'dagger';
      case '🏹': return 'bow';
      default:   return 'unarmed';
    }
  }

  private tickAutoAttack(delta: number) {
    if (!this.gameIsActive || !this.myIdentityHex || this.isDead) return;
    const me = this.players.get(this.myIdentityHex);
    if (!me || this.enemies.size === 0) return;

    const interval = Math.floor(this.BASE_ATTACK_INTERVAL_MS / (1 + this.attackSpeedBonus));
    this.attackTimer += delta;
    if (this.attackTimer < interval) return;
    this.attackTimer = 0;

    // Find nearest enemy
    let nearestDist = Infinity;
    let nearestX = 0, nearestY = 0;
    for (const [, entry] of this.enemies) {
      const dx = entry.body.x - me.body.x;
      const dy = entry.body.y - me.body.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < nearestDist) {
        nearestDist = d; nearestX = entry.body.x; nearestY = entry.body.y;
      }
    }

    if (nearestDist > this.CLIENT_ATTACK_RANGE) return;

    const cat = this.resolveWeaponCategory();
    if (isRanged(cat)) {
      this.firePixelRanged(me.body.x, me.body.y, nearestX, nearestY, cat);
    } else {
      this.firePixelMelee(me.body.x, me.body.y, nearestX, nearestY, cat);
    }
  }

  // ── Pixel-art attack visuals ───────────────────────────────────────────────────

  // Ranged: pixel sprite travels from player to enemy, impact burst on arrival.
  private firePixelRanged(fromX: number, fromY: number, toX: number, toY: number, cat: WeaponCategory) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const proj  = this.add.image(fromX, fromY, projKey(cat))
      .setRotation(angle)
      .setDepth(22);

    this.tweens.add({
      targets: proj,
      x: toX, y: toY,
      duration: TRAVEL_MS[cat],
      ease: 'Linear',
      onComplete: () => {
        this.firePixelImpact(toX, toY, cat);
        proj.destroy();
      },
    });
  }

  // Melee: flash near the player facing the enemy, quick scale-out fade.
  // Sword/axe sprites are vertical arcs — when rotated by attack angle they
  // become perpendicular to the swing, which reads as a blade sweep.
  private firePixelMelee(fromX: number, fromY: number, toX: number, toY: number, cat: WeaponCategory) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const d     = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    const reach = Math.min(d * 0.6, 28);
    const flashX = fromX + Math.cos(angle) * reach;
    const flashY = fromY + Math.sin(angle) * reach;

    const flash = this.add.image(flashX, flashY, projKey(cat))
      .setRotation(angle)
      .setDepth(22)
      .setAlpha(0.95);

    this.tweens.add({
      targets: flash,
      scaleX: 1.5, scaleY: 1.5,
      alpha: 0,
      duration: TRAVEL_MS[cat],
      ease: 'Power2Out',
      onComplete: () => flash.destroy(),
    });

    this.firePixelImpact(flashX, flashY, cat);
  }

  // Tiny particle burst at impact point.
  private firePixelImpact(x: number, y: number, cat: WeaponCategory) {
    const cols  = IMPACT_COLORS[cat];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const a     = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.8;
      const speed = 18 + Math.random() * 22;
      const dot   = this.add.circle(x, y, 1.5 + Math.random() * 1.5, cols[i % cols.length], 1).setDepth(23);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * speed,
        y: y + Math.sin(a) * speed,
        alpha: 0, scaleX: 0, scaleY: 0,
        duration: 180 + Math.random() * 80,
        ease: 'Power2Out',
        onComplete: () => dot.destroy(),
      });
    }
  }

  // Traveling orb — magic weapons (🔮)
  private fireMagicOrb(fromX: number, fromY: number, toX: number, toY: number, color: number, trailColor: number) {
    const orb = this.add.circle(fromX, fromY, 5, color, 1).setDepth(22);

    // Spawn 4 trail dots at evenly-spaced delays
    for (let i = 1; i <= 4; i++) {
      const pct = i / 5;
      const tx = fromX + (toX - fromX) * pct;
      const ty = fromY + (toY - fromY) * pct;
      this.time.delayedCall(260 * pct, () => {
        const dot = this.add.circle(tx, ty, 2.5, trailColor, 0.5).setDepth(21);
        this.tweens.add({ targets: dot, alpha: 0, duration: 200, onComplete: () => dot.destroy() });
      });
    }

    this.tweens.add({
      targets: orb,
      x: toX, y: toY,
      duration: 260,
      ease: 'Linear',
      onComplete: () => {
        // Impact flash
        const flash = this.add.circle(toX, toY, 10, trailColor, 0.8).setDepth(23);
        this.tweens.add({
          targets: flash, scaleX: 2.5, scaleY: 2.5, alpha: 0,
          duration: 180, onComplete: () => flash.destroy(),
        });
        orb.destroy();
      },
    });
  }

  // Melee arc sweep — axe / gauntlets
  private fireMeleeSwing(fromX: number, fromY: number, toX: number, toY: number, color: number, lineWidth: number, arcSpread: number) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const g = this.add.graphics().setDepth(22);
    const state = { t: 0 };

    this.tweens.add({
      targets: state, t: 1,
      duration: 180, ease: 'Quad.Out',
      onUpdate: () => {
        g.clear();
        const r = 12 + state.t * 42;
        const a = 0.9 - state.t * 0.9;
        g.lineStyle(lineWidth, color, a);
        g.beginPath();
        g.arc(fromX, fromY, r, angle - arcSpread, angle + arcSpread, false);
        g.strokePath();
        // Inner bright edge
        g.lineStyle(1, 0xffffff, a * 0.4);
        g.beginPath();
        g.arc(fromX, fromY, r - 2, angle - arcSpread * 0.6, angle + arcSpread * 0.6, false);
        g.strokePath();
      },
      onComplete: () => g.destroy(),
    });

    // Small spark at impact point
    const impactR = 12;
    const sx = fromX + Math.cos(angle) * impactR;
    const sy = fromY + Math.sin(angle) * impactR;
    const spark = this.add.circle(sx, sy, 3, 0xffffff, 0.9).setDepth(23);
    this.tweens.add({
      targets: spark, scaleX: 2, scaleY: 2, alpha: 0,
      duration: 150, onComplete: () => spark.destroy(),
    });
  }

  // Unarmed punch — brief directional flash
  private fireUnarmedPunch(fromX: number, fromY: number, toX: number, toY: number) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const px = fromX + Math.cos(angle) * 18;
    const py = fromY + Math.sin(angle) * 18;
    const flash = this.add.circle(px, py, 6, 0xffffff, 0.7).setDepth(22);
    this.tweens.add({
      targets: flash, scaleX: 2, scaleY: 2, alpha: 0,
      duration: 130, ease: 'Quad.Out', onComplete: () => flash.destroy(),
    });
  }

  // Floating damage number above enemy
  private showHitEffect(x: number, y: number, damage: number) {
    const offsetX = Phaser.Math.Between(-6, 6);
    const txt = this.add.text(x + offsetX, y - 4, `-${damage}`, {
      fontSize: '11px', fontStyle: 'bold',
      color: '#ff5555', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(30);

    this.tweens.add({
      targets: txt, y: txt.y - 22, alpha: 0,
      duration: 650, ease: 'Quad.Out',
      onComplete: () => txt.destroy(),
    });
  }

  // Brief red flash on an enemy circle
  private flashEnemy(entry: EnemyEntry, originalColor: number) {
    entry.body.setFillStyle(0xff2222);
    this.time.delayedCall(120, () => {
      if (entry.body.active) entry.body.setFillStyle(originalColor);
    });
  }

  // Floating green +XP text on kill (world space — scrolls with camera)
  private showXpGain(x: number, y: number, xp: number) {
    const txt = this.add.text(x, y - 28, `+${xp} XP`, {
      fontSize: '10px', fontStyle: 'bold',
      color: '#44dd44', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(31);

    this.tweens.add({
      targets: txt, y: txt.y - 30, alpha: 0,
      duration: 900, ease: 'Quad.Out',
      onComplete: () => txt.destroy(),
    });
  }

  // Stacking loot notification toasts (top-right, slide in, expire, reflow on remove)
  showLootToast(icon: string, message: string, rarity: number) {
    playLootDrop();
    const W      = this.scale.width;
    const col    = RARITY_HEX_CSS[rarity] ?? '#888888';
    const SLOT_H = 26;
    const TOP_Y  = 50;

    const idx   = this.activeToasts.length;
    const toast = this.add.text(W - 12, TOP_Y + idx * SLOT_H, `${icon}  ${message}`, {
      fontSize: '11px', fontStyle: 'bold',
      color: col, stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000099',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(250).setAlpha(0);

    this.activeToasts.push(toast);

    this.tweens.add({
      targets: toast, alpha: 1, duration: 150,
      onComplete: () => {
        this.tweens.add({
          targets: toast, alpha: 0, delay: 2500, duration: 400,
          onComplete: () => {
            const i = this.activeToasts.indexOf(toast);
            if (i !== -1) this.activeToasts.splice(i, 1);
            toast.destroy();
            // Slide remaining toasts up to fill the gap
            this.activeToasts.forEach((t, j) => {
              this.tweens.add({ targets: t, y: TOP_Y + j * SLOT_H, duration: 200, ease: 'Quad.Out' });
            });
          },
        });
      },
    });
  }

  // ── World portals ───────────────────────────────────────────────────────────

  setMyWorldType(type: string, dungeonLevel = 0) {
    this.myWorldType = type;
    // Dungeon floor tinting — each floor gets a distinct color overlay
    this.floorTintOverlay?.destroy();
    this.floorTintOverlay = null;
    if (type === 'dungeon' && dungeonLevel >= 1) {
      const FLOOR_TINTS = [
        0x3a1a00, // 1: Drudge Warrens — blood brown
        0x1a0a2a, // 2: Shadow Den — deep violet
        0x0a1e10, // 3: Banderling Lair — dark teal
        0x001a10, // 4: Hydra Lair — swamp dark
        0x0a0a2e, // 5: Virindi Sanctum — void blue
        0x2a1200, // 6: Tusker Canyon — burnt earth
        0x120026, // 7: Virindi Apparatus — indigo
        0x1e0000, // 8: The Horde — dark crimson
        0x001400, // 9: Olthoi Guard — deep forest
        0x000016, // 10: Bael'Zharon's Domain — abyss
      ];
      const col = FLOOR_TINTS[Math.min(dungeonLevel - 1, FLOOR_TINTS.length - 1)];
      this.floorTintOverlay = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, col, 0.35)
        .setDepth(2).setScrollFactor(1);
    }
  }

  setMyWorldId(worldId: bigint) {
    if (this.myWorldId === worldId) return;
    this.myWorldId = worldId;
    // Clear all world-scoped entities so the new world can populate cleanly
    for (const [hex] of [...this.players]) {
      if (hex !== this.myIdentityHex) this.removePlayerSprite(hex);
    }
    for (const [id] of [...this.enemies]) this.removeEnemySprite(id);
    for (const [id] of [...this.groundItems]) this.removeGroundItem(id);
    for (const [id] of [...this.worldPortals]) this.removeWorldPortal(id);
    this.worldDebugText.setText(`World #${worldId}`);
  }

  upsertWorldPortal(portalIdStr: string, portalType: string) {
    if (this.worldPortals.has(portalIdStr)) return;

    let x: number, y: number, color: number, glow: number, lbl: string;
    if (portalType === 'to_hub') {
      x = this.myWorldType === 'dungeon' ? DUNGEON_HUB_PORTAL_X : PORTAL_HUB_X;
      y = this.myWorldType === 'dungeon' ? DUNGEON_HUB_PORTAL_Y : PORTAL_HUB_Y;
      color = 0x4488ee; glow = 0x88bbff; lbl = 'HUB';
    } else if (portalType === 'to_grind') {
      x = PORTAL_GRIND_X; y = PORTAL_GRIND_Y;
      color = 0x44aa44;   glow = 0x88ff88;  lbl = 'GRIND';
    } else if (portalType === 'to_home') {
      x = PORTAL_HOME_X;  y = PORTAL_HOME_Y;
      color = 0xccaa00;   glow = 0xffdd44;  lbl = 'HOME';
    } else if (portalType.startsWith('to_dungeon_')) {
      const level = parseInt(portalType.split('_')[2], 10);
      if (this.myWorldType === 'dungeon') {
        // Next-floor exit portal — at the far end of the dungeon arena
        x = DUNGEON_EXIT_PORTAL_X; y = DUNGEON_EXIT_PORTAL_Y;
      } else {
        // Hub world — 5×2 grid layout
        const col = (level - 1) % 5;
        const row = Math.floor((level - 1) / 5);
        x = HUB_DUNGEON_X_START + col * HUB_DUNGEON_X_STEP;
        y = row === 0 ? HUB_DUNGEON_Y1 : HUB_DUNGEON_Y2;
      }
      color = 0xaa44ee; glow = 0xdd88ff; lbl = `FL ${level}`;
    } else {
      return; // unknown portal type — skip rendering
    }

    const ring1 = this.add.circle(x, y, 26, color, 0.25).setDepth(9);
    const ring2 = this.add.circle(x, y, 16, color, 0).setDepth(9)
      .setStrokeStyle(2, glow, 0.9);

    const label = this.add.text(x, y - 36, lbl, {
      fontSize: '9px', color: `#${glow.toString(16).padStart(6, '0')}`,
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(20);

    const prompt = this.add.text(x, y - 50, `[F] → ${lbl}`, {
      fontSize: '10px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
      backgroundColor: '#000000cc',
      padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(20).setVisible(false);

    this.tweens.add({ targets: ring1, alpha: 0.6, scaleX: 1.4, scaleY: 1.4, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tweens.add({ targets: ring2, angle: 360, duration: 3000, repeat: -1 });

    this.worldPortals.set(portalIdStr, { ring1, ring2, label, prompt });
    this.activePortalId = portalIdStr;
  }

  updatePortalLabel(portalIdStr: string, label: string) {
    const entry = this.worldPortals.get(portalIdStr);
    if (!entry) return;
    entry.prompt.setText(label);
  }

  removeWorldPortal(portalIdStr: string) {
    const entry = this.worldPortals.get(portalIdStr);
    if (!entry) return;
    this.tweens.killTweensOf(entry.ring1);
    this.tweens.killTweensOf(entry.ring2);
    entry.ring1.destroy(); entry.ring2.destroy();
    entry.label.destroy(); entry.prompt.destroy();
    this.worldPortals.delete(portalIdStr);
    if (this.activePortalId === portalIdStr) this.activePortalId = null;
  }

  // Expanding ring burst on death
  private showDeathBurst(x: number, y: number, color: number, size: number) {
    const ring = this.add.circle(x, y, size * 0.6, color, 0.8).setDepth(22);
    this.tweens.add({
      targets: ring, scaleX: 4, scaleY: 4, alpha: 0,
      duration: 380, ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });
    // Small secondary flash
    const flash = this.add.circle(x, y, size * 0.3, 0xffffff, 0.6).setDepth(23);
    this.tweens.add({
      targets: flash, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 200, ease: 'Quad.Out',
      onComplete: () => flash.destroy(),
    });
  }
}
