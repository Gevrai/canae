import Phaser from 'phaser';
import { MapSystem } from '../systems/MapSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { UnitSystem } from '../systems/UnitSystem';
import { SelectionSystem } from '../systems/SelectionSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { AISystem } from '../systems/AISystem';
import type { AIDifficulty } from '../systems/AISystem';
import { HUD } from '../ui/HUD';
import { loadSettings } from '../config/settings';
import { AudioSystem } from '../systems/AudioSystem';
import type { PeerManager } from '../multiplayer/PeerManager';
import { GameSync } from '../multiplayer/GameSync';
import type { MovePayload, AttackPayload, StateSyncPayload, GameOverPayload } from '../multiplayer/GameSync';
import { resetUnitIds } from '../entities/Unit';

type BattlePhase = 'deployment' | 'battle' | 'ended';

interface BattleInitData {
  difficulty?: AIDifficulty;
  multiplayer?: boolean;
  isHost?: boolean;
  peerManager?: PeerManager;
  gameSync?: GameSync;
}

export class BattleScene extends Phaser.Scene {
  private cameraSystem!: CameraSystem;
  private unitSystem!: UnitSystem;
  private movementSystem!: MovementSystem;
  private combatSystem!: CombatSystem;
  private aiSystem!: AISystem;
  private selectionSystem!: SelectionSystem;
  private mapSystem!: MapSystem;
  private hud!: HUD;
  private phase: BattlePhase = 'deployment';
  private phaseTimer = 0;
  private victoryCheckTimer = 0;
  private battleTime = 0;
  private difficulty: AIDifficulty = 'normal';

  // Stats tracking
  private playerKills = 0;
  private playerLost = 0;
  private enemyKills = 0;
  private enemyLost = 0;
  private killTracker = new Map<number, number>();
  private lastCombatSoundTime = 0;

