import type { UnitDef, Faction } from '../config/units.config';
import type { TerrainDef } from '../config/terrain.config';
import { MAP_MARGIN, TILE_SIZE } from '../config/game.config';

let nextUnitId = 1;

export function resetUnitIds(): void {
  nextUnitId = 1;
}

export class Unit {
  public readonly id: number;
  public readonly unitType: string;
  public readonly faction: Faction;

  /** World-space position */
  public x: number;
  public y: number;

  public hp: number;
  public readonly maxHp: number;
  public readonly attack: number;
  public readonly defense: number;
  public readonly speed: number;
  public readonly range: number;
  public morale: number;
  public readonly sightRange: number;
  public isSelected = false;
  public isMoving = false;
  public facingAngle = 0;
  public readonly team: number;
  public lastMoveTime = 0;
  public isRouting = false;
  public hasChargeBonus = false;
  public attackTargetId: number | null = null;

  // Stamina
  public stamina: number;
  public readonly maxStamina: number;
  public readonly staminaDrainMove: number;
  public readonly staminaDrainFight: number;
  public readonly staminaRecovery: number;

  // Continuous movement
  public targetX: number | null = null;
  public targetY: number | null = null;
  public stationaryTime = 0;
  public isBraced = false;
  public isCharging = false;
  public chargeCooldown = 0;
  public lastActionTime = 0;
  public readonly collisionRadius: number;
  public chargeDistanceAccum = 0;

  /** Compatibility: kept for path preview stubs */
  public currentPath: { col: number; row: number }[] = [];

  /** Grid column derived from world x */
  get col(): number {
    return Math.floor((this.x - MAP_MARGIN) / TILE_SIZE);
  }
  set col(c: number) {
    this.x = c * TILE_SIZE + TILE_SIZE / 2 + MAP_MARGIN;
  }

  /** Grid row derived from world y */
  get row(): number {
    return Math.floor((this.y - MAP_MARGIN) / TILE_SIZE);
  }
  set row(r: number) {
    this.y = r * TILE_SIZE + TILE_SIZE / 2 + MAP_MARGIN;
  }

  /** Compatibility stub — turn-based move flag no longer used */
  get moved(): boolean { return false; }
  set moved(_v: boolean) { /* no-op */ }

  /** Compatibility stub — tile budget no longer used */
  get movement(): number { return 5; }

  /** Compatibility stub */
  get tilesMoved(): number { return 0; }

  constructor(def: UnitDef, col: number, row: number, faction: Faction) {
    this.id = nextUnitId++;
    this.unitType = def.key;
    this.faction = faction;
    this.x = col * TILE_SIZE + TILE_SIZE / 2 + MAP_MARGIN;
    this.y = row * TILE_SIZE + TILE_SIZE / 2 + MAP_MARGIN;
    this.hp = def.maxHp;
    this.maxHp = def.maxHp;
    this.attack = def.attack;
    this.defense = def.defense;
    this.speed = def.speed;
    this.range = def.range;
    this.morale = def.morale;
    this.sightRange = def.sightRange;
    this.team = faction === 'player' ? 0 : 1;

    this.maxStamina = def.maxStamina;
    this.stamina = def.maxStamina;
    this.staminaDrainMove = def.staminaDrainMove;
    this.staminaDrainFight = def.staminaDrainFight;
    this.staminaRecovery = def.staminaRecovery;
    this.collisionRadius = def.collisionRadius;
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
    const staminaRatio = this.stamina / this.maxStamina;
    const staminaMod = staminaRatio >= 0.5 ? 1.0 : 0.5 + staminaRatio;

    let effectiveDefense = this.defense;
    let effectiveSpeed = this.speed;
    const effectiveAttack = Math.round(this.attack * staminaMod);

    if (terrain) {
      effectiveDefense = Math.floor(this.defense * (1 + terrain.defenseBonus));
      effectiveSpeed *= terrain.speedMultiplier;
      if (this.unitType === 'cavalry' && terrain.key === 'forest') {
        effectiveSpeed *= 0.5;
      }
    }

    effectiveDefense = Math.round(effectiveDefense * staminaMod);
    effectiveSpeed *= staminaMod;

    return { attack: effectiveAttack, defense: effectiveDefense, speed: effectiveSpeed };
  }
}
