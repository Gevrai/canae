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

type BattlePhase = 'deployment' | 'battle' | 'ended';

export class BattleScene extends Phaser.Scene {
  private cameraSystem!: CameraSystem;
  private unitSystem!: UnitSystem;
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

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data?: { difficulty?: AIDifficulty }): void {
    const settings = loadSettings();
    this.difficulty = data?.difficulty ?? settings.difficulty;
  }

  create(): void {
    this.phase = 'deployment';
    this.phaseTimer = 0;
    this.victoryCheckTimer = 0;
    this.battleTime = 0;
    this.playerKills = 0;
    this.playerLost = 0;
    this.enemyKills = 0;
    this.enemyLost = 0;
    this.killTracker.clear();

    this.mapSystem = new MapSystem(this);
    this.unitSystem = new UnitSystem(this, this.mapSystem);
    const movementSystem = new MovementSystem(this, this.mapSystem);
    this.combatSystem = new CombatSystem(this, this.mapSystem, this.unitSystem);
    this.selectionSystem = new SelectionSystem(this, this.mapSystem, this.unitSystem, movementSystem, this.combatSystem);

    this.aiSystem = new AISystem(
      this.unitSystem, movementSystem, this.combatSystem, this.mapSystem, this.difficulty,
    );

    this.unitSystem.setupInitialArmies();

    this.cameraSystem = new CameraSystem(this, this.mapSystem.mapWidthPx, this.mapSystem.mapHeightPx);

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

    this.showDeploymentBanner();
  }

  update(_time: number, delta: number): void {
    this.cameraSystem.update();
    this.unitSystem.update(delta);

    if (this.phase === 'deployment') {
      this.phaseTimer += delta;
      if (this.phaseTimer >= 2000) {
        this.phase = 'battle';
        this.aiSystem.start();
      }
      this.hud.update(delta);
      this.updateSelectedUnit();
      return;
    }

    if (this.phase === 'battle') {
      this.battleTime += delta;
      this.combatSystem.update(delta);
      this.aiSystem.update(delta);
      this.hud.update(delta);
      this.updateSelectedUnit();

      this.victoryCheckTimer += delta;
      if (this.victoryCheckTimer >= 1000) {
        this.victoryCheckTimer -= 1000;
        const result = this.combatSystem.checkVictoryConditions();
        if (result) {
          this.phase = 'ended';
          this.aiSystem.stop();
          this.time.delayedCall(1500, () => {
            // Find MVP
            let mvpName = 'None';
            let mvpKills = 0;
            for (const [_id, kills] of this.killTracker) {
              if (kills > mvpKills) {
                mvpKills = kills;
              }
            }
            // Find the unit name for MVP
            for (const [id, kills] of this.killTracker) {
              if (kills === mvpKills) {
                const unit = this.unitSystem.getUnits().find(u => u.id === id);
                if (unit) {
                  mvpName = unit.unitType.charAt(0).toUpperCase() + unit.unitType.slice(1);
                }
                break;
              }
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
          });
        }
      }
    }
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
