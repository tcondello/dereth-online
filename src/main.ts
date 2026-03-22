import Phaser from 'phaser';
import { Identity } from 'spacetimedb';
import { DbConnection, ErrorContext, EventContext } from './module_bindings/index.js';
import {
  signOut as firebaseSignOut,
  onAuthStateChange, getCurrentUser,
  loadStoredToken, saveStoredToken,
} from './lib/auth';
import { GameScene } from './game/scenes/GameScene';
import { CharacterCreate, CharacterData } from './ui/CharacterCreate';
import { HubScreen, CharacterState, ItemData } from './ui/HubScreen';
import { InGamePanel } from './ui/InGamePanel';
import { TopBar } from './ui/TopBar';
import { SettingsPanel } from './ui/SettingsPanel';
import { BottomHud } from './ui/BottomHud';
import { MobileActions } from './ui/MobileActions';
import { CharacterSelect } from './ui/CharacterSelect';
import { LoginScreen } from './ui/LoginScreen';

const SPACETIMEDB_URI = import.meta.env.VITE_SPACETIMEDB_URI ?? 'wss://maincloud.spacetimedb.com';
const DB_NAME         = import.meta.env.VITE_DB_NAME ?? 'my-spacetime-app-7dl29';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [GameScene],
};

const game = new Phaser.Game(config);

// Local cache: identity hex → username
const playerNames = new Map<string, string>();

// Live connection reference — closures in screen callbacks capture this
let conn: DbConnection | null = null;
let myIdentityHex: string | null = null;
let myWorldId: bigint | null = null;
let activeCharId: bigint = 0n;
let worldTransitioning = false;
let highestFloorCleared = 0;

// ── Screen overlays ────────────────────────────────────────────────────────────

const loginScreen = new LoginScreen(
  // onAuthSuccess — any auth method succeeded; onAuthStateChange will call showSignedIn
  () => { /* onAuthStateChange handles UI transition */ },
  // onEnter — user is signed in and clicks ENTER DERETH
  async () => {
    try {
      await initiateConnection();
    } catch (err: any) {
      loginScreen.showError(err.message ?? 'Connection failed');
    }
  },
);

const charCreate = new CharacterCreate((data: CharacterData) => {
  conn?.reducers.createCharacter(data);
});

const charSelect = new CharacterSelect(
  (id) => conn?.reducers.selectCharacter({ characterId: id }),
  () => charCreate.show(),
);

const inGamePanel = new InGamePanel({
  onSpendXp:      (attr)    => conn?.reducers.spendXp({ attribute: attr }),
  onSpendSkillXp: (skillId) => conn?.reducers.spendSkillXp({ skillId }),
  onEquipItem:    (id)      => conn?.reducers.equipItem({ itemId: id }),
  onUnequipItem:  (id)      => conn?.reducers.unequipItem({ itemId: id }),
});

const bottomHud = new BottomHud();

const mobileActions = new MobileActions({
  onPortal:    () => gameScene?.events.emit('mobileEnterPortal'),
  onRecall:    () => gameScene?.events.emit('mobileTogglePortalCast'),
  onCharPanel: () => gameScene?.events.emit('toggleCharPanel'),
  onRespawn:   () => gameScene?.events.emit('respawnPlayer'),
});

const settingsPanel = new SettingsPanel({
  onRadarToggle:    (v) => gameScene?.setRadarVisible(v),
  onPixelArtToggle: (v) => gameScene?.setPixelArtMode(v),
});

const topBar = new TopBar({
  onSettings: () => settingsPanel.toggle(),
  onLogout:   () => handleLogout(),
});

