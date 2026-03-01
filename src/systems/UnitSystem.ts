import Phaser from 'phaser';
import { Unit } from '../entities/Unit';

export class UnitSystem {
  private units: Unit[] = [];

  constructor(_scene: Phaser.Scene) {
  }

  addUnit(unit: Unit): void {
    this.units.push(unit);
  }

  removeUnit(unit: Unit): void {
    this.units = this.units.filter(u => u !== unit);
  }

  getUnits(): Unit[] {
    return this.units;
  }

  getUnitAt(col: number, row: number): Unit | undefined {
    return this.units.find(u => u.col === col && u.row === row);
  }
}
