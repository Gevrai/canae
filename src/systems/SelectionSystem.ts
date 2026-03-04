import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { Faction } from '../config/units.config';
import type { MapSystem } from './MapSystem';
import type { UnitSystem } from './UnitSystem';
import type { MovementSystem } from './MovementSystem';
import type { CombatSystem } from './CombatSystem';
import type { GameSync } from '../multiplayer/GameSync';
import { AudioSystem } from './AudioSystem';

const MELEE_RANGE = 40;
const CLICK_RADIUS_PAD = 10;

export class SelectionSystem {
  private scene: Phaser.Scene;
  private unitSystem: UnitSystem;
  private movementSystem: MovementSystem;
  private combatSystem: CombatSystem;
  private selectedUnit: Unit | null = null;
  private overlayGraphics: Phaser.GameObjects.Graphics;
  private pathGraphics: Phaser.GameObjects.Graphics;
  private pointerDownPos: { x: number; y: number } | null = null;
  private controlledFaction: Faction;
  private gameSync: GameSync | null;
  private lastClickTime = 0;
  private lastClickX = -1;
  private lastClickY = -1;

  constructor(
    scene: Phaser.Scene,
    _map: MapSystem,
    unitSystem: UnitSystem,
    movementSystem: MovementSystem,
    combatSystem: CombatSystem,
    controlledFaction: Faction = 'player',
    gameSync: GameSync | null = null,
  ) {
    this.scene = scene;
    this.unitSystem = unitSystem;
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;
    this.controlledFaction = controlledFaction;
    this.gameSync = gameSync;

    this.overlayGraphics = scene.add.graphics();
    this.overlayGraphics.setDepth(5);
    this.pathGraphics = scene.add.graphics();
    this.pathGraphics.setDepth(6);

    this.setupInput();
  }

  getSelected(): Unit | null {
    return this.selectedUnit;
  }

  select(unit: Unit): void {
    if (this.selectedUnit) {
      this.unitSystem.setSelected(this.selectedUnit, false);
    }
    this.selectedUnit = unit;
    this.unitSystem.setSelected(unit, true);
    AudioSystem.getInstance().playSelect();

    this.drawOverlay();
  }

  deselect(): void {
    if (this.selectedUnit) {
      this.unitSystem.setSelected(this.selectedUnit, false);
    }
    this.selectedUnit = null;
    this.overlayGraphics.clear();
    this.pathGraphics.clear();
  }

