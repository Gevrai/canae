import type { UnitDef } from '../config/units.config';

export class Unit {
  public col: number;
  public row: number;
  public hp: number;
  public readonly maxHp: number;
  public readonly attack: number;
  public readonly defense: number;
  public readonly movement: number;
  public readonly range: number;
  public readonly unitType: string;
  public readonly team: number;
  public moved = false;

  constructor(def: UnitDef, col: number, row: number, team: number, unitType: string) {
    this.col = col;
    this.row = row;
    this.hp = def.maxHp;
    this.maxHp = def.maxHp;
    this.attack = def.attack;
    this.defense = def.defense;
    this.movement = def.movement;
    this.range = def.range;
    this.team = team;
    this.unitType = unitType;
  }

  isAlive(): boolean {
    return this.hp > 0;
  }

  resetTurn(): void {
    this.moved = false;
  }
}
