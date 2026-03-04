import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { Faction } from '../config/units.config';
import type { MapSystem } from './MapSystem';

interface GridPos {
  col: number;
  row: number;
}

export class MovementSystem {
  private scene: Phaser.Scene;
  private map: MapSystem;

  constructor(scene: Phaser.Scene, map: MapSystem) {
    this.scene = scene;
    this.map = map;
  }

  // --- Core continuous-movement update (called every frame) ---

  update(delta: number, units: Unit[]): void {
    for (const unit of units) {
      if (!unit.isAlive()) continue;

      if (unit.targetX !== null && unit.targetY !== null) {
        this.updateMovingUnit(delta, unit);
      } else if (!unit.isMoving) {
        this.updateStationaryUnit(delta, unit, units);
      }

      // Charge cooldown decay
      if (unit.chargeCooldown > 0) {
        unit.chargeCooldown = Math.max(0, unit.chargeCooldown - delta);
      }
    }

    this.resolveCollisions(units);
  }

  private updateMovingUnit(delta: number, unit: Unit): void {
    const terrain = this.map.getTerrainAtWorld(unit.x, unit.y);
    const speedMult = terrain ? terrain.speedMultiplier : 1.0;

    // Don't move into impassable terrain
    if (speedMult <= 0) {
      unit.targetX = null;
      unit.targetY = null;
      unit.isMoving = false;
      return;
    }

    // Exhaustion penalty when stamina < 30%
    let exhaustionPenalty = 1.0;
    const lowThreshold = unit.maxStamina * 0.3;
    if (unit.stamina < lowThreshold) {
      exhaustionPenalty = 0.5 + 0.5 * (unit.stamina / lowThreshold);
    }

    const effectiveSpeed = unit.speed * speedMult * exhaustionPenalty;
    const dx = unit.targetX! - unit.x;
    const dy = unit.targetY! - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      // Snap to target
      unit.x = unit.targetX!;
      unit.y = unit.targetY!;
      unit.targetX = null;
      unit.targetY = null;
      unit.isMoving = false;
      unit.lastMoveTime = this.scene.time.now;
      return;
    }

    const deltaSeconds = delta / 1000;
    const moveAmount = effectiveSpeed * deltaSeconds;
    const ratio = Math.min(moveAmount / dist, 1);

    // Check if destination would be in impassable terrain
    const nextX = unit.x + dx * ratio;
    const nextY = unit.y + dy * ratio;
    const nextTerrain = this.map.getTerrainAtWorld(nextX, nextY);
    if (nextTerrain && !nextTerrain.passable) {
      // Stop at boundary
      unit.targetX = null;
      unit.targetY = null;
      unit.isMoving = false;
      unit.lastMoveTime = this.scene.time.now;
      return;
    }

    unit.x = nextX;
    unit.y = nextY;
    unit.facingAngle = Math.atan2(dy, dx);
    unit.isMoving = true;
    unit.stationaryTime = 0;
    unit.isBraced = false;

    // Drain stamina
    const staminaDrainMult = terrain ? terrain.staminaDrainMultiplier : 1.0;
    unit.stamina = Math.max(0, unit.stamina - unit.staminaDrainMove * staminaDrainMult * deltaSeconds);

    // Track charge distance for cavalry
    if (unit.unitType === 'cavalry') {
      unit.chargeDistanceAccum += moveAmount;
      if (effectiveSpeed >= unit.speed * 0.7 && unit.chargeDistanceAccum > 0) {
        unit.isCharging = true;
      }
    }

    // Update visual
    this.syncVisualPosition(unit);
  }

  private updateStationaryUnit(delta: number, unit: Unit, units: Unit[]): void {
    unit.stationaryTime += delta;

    // Check if unit is in combat
    const inCombat = unit.attackTargetId !== null;

    // Stamina recovery: 1s delay after stopping, not in combat
    if (unit.stationaryTime > 1000 && !inCombat) {
      const terrain = this.map.getTerrainAtWorld(unit.x, unit.y);
      let recoveryRate = unit.staminaRecovery;
      if (terrain?.key === 'road') {
        recoveryRate *= 1.5;
      }
      unit.stamina = Math.min(unit.maxStamina, unit.stamina + recoveryRate * (delta / 1000));
    }

    // Infantry brace
    if (unit.unitType === 'infantry' && unit.stationaryTime >= 2000 && unit.stamina >= 15) {
      unit.isBraced = true;
    }

    // Reset charge tracking when stationary
    unit.chargeDistanceAccum = 0;
    unit.isCharging = false;

    // Suppress unused parameter warning
    void units;
  }

  private resolveCollisions(units: Unit[]): void {
    const alive = units.filter(u => u.isAlive());
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.collisionRadius + b.collisionRadius;

        if (dist < minDist && dist > 0) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const isFriendly = a.faction === b.faction;
          const strength = isFriendly ? 0.8 : 1.5;
          const push = Math.min(overlap * strength * 0.5, 4);

          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  private syncVisualPosition(_unit: Unit): void {
    // Visual sync is handled by the game loop / UnitSystem
    // This is a hook for future integration
  }

  // --- Public API ---

  setTarget(unit: Unit, x: number, y: number): void {
    unit.targetX = x;
    unit.targetY = y;
    unit.isMoving = true;
    unit.isBraced = false;
    unit.chargeDistanceAccum = 0;
  }

  // --- Compatibility stubs for consumers not yet migrated ---

  /** @deprecated Use setTarget() instead. Returns empty array. */
  findPath(
    _startCol: number, _startRow: number,
    _endCol: number, _endRow: number,
    _faction: Faction,
    _units: Unit[],
  ): GridPos[] {
    return [];
  }

  /** @deprecated No longer applicable. Returns empty array. */
  getReachableTiles(
    _col: number, _row: number, _movement: number,
    _faction: Faction, _units: Unit[],
  ): GridPos[] {
    return [];
  }

  /** @deprecated Compatibility wrapper — converts grid destination to setTarget. */
  moveUnit(unit: Unit, path: GridPos[], _unitSystem: { getVisual(u: Unit): { container: Phaser.GameObjects.Container } | undefined }): void {
    if (path.length < 2) return;
    const dest = path[path.length - 1];
    const worldPos = this.map.gridToWorld(dest.col, dest.row);
    this.setTarget(unit, worldPos.x, worldPos.y);
  }
}