const hubScreen = new HubScreen({
  onDeploy:          ()        => conn?.reducers.deployPlayer({}),
  onSpendXp:         (attr)    => conn?.reducers.spendXp({ attribute: attr }),
  onSpendSkillXp:    (skillId) => conn?.reducers.spendSkillXp({ skillId }),
  onEquipItem:       (id)      => conn?.reducers.equipItem({ itemId: id }),
  onUnequipItem:     (id)      => conn?.reducers.unequipItem({ itemId: id }),
  onSalvageItem:     (id)      => conn?.reducers.salvageItem({ itemId: id }),
  onSpendToken:      ()        => conn?.reducers.spendToken({}),
  onSpawnTestLoot:   ()        => conn?.reducers.spawnTestLoot({}),
  onEnterDungeon:    (level)   => conn?.reducers.enterDungeon({ level }),
  onSwitchCharacter: ()        => handleSwitchCharacter(),
  onLogout:          ()        => handleLogout(),
});

// ── Screen routing ─────────────────────────────────────────────────────────────

function getMyChars() {
  if (!conn || !myIdentityHex) return [];
  return [...conn.db.character.iter()]
    .filter(c => c.identity.toHexString() === myIdentityHex)
    .map(c => ({ id: c.id, charName: c.charName, race: c.race, level: c.level }));
}

function updateScreen(scene: GameScene) {
  if (!conn || !myIdentityHex) return;

  if (activeCharId === 0n) {
    // No active character — show character select
    charCreate.hide();
    hubScreen.hide();
    charSelect.show(getMyChars());
    return;
  }

  charSelect.hide();
  charCreate.hide();

  // Find active character row
  const myChar = [...conn.db.character.iter()].find(c => c.id === activeCharId);

  if (!myChar) {
    // Active char not found (shouldn't happen) — fall back to select
    activeCharId = 0n;
    charSelect.show(getMyChars());
    return;
  }

  if (!myChar.deployed) {
    // Between runs — show hub (Lifestone)
    inGamePanel.hide();
    topBar.hide();
    bottomHud.hide();
    mobileActions.hide();
    scene.hideMobileControls();
    settingsPanel.hide();
    hubScreen.show(charToState(myChar), getMyItems(), highestFloorCleared);
    // Clear game-side dead overlay so it doesn't bleed through hub
    scene.updatePlayerHealth(myIdentityHex, 1, myChar.attrEnd);
    return;
  }

  // Deployed — in game
  hubScreen.hide();
  topBar.show();
  bottomHud.show();
  mobileActions.show();
  scene.setBottomHud(bottomHud);
  scene.setMobileActions(mobileActions);
  scene.showMobileControls();
  // Apply saved settings when first deploying
  scene.setRadarVisible(settingsPanel.getRadarOn());
  scene.setPixelArtMode(settingsPanel.getPixelArtOn());
  const equipped = getMyItems().filter(i => i.location === 'equipped');
  scene.updateGearHud(equipped);
  // Pre-populate myEquippedPx so the sprite is baked with gear from the moment it spawns
  scene.rebakeLocalPlayerSprite(equipped);
}

function charToState(char: any): CharacterState {
  return {
    charName:   char.charName,   race:       char.race,
    level:      char.level,      totalXp:    char.totalXp,
    unspentXp:  char.unspentXp,  tokens:     char.tokens,
    earnedCredits: char.earnedCredits,
    attrStr:    char.attrStr,    attrEnd:    char.attrEnd,    attrCoord:  char.attrCoord,
    attrQuick:  char.attrQuick,  attrFoc:    char.attrFoc,    attrSelf:   char.attrSelf,
    raisedStr:  char.raisedStr,  raisedEnd:  char.raisedEnd,  raisedCoord: char.raisedCoord,
    raisedQuick: char.raisedQuick, raisedFoc: char.raisedFoc, raisedSelf: char.raisedSelf,
    skillHeavy: char.skillHeavy, skillLight: char.skillLight, skillMissile: char.skillMissile,
    skillWarMagic: char.skillWarMagic, skillLifeMagic: char.skillLifeMagic, skillItemMagic: char.skillItemMagic,
    skillMeleeDef: char.skillMeleeDef, skillRun: char.skillRun, skillAlchemy: char.skillAlchemy,
    raisedSkillHeavy: char.raisedSkillHeavy, raisedSkillLight: char.raisedSkillLight,
    raisedSkillMissile: char.raisedSkillMissile, raisedSkillWarMagic: char.raisedSkillWarMagic,
    raisedSkillLifeMagic: char.raisedSkillLifeMagic, raisedSkillItemMagic: char.raisedSkillItemMagic,
    raisedSkillMeleeDef: char.raisedSkillMeleeDef, raisedSkillRun: char.raisedSkillRun,
    raisedSkillAlchemy: char.raisedSkillAlchemy,
  };
}

