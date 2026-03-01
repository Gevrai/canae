import Phaser from 'phaser';
import { Unit } from '../entities/Unit';

export class UnitPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(unit: Unit): void {
    this.hide();
    const { width, height } = this.scene.scale;
    const bg = this.scene.add.rectangle(width - 120, height - 80, 220, 140, 0x000000, 0.7).setScrollFactor(0);
    const text = this.scene.add.text(width - 220, height - 140, [
      unit.unitType,
      `HP: ${unit.hp}/${unit.maxHp}`,
      `ATK: ${unit.attack}  DEF: ${unit.defense}`,
      `MOV: ${unit.movement}  RNG: ${unit.range}`,
    ].join('\n'), { fontSize: '14px', color: '#ffffff' }).setScrollFactor(0);
    this.container = this.scene.add.container(0, 0, [bg, text]).setScrollFactor(0);
  }

  hide(): void {
    this.container?.destroy();
    this.container = null;
  }
}
