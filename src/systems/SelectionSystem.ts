import Phaser from 'phaser';

export class SelectionSystem {
  private selectedUnit: unknown = null;

  constructor(_scene: Phaser.Scene) {
  }

  getSelected(): unknown {
    return this.selectedUnit;
  }

  select(unit: unknown): void {
    this.selectedUnit = unit;
  }

  deselect(): void {
    this.selectedUnit = null;
  }
}
