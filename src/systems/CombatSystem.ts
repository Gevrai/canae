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
    const dist = Math.abs(attacker.col - defender.col) + Math.abs(attacker.row - defender.row);
    if (dist <= 1 && !defender.attackTargetId) {
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
    this.updateCombatIcons();
  }

  // --- Auto-engagement ---

  private autoEngage(): void {
    const units = this.unitSystem.getUnits();
    for (const unit of units) {
      if (!unit.isAlive() || unit.isMoving || unit.isRouting || unit.attackTargetId) continue;

      for (const other of units) {
        if (!other.isAlive() || other.faction === unit.faction) continue;
        const dist = Math.abs(unit.col - other.col) + Math.abs(unit.row - other.row);

        if (unit.range <= 1 && dist <= 1) {
          unit.attackTargetId = other.id;
          this.emit({ type: 'combat_start', attacker: unit, defender: other });
          break;
        }

        if (unit.range > 1 && dist <= unit.range) {
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

      const dist = Math.abs(unit.col - target.col) + Math.abs(unit.row - target.row);

      // Range check
      if (dist > unit.range) {
        unit.attackTargetId = null;
        continue;
      }

      // LoS check for ranged
      if (unit.range > 1 && dist > 1) {
        if (!this.hasLineOfSight(unit.col, unit.row, target.col, target.row)) {
          unit.attackTargetId = null;
          continue;
        }
      }

      const damage = this.calculateDamage(unit, target);
      target.takeDamage(damage);
      this.unitSystem.updateHealthBar(target);

      this.showDamageNumber(target, damage);
      this.showHitFlash(target);

      if (dist > 1) {
        this.showProjectile(unit, target);
      }

      if (unit.hasChargeBonus) {
        unit.hasChargeBonus = false;
      }

      this.applyMoraleDamage(target, damage);
      this.emit({ type: 'damage', attacker: unit, defender: target, damage });

      if (!target.isAlive()) {
        this.handleUnitDeath(target);
      }
    }
  }

  private calculateDamage(attacker: Unit, defender: Unit): number {
    const defenderTerrain = this.map.getTerrain(defender.col, defender.row);
    const terrainDefMod = 1 + (defenderTerrain?.defenseBonus ?? 0);

    let baseDamage = attacker.attack - (defender.defense * terrainDefMod);

    const randomFactor = 0.8 + Math.random() * 0.4;
    const flankBonus = this.getFlankBonus(attacker, defender);
    const chargeBonus = attacker.hasChargeBonus ? 0.4 : 0;
    const braceBonus = this.getBraceBonus(defender, attacker);
    const heightBonus = this.getHeightBonus(attacker, defender);

    const dist = Math.abs(attacker.col - defender.col) + Math.abs(attacker.row - defender.row);
    const rangePenalty = (attacker.unitType === 'archer' && dist <= 1) ? -0.4 : 0;

    // Forest reduces ranged damage
    if (attacker.range > 1 && dist > 1 && defenderTerrain?.key === 'forest') {
      baseDamage *= 0.7;
    }

    const moraleAttackMod = attacker.morale < 50 ? -0.2 : 0;
    const totalMod = 1 + flankBonus + chargeBonus - braceBonus + heightBonus + rangePenalty + moraleAttackMod;

    return Math.round(Math.max(1, baseDamage * randomFactor * totalMod));
  }

  private getFlankBonus(attacker: Unit, defender: Unit): number {
    const attackAngle = Math.atan2(
      attacker.row - defender.row,
      attacker.col - defender.col,
    );

    let angleDiff = Math.abs(attackAngle - defender.facingAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

    if (angleDiff > 2.09) return 0.5;  // Rear: >120°
    if (angleDiff > 1.05) return 0.3;  // Side: >60°
    return 0;
  }

  private getBraceBonus(defender: Unit, attacker: Unit): number {
    if (defender.unitType !== 'infantry' || attacker.unitType !== 'cavalry') return 0;
    if (defender.isMoving) return 0;
    const timeSinceMove = this.scene.time.now - defender.lastMoveTime;
    return timeSinceMove >= 2000 ? 0.25 : 0;
  }

  private getHeightBonus(attacker: Unit, defender: Unit): number {
    const aTerrain = this.map.getTerrain(attacker.col, attacker.row);
    const dTerrain = this.map.getTerrain(defender.col, defender.row);
    return (aTerrain?.key === 'hills' && dTerrain?.key !== 'hills') ? 0.15 : 0;
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
        const dist = Math.abs(unit.col - other.col) + Math.abs(unit.row - other.row);
        if (dist <= 2) {
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
        const dist = Math.abs(unit.col - other.col) + Math.abs(unit.row - other.row);
        if (dist <= 2) { nearFriendly = true; break; }
      }

      if (nearFriendly && unit.morale < 100) {
        unit.morale = Math.min(100, unit.morale + (delta / 1000) * 2);
      }
    }
  }

  // --- Death handling ---

  private handleUnitDeath(unit: Unit): void {
    unit.attackTargetId = null;
    this.emit({ type: 'unit_death', unit });

    // Morale penalty to nearby friendlies
    const units = this.unitSystem.getUnits();
    for (const other of units) {
      if (!other.isAlive() || other.faction !== unit.faction) continue;
      const dist = Math.abs(other.col - unit.col) + Math.abs(other.row - unit.row);
      if (dist <= 3) {
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
      if (!unit.isAlive() || !unit.isRouting || unit.isMoving) continue;

      // Find nearest enemy to flee from
      let nearestDist = Infinity;
      let nearestEnemy: Unit | null = null;
      for (const other of this.unitSystem.getUnits()) {
        if (!other.isAlive() || other.faction === unit.faction) continue;
        const dist = Math.abs(unit.col - other.col) + Math.abs(unit.row - other.row);
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

      const dx = unit.col - nearestEnemy.col;
      const dy = unit.row - nearestEnemy.row;

      // Sort directions by how much they flee from enemy
      const dirs = [
        { dc: 1, dr: 0 }, { dc: -1, dr: 0 },
        { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
      ];
      dirs.sort((a, b) => (b.dc * dx + b.dr * dy) - (a.dc * dx + a.dr * dy));

      let fled = false;
      for (const dir of dirs) {
        const nc = unit.col + dir.dc;
        const nr = unit.row + dir.dr;

        if (!this.map.isInBounds(nc, nr)) {
          this.removeRoutingUnit(unit);
          fled = true;
          break;
        }

        const terrain = this.map.getTerrain(nc, nr);
        if (!terrain?.passable) continue;
        if (this.unitSystem.getUnitAt(nc, nr)) continue;

        this.animateRoutingMove(unit, nc, nr);
        fled = true;
        break;
      }

      if (!fled) {
        // Cornered — just stay put
      }
    }
  }

  private animateRoutingMove(unit: Unit, newCol: number, newRow: number): void {
    const visual = this.unitSystem.getVisual(unit);
    unit.col = newCol;
    unit.row = newRow;
    if (!visual) return;

    const pos = this.map.gridToWorld(newCol, newRow);
    unit.isMoving = true;
    const jitterX = (Math.random() - 0.5) * 8;
    const jitterY = (Math.random() - 0.5) * 8;

    this.scene.tweens.add({
      targets: visual.container,
      x: pos.x + jitterX,
      y: pos.y + jitterY,
      duration: 200,
      ease: 'Linear',
      onComplete: () => {
        unit.isMoving = false;
        visual.container.setAlpha(0.6);
      },
    });
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

      const dist = Math.abs(unit.col - target.col) + Math.abs(unit.row - target.row);
      if (dist > 1) continue;

      const pairKey = `${Math.min(unit.id, target.id)}:${Math.max(unit.id, target.id)}`;
      if (drawnPairs.has(pairKey)) continue;
      drawnPairs.add(pairKey);

      const uv = this.unitSystem.getVisual(unit);
      const tv = this.unitSystem.getVisual(target);
      if (!uv || !tv) continue;

      const mx = (uv.container.x + tv.container.x) / 2;
      const my = (uv.container.y + tv.container.y) / 2;

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