  // Multiplayer
  private isMultiplayer = false;
  private isHost = false;
  private peerManager: PeerManager | null = null;
  private gameSync: GameSync | null = null;
  private disconnectOverlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data?: BattleInitData): void {
    const settings = loadSettings();
    this.difficulty = data?.difficulty ?? settings.difficulty;
    this.isMultiplayer = data?.multiplayer ?? false;
    this.isHost = data?.isHost ?? false;
    this.peerManager = data?.peerManager ?? null;
    this.gameSync = data?.gameSync ?? null;
  }

  create(): void {
    resetUnitIds();
    this.phase = 'deployment';
    this.phaseTimer = 0;
    this.victoryCheckTimer = 0;
    this.battleTime = 0;
    this.playerKills = 0;
    this.playerLost = 0;
    this.enemyKills = 0;
    this.enemyLost = 0;
    this.killTracker.clear();
    this.disconnectOverlay = null;

    this.mapSystem = new MapSystem(this);
    this.unitSystem = new UnitSystem(this, this.mapSystem);
    this.movementSystem = new MovementSystem(this, this.mapSystem);
    this.combatSystem = new CombatSystem(this, this.mapSystem, this.unitSystem);

    // In multiplayer, guest controls enemy faction
    const controlledFaction = (this.isMultiplayer && !this.isHost) ? 'enemy' : 'player';
    this.selectionSystem = new SelectionSystem(
      this, this.mapSystem, this.unitSystem, this.movementSystem, this.combatSystem,
      controlledFaction, this.isMultiplayer ? this.gameSync : null,
    );

    this.aiSystem = new AISystem(
      this.unitSystem, this.movementSystem, this.combatSystem, this.mapSystem, this.difficulty,
    );

    this.unitSystem.setupInitialArmies();

    this.cameraSystem = new CameraSystem(this, this.mapSystem.mapWidthPx, this.mapSystem.mapHeightPx);

    // Pan camera to player army on start
    const playerUnits = this.unitSystem.getUnitsByFaction('player');
    if (playerUnits.length > 0) {
      let avgX = 0, avgY = 0;
      for (const u of playerUnits) {
        const pos = this.mapSystem.gridToWorld(u.col, u.row);
        avgX += pos.x;
        avgY += pos.y;
      }
      avgX /= playerUnits.length;
      avgY /= playerUnits.length;
      this.time.delayedCall(400, () => {
        this.cameraSystem.panTo(avgX, avgY, 1000);
      });
    }

    // HUD
    this.hud = new HUD(this);
    this.hud.create(this.unitSystem, this.mapSystem);

    // Combat event logging & stats
    this.combatSystem.on((event) => {
      switch (event.type) {
        case 'damage':
          if (event.attacker && event.defender && event.damage !== undefined) {
            const aName = event.attacker.unitType.charAt(0).toUpperCase() + event.attacker.unitType.slice(1);
            const dName = event.defender.unitType.charAt(0).toUpperCase() + event.defender.unitType.slice(1);
            const side = event.attacker.faction === 'player' ? '⚔' : '☠';
            this.hud.addCombatLog(`${side} ${aName} → ${dName} for ${event.damage} dmg`);
            // Sound effects (throttled)
            if (Date.now() - this.lastCombatSoundTime > 200) {
              this.lastCombatSoundTime = Date.now();
              const combatDist = Math.abs(event.attacker.col - event.defender.col) +
                Math.abs(event.attacker.row - event.defender.row);
              if (combatDist > 1 && event.attacker.range > 1) {
                AudioSystem.getInstance().playArrowLaunch();
              } else {
                AudioSystem.getInstance().playSwordClash();
              }
            }
          }
          break;
        case 'unit_death':
          if (event.unit) {
            const name = event.unit.unitType.charAt(0).toUpperCase() + event.unit.unitType.slice(1);
            if (event.unit.faction === 'player') {
              this.playerLost++;
              this.hud.addCombatLog(`💀 Your ${name} has fallen!`);
            } else {
              this.enemyLost++;
              this.hud.addCombatLog(`💀 Enemy ${name} destroyed!`);
            }
            AudioSystem.getInstance().playUnitDeath();
            // Track kills for MVP via attacker
            const units = this.unitSystem.getUnits();
            for (const u of units) {
              if (u.attackTargetId === event.unit.id && u.faction === 'player') {
                this.killTracker.set(u.id, (this.killTracker.get(u.id) ?? 0) + 1);
              }
            }
          }
          break;
        case 'unit_route':
          if (event.unit) {
            const name = event.unit.unitType.charAt(0).toUpperCase() + event.unit.unitType.slice(1);
            const side = event.unit.faction === 'player' ? 'Your' : 'Enemy';
            this.hud.addCombatLog(`🏳 ${side} ${name} is routing!`);
          }
          break;
      }
    });

    // Selection → unit panel
    this.events.on('hud:dismiss', () => {
      this.selectionSystem.deselect();
      this.hud.showUnit(null, null, 0);
    });

    // Multiplayer setup
    if (this.isMultiplayer && this.gameSync && this.peerManager) {
      this.setupMultiplayer();
    }

    this.showDeploymentBanner();
  }

  update(_time: number, delta: number): void {
    this.cameraSystem.update();
    this.unitSystem.update(delta);

    // Update multiplayer sync
    if (this.isMultiplayer && this.gameSync) {
      this.gameSync.update(delta);
    }

    if (this.phase === 'deployment') {
      this.phaseTimer += delta;
      if (this.phaseTimer >= 2000) {
        this.phase = 'battle';
        if (!this.isMultiplayer) {
          this.aiSystem.start();
        } else if (this.isHost) {
          // Host starts game sync
          this.gameSync?.startAsHost(
            () => this.unitSystem.getUnits().map(u => GameSync.snapshotUnit(u)),
            () => this.battleTime,
          );
        }
      }
      this.hud.update(delta);
      this.updateSelectedUnit();
      return;
    }

    if (this.phase === 'battle') {
      this.battleTime += delta;
      this.combatSystem.update(delta);

      // Only run AI in solo mode
      if (!this.isMultiplayer) {
        this.aiSystem.update(delta);
      }

      this.hud.update(delta);
      this.updateSelectedUnit();

      this.victoryCheckTimer += delta;
      if (this.victoryCheckTimer >= 1000) {
        this.victoryCheckTimer -= 1000;
        const result = this.combatSystem.checkVictoryConditions();
        if (result) {
          this.phase = 'ended';
          this.aiSystem.stop();

          // In multiplayer, host notifies guest
          if (this.isMultiplayer && this.isHost && this.gameSync) {
            // Host perspective: 'victory' means player faction won
            this.gameSync.sendGameOver(result);
          }

          this.time.delayedCall(1500, () => {
            this.endBattle(result);
          });
        }
      }
    }
  }

  private endBattle(result: 'victory' | 'defeat'): void {
    // Find MVP
    let mvpName = 'None';
    let mvpKills = 0;
    for (const [_id, kills] of this.killTracker) {
      if (kills > mvpKills) {
        mvpKills = kills;
      }
    }
    for (const [id, kills] of this.killTracker) {
      if (kills === mvpKills) {
        const unit = this.unitSystem.getUnits().find(u => u.id === id);
        if (unit) {
          mvpName = unit.unitType.charAt(0).toUpperCase() + unit.unitType.slice(1);
        }
        break;
      }
    }

    // Cleanup multiplayer
    if (this.isMultiplayer) {
      this.peerManager?.disconnect();
      this.peerManager = null;
      this.gameSync = null;
    }

    this.hud.destroy();
    this.scene.start('GameOverScene', {
      result,
      playerKills: this.playerKills,
      playerLost: this.playerLost,
      enemyKills: this.enemyKills,
      enemyLost: this.enemyLost,
      duration: this.battleTime,
      mvpName,
      mvpKills,
    });
  }

  private setupMultiplayer(): void {
    if (!this.gameSync || !this.peerManager) return;

    this.gameSync.setCallbacks({
      onMoveCommand: (payload: MovePayload) => {
        if (this.isHost) {
          // Host processes guest's move commands (guest controls enemy)
          this.processRemoteMove(payload, 'enemy');
        } else {
          // Client processes host's move commands (host controls player)
          this.processRemoteMove(payload, 'player');
        }
      },
      onAttackCommand: (payload: AttackPayload) => {
        if (this.isHost) {
          this.processRemoteAttack(payload, 'enemy');
        } else {
          this.processRemoteAttack(payload, 'player');
        }
      },
      onStateSync: (payload: StateSyncPayload) => {
        if (!this.isHost) {
          this.applyStateSync(payload);
        }
      },
      onGameOver: (payload: GameOverPayload) => {
        if (!this.isHost && this.phase === 'battle') {
          this.phase = 'ended';
          // Flip result for guest
          const guestResult = payload.result === 'victory' ? 'defeat' : 'victory';
          this.time.delayedCall(1500, () => {
            this.endBattle(guestResult === 'victory' ? 'victory' : 'defeat');
          });
        }
      },
      onGameStart: () => {
        // Guest received game start confirmation
        if (!this.isHost) {
          this.gameSync?.startAsClient();
        }
      },
    });

    // Handle disconnect
    this.peerManager.onDisconnect(() => {
      if (this.phase !== 'ended') {
        this.showDisconnectOverlay();
      }
    });
  }

  private processRemoteMove(payload: MovePayload, expectedFaction: 'player' | 'enemy'): void {
    const unit = this.unitSystem.getUnits().find(u => u.id === payload.unitId);
    if (!unit || unit.faction !== expectedFaction || !unit.isAlive()) return;
    if (unit.isMoving) return;

    const path = this.movementSystem.findPath(
      unit.col, unit.row,
      payload.targetCol, payload.targetRow,
      unit.faction,
      this.unitSystem.getUnits(),
    );
    if (path.length >= 2) {
      this.movementSystem.moveUnit(unit, path, this.unitSystem);
    }
  }

  private processRemoteAttack(payload: AttackPayload, expectedFaction: 'player' | 'enemy'): void {
    const attacker = this.unitSystem.getUnits().find(u => u.id === payload.unitId);
    const target = this.unitSystem.getUnits().find(u => u.id === payload.targetUnitId);
    if (!attacker || !target) return;
    if (attacker.faction !== expectedFaction) return;
    if (!attacker.isAlive() || !target.isAlive()) return;

    this.combatSystem.attack(attacker, target);
  }

  private applyStateSync(payload: StateSyncPayload): void {
    // Correct unit state from host's authoritative snapshot
    for (const snap of payload.units) {
      const unit = this.unitSystem.getUnits().find(u => u.id === snap.id);
      if (!unit) continue;
      // Don't correct position if unit is currently animating
      if (!unit.isMoving) {
        unit.col = snap.col;
        unit.row = snap.row;
        // Update visual position
        const visual = this.unitSystem.getVisual(unit);
        if (visual) {
          const pos = this.mapSystem.gridToWorld(snap.col, snap.row);
          visual.container.setPosition(pos.x, pos.y);
        }
      }
      unit.hp = snap.hp;
      unit.morale = snap.morale;
      unit.isRouting = snap.isRouting;
      unit.attackTargetId = snap.attackTargetId;
      unit.facingAngle = snap.facingAngle;
      unit.moved = snap.moved;
      this.unitSystem.updateHealthBar(unit);
    }

    // Remove units that died on host
    const snapIds = new Set(payload.units.map(s => s.id));
    const localUnits = [...this.unitSystem.getUnits()];
    for (const unit of localUnits) {
      if (!snapIds.has(unit.id)) {
        this.unitSystem.destroyUnit(unit.id);
      }
    }
  }

  private showDisconnectOverlay(): void {
    if (this.disconnectOverlay) return;

    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0).setScrollFactor(0).setDepth(300);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
    overlay.add(dim);

    const pw = 340;
    const ph = 220;
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0xddd0b8, 1);
    panel.fillRoundedRect(px, py, pw, ph, 8);
    panel.lineStyle(2, 0x8b7355, 0.8);
    panel.strokeRoundedRect(px, py, pw, ph, 8);
    overlay.add(panel);

    overlay.add(this.add.text(width / 2, py + 30, 'Opponent Disconnected', {
      fontSize: '22px',
      color: '#8B2500',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0));

    overlay.add(this.add.text(width / 2, py + 65, 'Your opponent has left the battle.', {
      fontSize: '14px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5).setScrollFactor(0));

    // Continue vs AI button
    const continueBtn = this.createOverlayButton(width / 2, py + 115, 'Continue vs AI');
    continueBtn.on('pointerup', () => {
      this.disconnectOverlay?.destroy();
      this.disconnectOverlay = null;
      this.isMultiplayer = false;
      this.gameSync = null;
      this.peerManager?.disconnect();
      this.peerManager = null;
      // AI takes over the opponent's faction
      this.aiSystem.start();
    });
    overlay.add(continueBtn);

    // Return to Menu button
    const menuBtn = this.createOverlayButton(width / 2, py + 170, 'Return to Menu');
    menuBtn.on('pointerup', () => {
      this.disconnectOverlay?.destroy();
      this.disconnectOverlay = null;
      this.peerManager?.disconnect();
      this.peerManager = null;
      this.gameSync = null;
      this.hud.destroy();
      this.scene.start('MenuScene');
    });
    overlay.add(menuBtn);

    this.disconnectOverlay = overlay;
  }

  private createOverlayButton(x: number, y: number, label: string): Phaser.GameObjects.Container {
    const bw = 200;
    const bh = 40;
    const bg = this.add.graphics();
    bg.fillStyle(0xddd0b8, 1);
    bg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);
    bg.lineStyle(1.5, 0x8b7355, 0.7);
    bg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);

    const txt = this.add.text(0, 0, label, {
      fontSize: '16px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5).setScrollFactor(0);

    const container = this.add.container(x, y, [bg, txt]).setScrollFactor(0);
    container.setSize(bw, bh);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => { txt.setColor('#2a1a0a'); });
    container.on('pointerout', () => { txt.setColor('#4a3520'); });

    return container;
  }

  private updateSelectedUnit(): void {
    const selected = this.selectionSystem.getSelected();
    if (selected && selected.isAlive()) {
      const terrain = this.mapSystem.getTerrain(selected.col, selected.row);
      this.hud.showUnit(
        selected,
        terrain?.name ?? null,
        terrain?.defenseBonus ?? 0,
      );
    } else {
      this.hud.showUnit(null, null, 0);
    }
  }

  private showDeploymentBanner(): void {
    const { width, height } = this.scale;

    const banner = this.add.text(width / 2, height / 2, 'Battle Begins!', {
      fontSize: '48px',
      color: '#ffd700',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: banner.y - 30,
          delay: 1200,
          duration: 400,
          ease: 'Power2',
          onComplete: () => banner.destroy(),
        });
      },
    });
  }
}
