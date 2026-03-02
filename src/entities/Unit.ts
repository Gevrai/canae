import type { UnitDef, Faction } from '../config/units.config';
import type { TerrainDef } from '../config/terrain.config';

let nextUnitId = 1;

export class Unit {
  public readonly id: number;
  public readonly unitType: string;
  public readonly faction: Faction;
  public col: number;
  public row: number;
  public hp: number;
  public readonly maxHp: number;
  public readonly attack: number;
  public readonly defense: number;
  public readonly speed: number;
  public readonly movement: number;
  public readonly range: number;
  public morale: number;
  public readonly sightRange: number;
  public isSelected = false;
  public isMoving = false;
  public facingAngle = 0;
  public currentPath: { col: number; row: number }[] = [];
  public moved = false;
  public readonly team: number;
  public lastMoveTime = 0;
  public tilesMoved = 0;
  public isRouting = false;
  public hasChargeBonus = false;
  public attackTargetId: number | null = null;

  constructor(def: UnitDef, col: number, row: number, faction: Faction) {
    this.id = nextUnitId++;
    this.unitType = def.key;
    this.faction = faction;
    this.col = col;
    this.row = row;
    this.hp = def.maxHp;
    this.maxHp = def.maxHp;
    this.attack = def.attack;
    this.defense = def.defense;
    this.speed = def.speed;
    this.movement = def.movement;
    this.range = def.range;
    this.morale = def.morale;
    this.sightRange = def.sightRange;
    this.team = faction === 'player' ? 0 : 1;
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  isAlive(): boolean {
    return this.hp > 0;
  }

  getEffectiveStats(terrain: TerrainDef | null): { attack: number; defense: number; speed: number } {
    let effectiveDefense = this.defense;
    let effectiveSpeed = this.speed;
    const effectiveAttack = this.attack;

    if (terrain) {
      effectiveDefense = Math.floor(this.defense * (1 + terrain.defenseBonus));
      if (this.unitType === 'cavalry' && terrain.key === 'forest') {
        effectiveSpeed *= 0.5;
      }
    }

    return { attack: effectiveAttack, defense: effectiveDefense, speed: effectiveSpeed };
  }

  resetTurn(): void {
    this.moved = false;
  }
}
