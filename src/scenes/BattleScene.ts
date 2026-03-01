import Phaser from 'phaser';
import { MapSystem } from '../systems/MapSystem';
import { CameraSystem } from '../systems/CameraSystem';

export class BattleScene extends Phaser.Scene {
  private cameraSystem!: CameraSystem;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const mapSystem = new MapSystem(this);
    this.cameraSystem = new CameraSystem(this, mapSystem.mapWidthPx, mapSystem.mapHeightPx);
  }

  update(): void {
    this.cameraSystem.update();
  }
}