function rowToItemData(row: any): ItemData {
  return {
    id: row.id, slot: row.slot, itemName: row.itemName, icon: row.icon,
    rarity: row.rarity, stat: row.stat, val: row.val,
    bonusStat: row.bonusStat, bonusVal: row.bonusVal, location: row.location,
    itemType: row.itemType ?? '', paletteGame: row.paletteGame ?? '',
  };
}

function getMyItems(): ItemData[] {
  if (!conn || !myIdentityHex) return [];
  return [...conn.db.item.iter()]
    .filter(it => it.ownerId.toHexString() === myIdentityHex && it.location !== 'ground')
    .map(rowToItemData);
}

// Refresh hub screen / in-game panel when character/item/XP data changes
function refreshHub() {
  if (!conn || !myIdentityHex || activeCharId === 0n) return;
  const myChar = [...conn.db.character.iter()].find(c => c.id === activeCharId);
  if (!myChar) return;
  if (!myChar.deployed) {
    hubScreen.update(charToState(myChar), getMyItems(), highestFloorCleared);
  }
  inGamePanel.update(charToState(myChar), getMyItems());
}

// ── Phaser ready ───────────────────────────────────────────────────────────────

let gameScene: GameScene | null = null;

function handleSwitchCharacter() {
  if (!gameScene) return;
  hubScreen.hide();
  activeCharId = 0n;
  charSelect.show(getMyChars());
}

function handleLogout() {
  if (conn) conn.reducers.logout({});
  localStorage.removeItem('auth_token');
  firebaseSignOut().finally(() => setTimeout(() => window.location.reload(), 300));
}

