import Phaser from 'phaser';
import { MapSystem } from '../systems/MapSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { UnitSystem } from '../systems/UnitSystem';
import { SelectionSystem } from '../systems/SelectionSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';

export class BattleScene extends Phaser.Scene {
  private cameraSystem!: CameraSystem;
  private unitSystem!: UnitSystem;
  private combatSystem!: CombatSystem;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const mapSystem = new MapSystem(this);
    this.unitSystem = new UnitSystem(this, mapSystem);
    const movementSystem = new MovementSystem(this, mapSystem);
    this.combatSystem = new CombatSystem(this, mapSystem, this.unitSystem);
    new SelectionSystem(this, mapSystem, this.unitSystem, movementSystem, this.combatSystem);

    this.unitSystem.setupInitialArmies();

    this.cameraSystem = new CameraSystem(this, mapSystem.mapWidthPx, mapSystem.mapHeightPx);
  }

  update(time: number, delta: number): void {
    this.cameraSystem.update();
    this.unitSystem.update(delta);
    this.combatSystem.update(delta);

    if (time > 5000) {
      const result = this.combatSystem.checkVictoryConditions();
      if (result) {
        this.scene.start('GameOverScene', { result });
      }
    }
  }
}
