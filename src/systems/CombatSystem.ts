import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { MapSystem } from './MapSystem';
import type { UnitSystem } from './UnitSystem';

export type CombatEventType = 'combat_start' | 'damage' | 'unit_death' | 'unit_route';

export interface CombatEvent {
  type: CombatEventType;
  attacker?: Unit;
  defender?: Unit;
  damage?: number;
  unit?: Unit;
}

/** Euclidean distance between two units (pixels). */
function unitDist(a: Unit, b: Unit): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// --- Distance / range constants (px) ---
const MELEE_RANGE = 40;
const AUTO_ENGAGE_RANGE = 96;
const NEARBY_RADIUS = 128;
const DEATH_MORALE_RADIUS = 192;
const ARCHER_ISOLATION_RADIUS = 192;
const CHARGE_DISTANCE_THRESHOLD = 128;
const CHARGE_STAMINA_COST = 15;
const CHARGE_MIN_STAMINA = 20;
const CHARGE_COOLDOWN_MS = 4000;
const CHARGE_DAMAGE_MULT = 1.5;
const CHARGE_KNOCKBACK_PX = 16;
const CHARGE_MORALE_PENALTY = 8;
const BRACE_DEF_MULT = 1.35;
const BRACE_VS_CAV_MULT = 1.25;
const BRACE_CHARGE_REDUCTION = 0.5;

export class CombatSystem {
  private scene: Phaser.Scene;
  private map: MapSystem;
  private unitSystem: UnitSystem;
  private combatTickTimer = 0;
  private routingTickTimer = 0;
  private readonly TICK_INTERVAL = 1000;
  private readonly ROUTING_INTERVAL = 500;
  private listeners: ((event: CombatEvent) => void)[] = [];
  private combatIcons: Phaser.GameObjects.Graphics[] = [];

  constructor(scene: Phaser.Scene, map: MapSystem, unitSystem: UnitSystem) {
    this.scene = scene;
    this.map = map;
    this.unitSystem = unitSystem;
  }

  on(listener: (event: CombatEvent) => void): void {
    this.listeners.push(listener);
  }