async function initiateConnection() {
  if (!gameScene) return;
  const scene = gameScene;

  // Prefer Firestore token (tied to Google identity) — fall back to localStorage cache
  const fbUser = getCurrentUser();
  let token: string | undefined = localStorage.getItem('auth_token') ?? undefined;
  if (fbUser) {
    const stored = await loadStoredToken(fbUser.uid);
    if (stored) token = stored;
  }

  conn = DbConnection.builder()
    .withUri(SPACETIMEDB_URI)
    .withDatabaseName(DB_NAME)
    .withToken(token)
    .onConnect((c: DbConnection, identity: Identity, issuedToken: string) => {
      conn = c;
      localStorage.setItem('auth_token', issuedToken);
      // Persist the token to Firestore linked to this Google account
      const currentFbUser = getCurrentUser();
      if (currentFbUser) {
        saveStoredToken(currentFbUser.uid, issuedToken).catch(console.error);
      }
      myIdentityHex = identity.toHexString();
      scene.setMyIdentity(myIdentityHex);
      loginScreen.hide();

      // Subscribe to world-scoped tables once we know the player's world
      function subscribeToWorld(worldId: bigint) {
        if (myWorldId === worldId) return;
        myWorldId = worldId;
        worldTransitioning = true;
        scene.setMyWorldId(worldId);
        conn!.subscriptionBuilder()
          .onApplied(() => {
            worldTransitioning = false;
            // Render initial player positions in this world
            for (const pos of conn!.db.playerPosition.iter()) {
              if (pos.worldId !== worldId) continue;
              const hex = pos.identity.toHexString();
              const p = [...conn!.db.player.iter()].find(pl => pl.identity.toHexString() === hex);
              const charRow = p && p.activeCharacterId > 0n ? [...conn!.db.character.iter()].find(c => c.id === p.activeCharacterId) : undefined;
              scene.upsertPlayerSprite(hex, pos.x, pos.y, playerNames.get(hex) ?? 'Traveler', charRow?.race ?? 'aluvian');
            }
            // Render initial enemies in this world
            for (const e of conn!.db.enemy.iter()) {
              if (e.worldId !== worldId) continue;
              scene.upsertEnemySprite(e.id.toString(), e.x, e.y, e.currentHp, e.maxHp, e.enemyType, e.isBoss, e.bossLevel);
            }
            // Set world type so portals render at the correct positions
            for (const w of conn!.db.world.iter()) {
              if (w.id === worldId) { scene.setMyWorldType(w.worldType); break; }
            }
            // Render portals in this world
            for (const wp of conn!.db.worldPortal.iter()) {
              if (wp.worldId !== worldId) continue;
              scene.upsertWorldPortal(wp.id.toString(), wp.portalType);
            }
            // Render ground items for this world (cleared by setMyWorldId on world change)
            for (const it of conn!.db.item.iter()) {
              if (it.location !== 'ground' || it.worldId !== worldId) continue;
              scene.upsertGroundItem(it.id.toString(), it.groundX, it.groundY, it.icon, it.rarity, it.itemType ?? '', it.paletteGame ?? '', it.stat, it.val, it.bonusStat, it.bonusVal);
            }
          })
          .subscribe([
            `SELECT * FROM player_position WHERE world_id = ${worldId}`,
            `SELECT * FROM enemy WHERE world_id = ${worldId}`,
            `SELECT * FROM world_portal WHERE world_id = ${worldId}`,
          ]);
      }

      conn.subscriptionBuilder()
        .onApplied(() => {
          // Seed name cache
          for (const p of conn!.db.player.iter()) {
            playerNames.set(p.identity.toHexString(), p.username);
          }
          // Render initial health
          for (const hp of conn!.db.playerHealth.iter()) {
            scene.updatePlayerHealth(hp.identity.toHexString(), hp.currentHp, hp.maxHp);
          }
          // Sync my world state from world table
          for (const w of conn!.db.world.iter()) {
            if (myWorldId !== null && w.id === myWorldId) {
              scene.setMyWorldType(w.worldType);
              scene.updateGameState(w.isActive, w.waveNumber, Number(w.nextWaveAtMicros / 1000n), w.waveName, w.wavePhase);
            }
          }
          // Sync portal casts (in case we reconnected mid-cast)
          for (const pc of conn!.db.portalCast.iter()) {
            if (pc.identity.toHexString() === myIdentityHex) {
              scene.setPortalCast(
                Number(pc.startedAtMicros / 1000n),
                Number(pc.completesAtMicros / 1000n),
              );
            }
          }
          // Ground items are rendered per-world in subscribeToWorld's onApplied
          // Seed activeCharId from the player row
          const myPlayerRow = [...conn!.db.player.iter()].find(p => p.identity.toHexString() === myIdentityHex);
          if (myPlayerRow) activeCharId = myPlayerRow.activeCharacterId;
          // Seed highestFloorCleared from player_progress
          if (activeCharId > 0n) {
            for (const pp of conn!.db.playerProgress.iter()) {
              if (pp.characterId === activeCharId) { highestFloorCleared = pp.highestFloorCleared; break; }
            }
          }
          // If already deployed (reconnect), subscribe to world-scoped tables
          if (activeCharId > 0n) {
            const myChar = [...conn!.db.character.iter()].find(c => c.id === activeCharId);
            if (myChar && myChar.currentWorldId > 0n) subscribeToWorld(myChar.currentWorldId);
          }
          // Route to correct screen based on character state
          updateScreen(scene);
        })
        .subscribe([
          'SELECT * FROM player',
          'SELECT * FROM player_health',
          'SELECT * FROM character',
          'SELECT * FROM item',
          'SELECT * FROM portal_cast',
          'SELECT * FROM world',
          'SELECT * FROM player_progress',
        ]);

      // ── Player table ────────────────────────────────────────────────────────
      conn.db.player.onInsert((_ctx: EventContext, row) => {
        playerNames.set(row.identity.toHexString(), row.username);
        if (row.identity.toHexString() === myIdentityHex) {
          activeCharId = row.activeCharacterId;
        }
      });
      conn.db.player.onUpdate((_ctx: EventContext, _old, row) => {
        playerNames.set(row.identity.toHexString(), row.username);
        if (row.identity.toHexString() === myIdentityHex) {
          activeCharId = row.activeCharacterId;
          updateScreen(scene);
        }
      });
      conn.db.player.onDelete((_ctx: EventContext, row) => {
        const hex = row.identity.toHexString();
        playerNames.delete(hex);
        scene.removePlayerSprite(hex);
      });

      // ── Position table ──────────────────────────────────────────────────────
      const getCharForIdentity = (hex: string) => {
        const p = [...conn!.db.player.iter()].find(pl => pl.identity.toHexString() === hex);
        if (!p || p.activeCharacterId === 0n) return undefined;
        return [...conn!.db.character.iter()].find(c => c.id === p.activeCharacterId);
      };

      conn.db.playerPosition.onInsert((_ctx: EventContext, row) => {
        if (myWorldId === null || row.worldId !== myWorldId) return;
        const hex = row.identity.toHexString();
        const charRow = getCharForIdentity(hex);
        scene.upsertPlayerSprite(hex, row.x, row.y, playerNames.get(hex) ?? 'Traveler', charRow?.race ?? 'aluvian');
      });
      conn.db.playerPosition.onUpdate((_ctx: EventContext, old, row) => {
        const hex = row.identity.toHexString();
        if (myWorldId === null) return;
        // Player left our world — remove their sprite
        if (old.worldId === myWorldId && row.worldId !== myWorldId) {
          scene.removePlayerSprite(hex);
          return;
        }
        if (row.worldId !== myWorldId) return;
        const charRow = getCharForIdentity(hex);
        scene.upsertPlayerSprite(hex, row.x, row.y, playerNames.get(hex) ?? 'Traveler', charRow?.race ?? 'aluvian');
      });
      conn.db.playerPosition.onDelete((_ctx: EventContext, row) => {
        scene.removePlayerSprite(row.identity.toHexString());
      });

      // ── Health table ────────────────────────────────────────────────────────
      conn.db.playerHealth.onInsert((_ctx: EventContext, row) => {
        scene.updatePlayerHealth(row.identity.toHexString(), row.currentHp, row.maxHp);
      });
      conn.db.playerHealth.onUpdate((_ctx: EventContext, _old, row) => {
        scene.updatePlayerHealth(row.identity.toHexString(), row.currentHp, row.maxHp);
      });

      // ── Character table ─────────────────────────────────────────────────────
      conn.db.character.onInsert((_ctx: EventContext, row) => {
        if (row.identity.toHexString() !== myIdentityHex) return;
        // A new character was created for this account — updateScreen will be triggered
        // by the subsequent player.onUpdate (auto-select) or immediately if already active
        if (row.id === activeCharId) {
          scene.setPlayerStats(row.level, row.unspentXp);
          if (row.currentWorldId > 0n) subscribeToWorld(row.currentWorldId);
          updateScreen(scene);
        } else {
          // Refresh charSelect slot list
          updateScreen(scene);
        }
      });
      conn.db.character.onUpdate((_ctx: EventContext, old, row) => {
        if (row.id !== activeCharId) return;
        if (row.level > old.level) scene.showLevelUp(row.level);
        scene.setPlayerStats(row.level, row.unspentXp);
        if (row.currentWorldId > 0n && row.currentWorldId !== old.currentWorldId) {
          subscribeToWorld(row.currentWorldId);
        }
        updateScreen(scene);
        if (row.deployed) {
          const equipped = getMyItems().filter(i => i.location === 'equipped');
          scene.updateGearHud(equipped);
        }
      });

      // ── Item table ──────────────────────────────────────────────────────────
      conn.db.item.onInsert((_ctx: EventContext, row) => {
        const idStr = row.id.toString();
        if (row.location === 'ground' && myWorldId !== null && row.worldId === myWorldId) {
          scene.upsertGroundItem(idStr, row.groundX, row.groundY, row.icon, row.rarity, row.itemType ?? '', row.paletteGame ?? '', row.stat, row.val, row.bonusStat, row.bonusVal);
        }
        if (row.ownerId.toHexString() === myIdentityHex) {
          refreshHub();
          if (row.location === 'equipped') {
            const equipped = getMyItems().filter(i => i.location === 'equipped');
            scene.updateGearHud(equipped);
            scene.rebakeLocalPlayerSprite(equipped);
          }
        }
      });
      conn.db.item.onUpdate((_ctx: EventContext, old, row) => {
        const idStr = row.id.toString();
        // Update ground item visibility (only render items in the current world)
        if (row.location === 'ground' && myWorldId !== null && row.worldId === myWorldId) {
          scene.upsertGroundItem(idStr, row.groundX, row.groundY, row.icon, row.rarity, row.itemType ?? '', row.paletteGame ?? '', row.stat, row.val, row.bonusStat, row.bonusVal);
        } else if (old.location === 'ground') {
          scene.removeGroundItem(idStr);
          // Show pickup toast if this item just came to me
          if (row.ownerId.toHexString() === myIdentityHex) {
            scene.showPickupToast(row.icon, row.itemName, row.rarity, row.location);
          }
        }
        if (row.ownerId.toHexString() === myIdentityHex) {
          refreshHub();
          const equipped = getMyItems().filter(i => i.location === 'equipped');
          scene.updateGearHud(equipped);
          if (row.location === 'equipped' || old.location === 'equipped') {
            scene.rebakeLocalPlayerSprite(equipped);
          }
        }
      });
      conn.db.item.onDelete((_ctx: EventContext, row) => {
        scene.removeGroundItem(row.id.toString());
        if (row.ownerId.toHexString() === myIdentityHex) {
          refreshHub();
          const equipped = getMyItems().filter(i => i.location === 'equipped');
          scene.updateGearHud(equipped);
        }
      });

      // ── World table ─────────────────────────────────────────────────────────
      conn.db.world.onInsert((_ctx: EventContext, row) => {
        if (myWorldId === null || row.id !== myWorldId) return;
        scene.updateGameState(row.isActive, row.waveNumber, Number(row.nextWaveAtMicros / 1000n), row.waveName, row.wavePhase);
      });
      conn.db.world.onUpdate((_ctx: EventContext, _old, row) => {
        if (myWorldId === null || row.id !== myWorldId) return;
        scene.setMyWorldType(row.worldType);
        scene.updateGameState(row.isActive, row.waveNumber, Number(row.nextWaveAtMicros / 1000n), row.waveName, row.wavePhase);
      });

      // ── World portal table ──────────────────────────────────────────────────
      conn.db.worldPortal.onInsert((_ctx: EventContext, row) => {
        if (myWorldId === null || row.worldId !== myWorldId) return;
        scene.upsertWorldPortal(row.id.toString(), row.portalType);
      });
      conn.db.worldPortal.onDelete((_ctx: EventContext, row) => {
        scene.removeWorldPortal(row.id.toString());
      });

      // ── Portal cast table ───────────────────────────────────────────────────
      conn.db.portalCast.onInsert((_ctx: EventContext, row) => {
        if (row.identity.toHexString() === myIdentityHex) {
          scene.setPortalCast(
            Number(row.startedAtMicros / 1000n),
            Number(row.completesAtMicros / 1000n),
          );
        }
      });
      conn.db.portalCast.onDelete((_ctx: EventContext, row) => {
        if (row.identity.toHexString() === myIdentityHex) {
          scene.clearPortalCast();
        }
      });

      // ── Player progress table ────────────────────────────────────────────────
      const syncProgress = (row: { characterId: bigint; highestFloorCleared: number }) => {
        if (row.characterId !== activeCharId) return;
        highestFloorCleared = row.highestFloorCleared;
        refreshHub();
      };
      conn.db.playerProgress.onInsert((_ctx: EventContext, row) => syncProgress(row));
      conn.db.playerProgress.onUpdate((_ctx: EventContext, _old, row) => syncProgress(row));

      // ── Enemy table ─────────────────────────────────────────────────────────
      conn.db.enemy.onInsert((_ctx: EventContext, row) => {
        if (myWorldId === null || row.worldId !== myWorldId) return;
        scene.upsertEnemySprite(row.id.toString(), row.x, row.y, row.currentHp, row.maxHp, row.enemyType, row.isBoss, row.bossLevel);
      });
      conn.db.enemy.onUpdate((_ctx: EventContext, _old, row) => {
        if (myWorldId === null || row.worldId !== myWorldId) return;
        scene.upsertEnemySprite(row.id.toString(), row.x, row.y, row.currentHp, row.maxHp, row.enemyType, row.isBoss, row.bossLevel);
      });
      conn.db.enemy.onDelete((_ctx: EventContext, row) => {
        scene.removeEnemySprite(row.id.toString());
      });

      // ── Scene → server events ───────────────────────────────────────────────
      scene.events.on('move', (x: number, y: number) => {
        if (!worldTransitioning) conn?.reducers.movePlayer({ x, y });
      });
      scene.events.on('respawnPlayer', () => {
        conn?.reducers.respawnPlayer({});
      });
      scene.events.on('toggleCharPanel', () => {
        if (!myIdentityHex || activeCharId === 0n) return;
        const myChar = [...conn!.db.character.iter()].find(c => c.id === activeCharId);
        if (!myChar || !myChar.deployed) return; // only available in-game
        inGamePanel.toggle(charToState(myChar), getMyItems());
      });
      scene.events.on('startPortalCast', () => {
        conn?.reducers.startPortalCast({});
      });
      scene.events.on('cancelPortalCast', () => {
        conn?.reducers.cancelPortalCast({});
      });
      scene.events.on('enterPortal', (portalId: bigint) => {
        conn?.reducers.enterPortal({ portalId });
      });

      // ── Mobile action button events ─────────────────────────────────────────
      scene.events.on('mobileEnterPortal', () => {
        scene.enterNearestPortal();
      });
      scene.events.on('mobileTogglePortalCast', () => {
        scene.events.emit(scene.getIsCastingPortal() ? 'cancelPortalCast' : 'startPortalCast');
      });
    })
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      console.error('SpacetimeDB connection error:', err);
      loginScreen.showError('Connection failed — check your network');
    })
    .onDisconnect((_ctx: ErrorContext, err?: Error) => {
      if (err) console.error('Disconnected:', err);
    })
    .build();
}

game.events.on('ready', () => {
  gameScene = game.scene.getScene('GameScene') as GameScene;
  loginScreen.show();
  loginScreen.showLoading();

  // Firebase auth state drives the login screen
  onAuthStateChange(user => {
    if (conn) return; // already connected — ignore further auth events
    if (user) {
      loginScreen.showSignedIn(user.displayName);
    } else {
      loginScreen.showSignedOut();
    }
  });
});
