import Phaser from 'phaser';
import { MapSystem } from '../systems/MapSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { UnitSystem } from '../systems/UnitSystem';
import { SelectionSystem } from '../systems/SelectionSystem';
import { MovementSystem } from '../systems/MovementSystem';

export class BattleScene extends Phaser.Scene {
  private cameraSystem!: CameraSystem;
  private unitSystem!: UnitSystem;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const mapSystem = new MapSystem(this);
    this.unitSystem = new UnitSystem(this, mapSystem);
    const movementSystem = new MovementSystem(this, mapSystem);
    // SelectionSystem is event-driven; Phaser's input system retains the callbacks
    new SelectionSystem(this, mapSystem, this.unitSystem, movementSystem);

    this.unitSystem.setupInitialArmies();

    this.cameraSystem = new CameraSystem(this, mapSystem.mapWidthPx, mapSystem.mapHeightPx);
  }

  update(_time: number, delta: number): void {
    this.cameraSystem.update();
    this.unitSystem.update(delta);
  }
}