  private setupInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerDownPos = { x: pointer.x, y: pointer.y };
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.pointerDownPos) return;
      const dist = Phaser.Math.Distance.Between(
        this.pointerDownPos.x, this.pointerDownPos.y,
        pointer.x, pointer.y,
      );
      if (dist < 5) {
        this.handleClick(pointer);
      }
      this.pointerDownPos = null;
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.selectedUnit && !pointer.isDown) {
        this.handleHover(pointer);
      }
    });
  }

  /** Find the nearest alive unit within its collisionRadius + padding of a world point. */
  private findUnitAtWorld(wx: number, wy: number): Unit | undefined {
    let best: Unit | undefined;
    let bestDist = Infinity;
    for (const u of this.unitSystem.getUnits()) {
      if (!u.isAlive()) continue;
      const d = Phaser.Math.Distance.Between(wx, wy, u.x, u.y);
      if (d < u.collisionRadius + CLICK_RADIUS_PAD && d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const worldX = wp.x;
    const worldY = wp.y;

    // Double-tap detection (proximity-based, 20px tolerance)
    const now = Date.now();
    const isDoubleTap = (now - this.lastClickTime < 350) &&
      Phaser.Math.Distance.Between(worldX, worldY, this.lastClickX, this.lastClickY) < 20;
    this.lastClickTime = now;
    this.lastClickX = worldX;
    this.lastClickY = worldY;

    const clickedUnit = this.findUnitAtWorld(worldX, worldY);

    // Double-tap on unit: center camera on it
    if (isDoubleTap && clickedUnit) {
      this.scene.cameras.main.pan(clickedUnit.x, clickedUnit.y, 400, 'Power2');
      return;
    }

    if (this.selectedUnit) {
      if (this.selectedUnit.isRouting) {
        this.deselect();
        return;
      }

      if (clickedUnit) {
        if (clickedUnit.faction === this.controlledFaction) {
          if (clickedUnit === this.selectedUnit) {
            this.deselect();
          } else {
            this.select(clickedUnit);
          }
        } else {
          this.handleAttackClick(clickedUnit);
        }
      } else {
        // Move to clicked world position
        this.moveSelectedUnit(worldX, worldY);
      }
    } else {
      if (clickedUnit && clickedUnit.faction === this.controlledFaction && !clickedUnit.isMoving && !clickedUnit.isRouting) {
        this.select(clickedUnit);
      }
    }
  }

  private handleAttackClick(enemy: Unit): void {
    if (!this.selectedUnit) return;
    const unit = this.selectedUnit;
    const dist = Phaser.Math.Distance.Between(unit.x, unit.y, enemy.x, enemy.y);

    if (dist <= MELEE_RANGE) {
      // In melee range — attack directly
      if (this.gameSync) {
        this.gameSync.sendAttackCommand(unit.id, enemy.id);
      }
      this.combatSystem.attack(unit, enemy);
      this.deselect();
    } else if (
      unit.range > MELEE_RANGE && dist <= unit.range &&
      this.combatSystem.hasLineOfSight(unit.col, unit.row, enemy.col, enemy.row)
    ) {
      // In ranged range with LoS
      if (this.gameSync) {
        this.gameSync.sendAttackCommand(unit.id, enemy.id);
      }
      this.combatSystem.attack(unit, enemy);
      this.deselect();
    } else {
      // Out of range — move toward enemy and queue attack
      unit.attackTargetId = enemy.id;
      // Move to a point near the enemy, offset by melee/ranged standoff distance
      const standoff = unit.range > MELEE_RANGE ? unit.range * 0.8 : MELEE_RANGE * 0.8;
      const angle = Math.atan2(unit.y - enemy.y, unit.x - enemy.x);
      const targetX = enemy.x + Math.cos(angle) * standoff;
      const targetY = enemy.y + Math.sin(angle) * standoff;
      this.moveSelectedUnit(targetX, targetY);
    }
  }

  private handleHover(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedUnit) return;
    const unit = this.selectedUnit;

    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.pathGraphics.clear();

    // Attack indicator on enemy
    const hoveredUnit = this.findUnitAtWorld(wp.x, wp.y);
    if (hoveredUnit && hoveredUnit.faction !== unit.faction) {
      const dist = Phaser.Math.Distance.Between(unit.x, unit.y, hoveredUnit.x, hoveredUnit.y);
      if (dist <= MELEE_RANGE || (unit.range > MELEE_RANGE && dist <= unit.range)) {
        // Crossed swords indicator at enemy position
        this.pathGraphics.lineStyle(2, 0xff3333, 0.8);
        this.pathGraphics.beginPath();
        this.pathGraphics.moveTo(hoveredUnit.x - 8, hoveredUnit.y - 8);
        this.pathGraphics.lineTo(hoveredUnit.x + 8, hoveredUnit.y + 8);
        this.pathGraphics.strokePath();
        this.pathGraphics.beginPath();
        this.pathGraphics.moveTo(hoveredUnit.x + 8, hoveredUnit.y - 8);
        this.pathGraphics.lineTo(hoveredUnit.x - 8, hoveredUnit.y + 8);
        this.pathGraphics.strokePath();
        return;
      }
    }

    // Movement line preview (dotted line from unit to hover position)
    this.drawMovementLine(unit.x, unit.y, wp.x, wp.y);
  }

  private moveSelectedUnit(worldX: number, worldY: number): void {
    if (!this.selectedUnit) return;
    const unit = this.selectedUnit;

    // Send move command in multiplayer (col/row params carry world coords for now)
    if (this.gameSync) {
      this.gameSync.sendMoveCommand(unit.id, worldX, worldY);
    }

    this.movementSystem.setTarget(unit, worldX, worldY);
    this.deselect();
  }

  private drawOverlay(): void {
    this.overlayGraphics.clear();
    if (!this.selectedUnit) return;
    const unit = this.selectedUnit;

    // Range circle for ranged units
    if (unit.range > MELEE_RANGE) {
      this.overlayGraphics.lineStyle(1, 0xff6644, 0.3);
      this.overlayGraphics.strokeCircle(unit.x, unit.y, unit.range);
    }
  }

  /** Draw a dotted line between two world points. */
  private drawMovementLine(fromX: number, fromY: number, toX: number, toY: number): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const dashLen = 6;
    const gapLen = 4;
    const segLen = dashLen + gapLen;
    const segments = Math.floor(len / segLen);

    this.pathGraphics.lineStyle(2, 0xffd700, 0.7);
    for (let i = 0; i < segments; i++) {
      const t1 = (i * segLen) / len;
      const t2 = (i * segLen + dashLen) / len;
      this.pathGraphics.beginPath();
      this.pathGraphics.moveTo(fromX + dx * t1, fromY + dy * t1);
      this.pathGraphics.lineTo(fromX + dx * t2, fromY + dy * t2);
      this.pathGraphics.strokePath();
    }
  }
}