  private emit(event: CombatEvent): void {
    console.log(`[Combat] ${event.type}`, {
      attacker: event.attacker?.id,
      defender: event.defender?.id,
      damage: event.damage,
      unit: event.unit?.id,
    });
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  attack(attacker: Unit, defender: Unit): void {
    if (!attacker.isAlive() || !defender.isAlive()) return;
    if (attacker.faction === defender.faction) return;

    attacker.attackTargetId = defender.id;

    // Melee: defender auto-retaliates
    const dist = unitDist(attacker, defender);
    if (dist <= MELEE_RANGE && !defender.attackTargetId) {
      defender.attackTargetId = attacker.id;
    }

    this.emit({ type: 'combat_start', attacker, defender });
  }

  update(delta: number): void {
    this.autoEngage();

    this.combatTickTimer += delta;
    if (this.combatTickTimer >= this.TICK_INTERVAL) {
      this.combatTickTimer -= this.TICK_INTERVAL;
      this.resolveCombatTicks();
      this.checkOutnumbered();
    }

    this.routingTickTimer += delta;
    if (this.routingTickTimer >= this.ROUTING_INTERVAL) {
      this.routingTickTimer -= this.ROUTING_INTERVAL;
      this.updateRoutingUnits();
    }

    this.updateMoraleRecovery(delta);
    this.updateArcherIsolationMorale(delta);
    this.updateCombatIcons();
  }

  // --- Auto-engagement ---

  private autoEngage(): void {
    const units = this.unitSystem.getUnits();
    for (const unit of units) {
      if (!unit.isAlive() || unit.isMoving || unit.isRouting || unit.attackTargetId) continue;

      for (const other of units) {
        if (!other.isAlive() || other.faction === unit.faction) continue;
        const dist = unitDist(unit, other);

        // Melee units auto-engage within AUTO_ENGAGE_RANGE
        if (unit.range <= MELEE_RANGE && dist <= AUTO_ENGAGE_RANGE) {
          unit.attackTargetId = other.id;
          this.emit({ type: 'combat_start', attacker: unit, defender: other });
          break;
        }

        // Ranged units auto-engage within their range
        if (unit.range > MELEE_RANGE && dist <= unit.range) {
          if (this.hasLineOfSight(unit.col, unit.row, other.col, other.row)) {
            unit.attackTargetId = other.id;
            this.emit({ type: 'combat_start', attacker: unit, defender: other });
            break;
          }
        }
      }
    }
  }

  // --- Combat resolution ---

  private resolveCombatTicks(): void {
    const units = this.unitSystem.getUnits().filter(
      u => u.isAlive() && u.attackTargetId && !u.isMoving && !u.isRouting,
    );

    for (const unit of units) {
      if (!unit.attackTargetId) continue;

      const target = this.unitSystem.getUnits().find(u => u.id === unit.attackTargetId);
      if (!target || !target.isAlive()) {
        unit.attackTargetId = null;
        continue;
      }

      const dist = unitDist(unit, target);

      // Range check
      if (dist > unit.range) {
        unit.attackTargetId = null;
        continue;
      }

      // LoS check for ranged
      if (unit.range > MELEE_RANGE && dist > MELEE_RANGE) {
        if (!this.hasLineOfSight(unit.col, unit.row, target.col, target.row)) {
          unit.attackTargetId = null;
          continue;
        }
      }

      const damage = this.calculateDamage(unit, target);
      target.takeDamage(damage);
      this.unitSystem.updateHealthBar(target);

      // Stamina drain for combat
      unit.stamina = Math.max(0, unit.stamina - unit.staminaDrainFight);

      this.showDamageNumber(target, damage);
      this.showHitFlash(target);

      if (dist > MELEE_RANGE) {
        this.showProjectile(unit, target);
      }

      this.applyMoraleDamage(target, damage);
      this.emit({ type: 'damage', attacker: unit, defender: target, damage });

      if (!target.isAlive()) {
        this.handleUnitDeath(target);
      }
    }
  }

  private calculateDamage(attacker: Unit, defender: Unit): number {
    const attackerTerrain = this.map.getTerrain(attacker.col, attacker.row);
    const defenderTerrain = this.map.getTerrain(defender.col, defender.row);

    // Effective stats include stamina modifier
    const aStats = attacker.getEffectiveStats(attackerTerrain);
    const dStats = defender.getEffectiveStats(defenderTerrain);

    // --- Charge ---
    let chargeMult = 1.0;
    let chargeTriggered = false;
    if (
      attacker.isCharging &&
      attacker.chargeDistanceAccum >= CHARGE_DISTANCE_THRESHOLD &&
      attacker.stamina >= CHARGE_MIN_STAMINA &&
      attacker.chargeCooldown <= 0
    ) {
      chargeMult = CHARGE_DAMAGE_MULT;
      chargeTriggered = true;
    }

    // --- Flank ---
    const flankMult = this.getFlankMultiplier(attacker, defender);

    // --- Brace ---
    let braceMult = 1.0;
    let braceNegatesKnockback = false;
    if (defender.isBraced) {
      braceMult = BRACE_DEF_MULT;
      if (attacker.unitType === 'cavalry') {
        braceMult *= BRACE_VS_CAV_MULT; // 1.35 * 1.25 = 1.69
      }
      if (chargeTriggered) {
        chargeMult = Math.max(1.0, chargeMult - BRACE_CHARGE_REDUCTION); // 1.5 → 1.0
        braceNegatesKnockback = true;
      }
    }

    // --- Archer proximity defense ---
    const archerDefMod = this.getArcherProximityDefense(defender);

    // --- Height ---
    const heightMult = this.getHeightBonus(attacker, defender);

    // --- Archer in melee penalty ---
    const dist = unitDist(attacker, defender);
    const archerMeleePenalty = (attacker.unitType === 'archer' && dist <= MELEE_RANGE) ? 0.6 : 1.0;

    // --- Low morale ---
    const moraleMod = attacker.morale < 50 ? 0.8 : 1.0;

    // Effective attack
    const effectiveAttack = aStats.attack * chargeMult * flankMult * heightMult * archerMeleePenalty * moraleMod;

    // Effective defense (terrain already applied in getEffectiveStats)
    const effectiveDefense = dStats.defense * braceMult * archerDefMod;

    let rawDamage = effectiveAttack - effectiveDefense;

    // Forest reduces ranged damage
    if (attacker.range > MELEE_RANGE && dist > MELEE_RANGE && defenderTerrain?.key === 'forest') {
      rawDamage *= 0.7;
    }

    const randomFactor = 0.85 + Math.random() * 0.3; // 0.85 to 1.15

    const finalDamage = Math.round(Math.max(1, rawDamage * randomFactor));

    // Apply charge side-effects after damage calc
    if (chargeTriggered) {
      attacker.stamina = Math.max(0, attacker.stamina - CHARGE_STAMINA_COST);
      attacker.chargeCooldown = CHARGE_COOLDOWN_MS;
      attacker.chargeDistanceAccum = 0;
      attacker.isCharging = false;

      // Knockback
      if (!braceNegatesKnockback) {
        const dx = defender.x - attacker.x;
        const dy = defender.y - attacker.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        defender.x += (dx / len) * CHARGE_KNOCKBACK_PX;
        defender.y += (dy / len) * CHARGE_KNOCKBACK_PX;
      }

      // Morale penalty on target
      defender.morale = Math.max(0, defender.morale - CHARGE_MORALE_PENALTY);
      if (defender.morale < 25 && !defender.isRouting) {
        defender.isRouting = true;
        defender.attackTargetId = null;
        this.emit({ type: 'unit_route', unit: defender });
      }
    }

    return finalDamage;
  }

  /** Multiplicative flank bonus (design doc §10). */
  private getFlankMultiplier(attacker: Unit, defender: Unit): number {
    const attackAngle = Math.atan2(
      attacker.y - defender.y,
      attacker.x - defender.x,
    );

    let angleDiff = Math.abs(attackAngle - defender.facingAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

    if (angleDiff > 2.09) return 1.5;  // Rear: >120°
    if (angleDiff > 1.05) return 1.3;  // Side: >60°
    return 1.0;
  }

  private getHeightBonus(attacker: Unit, defender: Unit): number {
    const aTerrain = this.map.getTerrain(attacker.col, attacker.row);
    const dTerrain = this.map.getTerrain(defender.col, defender.row);
    return (aTerrain?.key === 'hills' && dTerrain?.key !== 'hills') ? 1.15 : 1.0;
  }

  /** Archer proximity defense modifier (design doc §5). */
  private getArcherProximityDefense(defender: Unit): number {
    if (defender.unitType !== 'archer') return 1.0;

    const units = this.unitSystem.getUnits();
    let nearbyCount = 0;
    for (const other of units) {
      if (other === defender || !other.isAlive()) continue;
      if (other.faction !== defender.faction) continue;
      if (other.unitType === 'archer') continue;
      if (unitDist(defender, other) <= NEARBY_RADIUS) {
        nearbyCount++;
      }
    }

    if (nearbyCount === 0) return 0.6;
    return Math.min(1.0 + 0.2 * (nearbyCount - 1), 1.4);
  }

  hasLineOfSight(fromCol: number, fromRow: number, toCol: number, toRow: number): boolean {
    const dx = Math.abs(toCol - fromCol);
    const dy = Math.abs(toRow - fromRow);
    const sx = fromCol < toCol ? 1 : -1;
    const sy = fromRow < toRow ? 1 : -1;
    let err = dx - dy;
    let cx = fromCol;
    let cy = fromRow;

    while (cx !== toCol || cy !== toRow) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
      if (cx === toCol && cy === toRow) break;

      const terrain = this.map.getTerrain(cx, cy);
      if (terrain?.blocksLoS) return false;
    }
    return true;
  }

  // --- Morale ---

  private applyMoraleDamage(unit: Unit, damage: number): void {
    const moraleLoss = Math.max(1, Math.floor(damage * 0.3));
    unit.morale = Math.max(0, unit.morale - moraleLoss);

    if (unit.morale < 25 && !unit.isRouting) {
      unit.isRouting = true;
      unit.attackTargetId = null;
      this.emit({ type: 'unit_route', unit });
    }
  }

  private checkOutnumbered(): void {
    const units = this.unitSystem.getUnits();
    for (const unit of units) {
      if (!unit.isAlive() || unit.isRouting) continue;

      let nearbyFriendly = 0;
      let nearbyEnemy = 0;
      for (const other of units) {
        if (other === unit || !other.isAlive()) continue;
        const dist = unitDist(unit, other);
        if (dist <= NEARBY_RADIUS) {
          if (other.faction === unit.faction) nearbyFriendly++;
          else nearbyEnemy++;
        }
      }

      if (nearbyEnemy > 0 && nearbyEnemy >= (nearbyFriendly + 1) * 2) {
        unit.morale = Math.max(0, unit.morale - 5);
        if (unit.morale < 25 && !unit.isRouting) {
          unit.isRouting = true;
          unit.attackTargetId = null;
          this.emit({ type: 'unit_route', unit });
        }
      }
    }
  }

  private updateMoraleRecovery(delta: number): void {
    const units = this.unitSystem.getUnits();
    for (const unit of units) {
      if (!unit.isAlive() || unit.isRouting || unit.attackTargetId) continue;

      let nearFriendly = false;
      for (const other of units) {
        if (other === unit || !other.isAlive() || other.faction !== unit.faction) continue;
        if (unitDist(unit, other) <= NEARBY_RADIUS) { nearFriendly = true; break; }
      }

      if (nearFriendly && unit.morale < 100) {
        unit.morale = Math.min(100, unit.morale + (delta / 1000) * 2);
      }
    }
  }

  /** Isolated archers lose morale at 3/s (design doc §5). */
  private updateArcherIsolationMorale(delta: number): void {
    const units = this.unitSystem.getUnits();
    for (const unit of units) {
      if (!unit.isAlive() || unit.isRouting || unit.unitType !== 'archer') continue;

      let hasFriendlyNearby = false;
      for (const other of units) {
        if (other === unit || !other.isAlive() || other.faction !== unit.faction) continue;
        if (unitDist(unit, other) <= ARCHER_ISOLATION_RADIUS) { hasFriendlyNearby = true; break; }
      }

      if (!hasFriendlyNearby) {
        unit.morale = Math.max(0, unit.morale - (delta / 1000) * 3);
        if (unit.morale < 25 && !unit.isRouting) {
          unit.isRouting = true;
          unit.attackTargetId = null;
          this.emit({ type: 'unit_route', unit });
        }
      }
    }
  }

  // --- Death handling ---

  private handleUnitDeath(unit: Unit): void {
    unit.attackTargetId = null;
    this.emit({ type: 'unit_death', unit });

    // Morale penalty to nearby friendlies (192px)
    const units = this.unitSystem.getUnits();
    for (const other of units) {
      if (!other.isAlive() || other.faction !== unit.faction) continue;
      if (unitDist(other, unit) <= DEATH_MORALE_RADIUS) {
        other.morale = Math.max(0, other.morale - 10);
        if (other.morale < 25 && !other.isRouting) {
          other.isRouting = true;
          other.attackTargetId = null;
          this.emit({ type: 'unit_route', unit: other });
        }
      }
    }

    // Clear anyone targeting this unit
    for (const other of units) {
      if (other.attackTargetId === unit.id) {
        other.attackTargetId = null;
      }
    }

    this.playDeathAnimation(unit);
  }

  // --- Routing ---

  private updateRoutingUnits(): void {
    const units = [...this.unitSystem.getUnits()];
    for (const unit of units) {
      if (!unit.isAlive() || !unit.isRouting) continue;
      // Skip if already has a flee target set
      if (unit.targetX !== null && unit.targetY !== null) continue;

      // Remove if already at map edge
      if (unit.x < 0 || unit.x > this.map.mapWidthPx || unit.y < 0 || unit.y > this.map.mapHeightPx) {
        this.removeRoutingUnit(unit);
        continue;
      }

      // Find nearest enemy to flee from
      let nearestDist = Infinity;
      let nearestEnemy: Unit | null = null;
      for (const other of this.unitSystem.getUnits()) {
        if (!other.isAlive() || other.faction === unit.faction) continue;
        const dist = unitDist(unit, other);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestEnemy = other;
        }
      }

      if (!nearestEnemy) {
        unit.isRouting = false;
        const visual = this.unitSystem.getVisual(unit);
        if (visual) visual.container.setAlpha(1);
        continue;
      }

      // Flee 128px away from nearest enemy
      const dx = unit.x - nearestEnemy.x;
      const dy = unit.y - nearestEnemy.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      unit.targetX = unit.x + (dx / len) * 128;
      unit.targetY = unit.y + (dy / len) * 128;

      const visual = this.unitSystem.getVisual(unit);
      if (visual) visual.container.setAlpha(0.6);
    }
  }

  private removeRoutingUnit(unit: Unit): void {
    unit.hp = 0;
    const visual = this.unitSystem.getVisual(unit);
    // Clear targeting
    for (const other of this.unitSystem.getUnits()) {
      if (other.attackTargetId === unit.id) other.attackTargetId = null;
    }
    if (visual) {
      this.scene.tweens.add({
        targets: visual.container,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 300,
        onComplete: () => { this.unitSystem.destroyUnit(unit.id); },
      });
    } else {
      this.unitSystem.destroyUnit(unit.id);
    }
  }

  // --- Visual effects ---

  private showDamageNumber(unit: Unit, damage: number): void {
    const visual = this.unitSystem.getVisual(unit);
    if (!visual) return;

    const text = this.scene.add.text(
      visual.container.x,
      visual.container.y - 20,
      `-${damage}`,
      {
        fontSize: '16px',
        color: '#ff3333',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      },
    ).setOrigin(0.5).setDepth(30);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private showHitFlash(unit: Unit): void {
    const visual = this.unitSystem.getVisual(unit);
    if (!visual) return;

    const flash = this.scene.add.graphics();
    flash.fillStyle(0xffffff, 0.8);
    flash.fillRect(-24, -16, 48, 32);
    visual.container.add(flash);

    this.scene.time.delayedCall(80, () => { flash.destroy(); });
  }

  private showProjectile(attacker: Unit, target: Unit): void {
    const aVisual = this.unitSystem.getVisual(attacker);
    const tVisual = this.unitSystem.getVisual(target);
    if (!aVisual || !tVisual) return;

    const proj = this.scene.add.graphics();
    proj.fillStyle(0x333333, 1);
    proj.fillCircle(0, 0, 3);
    proj.setDepth(25);

    const startX = aVisual.container.x;
    const startY = aVisual.container.y;
    const endX = tVisual.container.x;
    const endY = tVisual.container.y;
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - 40;

    proj.setPosition(startX, startY);

    this.scene.tweens.add({
      targets: proj,
      x: endX,
      y: endY,
      duration: 400,
      ease: 'Linear',
      onUpdate: (tween) => {
        const t = tween.progress;
        const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * midX + t * t * endX;
        const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * midY + t * t * endY;
        proj.setPosition(bx, by);
      },
      onComplete: () => proj.destroy(),
    });
  }

  private playDeathAnimation(unit: Unit): void {
    const visual = this.unitSystem.getVisual(unit);
    if (!visual) {
      this.unitSystem.destroyUnit(unit.id);
      return;
    }

    this.scene.tweens.add({
      targets: visual.container,
      alpha: 0,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 600,
      ease: 'Power2',
      onComplete: () => { this.unitSystem.destroyUnit(unit.id); },
    });
  }

  private updateCombatIcons(): void {
    for (const icon of this.combatIcons) icon.destroy();
    this.combatIcons = [];

    const units = this.unitSystem.getUnits();
    const drawnPairs = new Set<string>();

    for (const unit of units) {
      if (!unit.isAlive() || !unit.attackTargetId) continue;
      const target = units.find(u => u.id === unit.attackTargetId);
      if (!target || !target.isAlive()) continue;

      const dist = unitDist(unit, target);
      if (dist > MELEE_RANGE) continue;

      const pairKey = `${Math.min(unit.id, target.id)}:${Math.max(unit.id, target.id)}`;
      if (drawnPairs.has(pairKey)) continue;
      drawnPairs.add(pairKey);

      // Position icon between the two units using world coords
      const mx = (unit.x + target.x) / 2;
      const my = (unit.y + target.y) / 2;

      const icon = this.scene.add.graphics();
      icon.setDepth(25);
      icon.setPosition(mx, my);

      // Crossed swords
      icon.lineStyle(2, 0xffd700, 0.9);
      icon.beginPath(); icon.moveTo(-6, -6); icon.lineTo(6, 6); icon.strokePath();
      icon.beginPath(); icon.moveTo(6, -6); icon.lineTo(-6, 6); icon.strokePath();
      // Guards
      icon.lineStyle(1.5, 0xffd700, 0.7);
      icon.beginPath(); icon.moveTo(-4, -2); icon.lineTo(-7, 1); icon.strokePath();
      icon.beginPath(); icon.moveTo(4, -2); icon.lineTo(7, 1); icon.strokePath();

      this.combatIcons.push(icon);
    }
  }

  // --- Victory/Defeat ---

  checkVictoryConditions(): 'victory' | 'defeat' | null {
    const playerAlive = this.unitSystem.getUnitsByFaction('player');
    const enemyAlive = this.unitSystem.getUnitsByFaction('enemy');

    if (enemyAlive.length === 0) return 'victory';
    if (playerAlive.length === 0) return 'defeat';
    return null;
  }
}
