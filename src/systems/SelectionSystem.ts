import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { MapSystem } from './MapSystem';
import type { UnitSystem } from './UnitSystem';
import type { MovementSystem } from './MovementSystem';
import type { CombatSystem } from './CombatSystem';
import { TILE_SIZE } from '../config/game.config';

export class SelectionSystem {
  private scene: Phaser.Scene;
  private map: MapSystem;
  private unitSystem: UnitSystem;
  private movementSystem: MovementSystem;
  private combatSystem: CombatSystem;
  private selectedUnit: Unit | null = null;
  private reachableTiles: { col: number; row: number }[] = [];
  private attackRangeTiles: { col: number; row: number }[] = [];
  private overlayGraphics: Phaser.GameObjects.Graphics;
  private pathGraphics: Phaser.GameObjects.Graphics;
  private pointerDownPos: { x: number; y: number } | null = null;
  private hoveredTile: { col: number; row: number } | null = null;

  constructor(
    scene: Phaser.Scene,
    map: MapSystem,
    unitSystem: UnitSystem,
    movementSystem: MovementSystem,
    combatSystem: CombatSystem,
  ) {
    this.scene = scene;
    this.map = map;
    this.unitSystem = unitSystem;
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;

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

    if (!unit.moved && !unit.isMoving) {
      this.reachableTiles = this.movementSystem.getReachableTiles(
        unit.col, unit.row, unit.movement,
        unit.faction, this.unitSystem.getUnits(),
      );
    } else {
      this.reachableTiles = [];
    }

    // Attack range overlay for ranged units
    this.attackRangeTiles = [];
    if (unit.range > 1) {
      for (let dr = -unit.range; dr <= unit.range; dr++) {
        for (let dc = -unit.range; dc <= unit.range; dc++) {
          if (Math.abs(dr) + Math.abs(dc) > unit.range || (dr === 0 && dc === 0)) continue;
          const tc = unit.col + dc;
          const tr = unit.row + dr;
          if (!this.map.isInBounds(tc, tr)) continue;
          if (this.reachableTiles.some(t => t.col === tc && t.row === tr)) continue;
          this.attackRangeTiles.push({ col: tc, row: tr });
        }
      }
    }

    this.drawOverlay();
  }

  deselect(): void {
    if (this.selectedUnit) {
      this.unitSystem.setSelected(this.selectedUnit, false);
    }
    this.selectedUnit = null;
    this.reachableTiles = [];
    this.attackRangeTiles = [];
    this.overlayGraphics.clear();
    this.pathGraphics.clear();
    this.hoveredTile = null;
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
      if (dist < 10) {
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

  private handleClick(pointer: Phaser.Input.Pointer): void {
    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const grid = this.map.worldToGrid(wp.x, wp.y);

    if (!this.map.isInBounds(grid.col, grid.row)) {
      this.deselect();
      return;
    }

    const clickedUnit = this.unitSystem.getUnitAt(grid.col, grid.row);

    if (this.selectedUnit) {
      if (this.selectedUnit.isRouting) {
        this.deselect();
        return;
      }

      if (clickedUnit) {
        if (clickedUnit.faction === 'player') {
          if (clickedUnit === this.selectedUnit) {
            this.deselect();
          } else {
            this.select(clickedUnit);
          }
        } else {
          this.handleAttackClick(clickedUnit);
        }
      } else {
        const isReachable = this.reachableTiles.some(
          t => t.col === grid.col && t.row === grid.row,
        );
        if (isReachable) {
          this.moveSelectedUnit(grid.col, grid.row);
        } else {
          this.deselect();
        }
      }
    } else {
      if (clickedUnit && clickedUnit.faction === 'player' && !clickedUnit.isMoving && !clickedUnit.isRouting) {
        this.select(clickedUnit);
      }
    }
  }

  private handleAttackClick(enemy: Unit): void {
    if (!this.selectedUnit) return;
    const unit = this.selectedUnit;
    const dist = Math.abs(unit.col - enemy.col) + Math.abs(unit.row - enemy.row);

    if (dist <= 1) {
      // Adjacent — melee attack
      this.combatSystem.attack(unit, enemy);
      this.deselect();
    } else if (
      unit.range > 1 && dist <= unit.range &&
      this.combatSystem.hasLineOfSight(unit.col, unit.row, enemy.col, enemy.row)
    ) {
      // In ranged range with LoS
      this.combatSystem.attack(unit, enemy);
      this.deselect();
    } else if (!unit.moved && !unit.isMoving) {
      // Out of range — move toward enemy
      const dest = this.findAttackPosition(unit, enemy);
      if (dest) {
        unit.attackTargetId = enemy.id;
        this.moveSelectedUnit(dest.col, dest.row);
      } else {
        this.deselect();
      }
    } else {
      this.deselect();
    }
  }

  private findAttackPosition(unit: Unit, target: Unit): { col: number; row: number } | null {
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;

    if (unit.range > 1) {
      // Ranged: find reachable tile within range of target
      for (const tile of this.reachableTiles) {
        const d = Math.abs(tile.col - target.col) + Math.abs(tile.row - target.row);
        if (d > 0 && d <= unit.range) {
          const md = Math.abs(tile.col - unit.col) + Math.abs(tile.row - unit.row);
          if (md < bestDist) { bestDist = md; best = tile; }
        }
      }
    } else {
      // Melee: find reachable tile adjacent to target
      const adjacents = [
        { col: target.col - 1, row: target.row },
        { col: target.col + 1, row: target.row },
        { col: target.col, row: target.row - 1 },
        { col: target.col, row: target.row + 1 },
      ];
      for (const adj of adjacents) {
        if (this.reachableTiles.some(t => t.col === adj.col && t.row === adj.row)) {
          const md = Math.abs(adj.col - unit.col) + Math.abs(adj.row - unit.row);
          if (md < bestDist) { bestDist = md; best = adj; }
        }
      }
    }

    return best;
  }

  private handleHover(pointer: Phaser.Input.Pointer): void {
    if (!this.selectedUnit) return;

    const wp = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const grid = this.map.worldToGrid(wp.x, wp.y);

    if (this.hoveredTile && this.hoveredTile.col === grid.col && this.hoveredTile.row === grid.row) {
      return;
    }
    this.hoveredTile = { col: grid.col, row: grid.row };
    this.pathGraphics.clear();

    // Attack indicator on enemy
    const hoveredUnit = this.unitSystem.getUnitAt(grid.col, grid.row);
    if (hoveredUnit && hoveredUnit.faction !== this.selectedUnit.faction) {
      const dist = Math.abs(this.selectedUnit.col - grid.col) + Math.abs(this.selectedUnit.row - grid.row);
      if (dist <= 1 || (this.selectedUnit.range > 1 && dist <= this.selectedUnit.range)) {
        const half = TILE_SIZE / 2;
        const pos = this.map.gridToWorld(grid.col, grid.row);
        this.pathGraphics.lineStyle(2, 0xff3333, 0.8);
        this.pathGraphics.strokeRect(pos.x - half, pos.y - half, TILE_SIZE, TILE_SIZE);
        // Crossed swords indicator
        this.pathGraphics.lineStyle(2, 0xff3333, 0.8);
        this.pathGraphics.beginPath();
        this.pathGraphics.moveTo(pos.x - 8, pos.y - 8);
        this.pathGraphics.lineTo(pos.x + 8, pos.y + 8);
        this.pathGraphics.strokePath();
        this.pathGraphics.beginPath();
        this.pathGraphics.moveTo(pos.x + 8, pos.y - 8);
        this.pathGraphics.lineTo(pos.x - 8, pos.y + 8);
        this.pathGraphics.strokePath();
        return;
      }
    }

    // Movement path preview
    const isReachable = this.reachableTiles.some(
      t => t.col === grid.col && t.row === grid.row,
    );
    if (isReachable) {
      const path = this.movementSystem.findPath(
        this.selectedUnit.col, this.selectedUnit.row,
        grid.col, grid.row,
        this.selectedUnit.faction,
        this.unitSystem.getUnits(),
      );
      if (path.length > 1) {
        this.drawPath(path);
      }
    }
  }

  private moveSelectedUnit(destCol: number, destRow: number): void {
    if (!this.selectedUnit) return;
    const unit = this.selectedUnit;
    const path = this.movementSystem.findPath(
      unit.col, unit.row,
      destCol, destRow,
      unit.faction,
      this.unitSystem.getUnits(),
    );
    if (path.length < 2) return;
    this.deselect();
    this.movementSystem.moveUnit(unit, path, this.unitSystem);
  }

  private drawOverlay(): void {
    this.overlayGraphics.clear();
    const half = TILE_SIZE / 2;

    // Movement range (blue)
    for (const tile of this.reachableTiles) {
      const pos = this.map.gridToWorld(tile.col, tile.row);
      this.overlayGraphics.fillStyle(0x4488ff, 0.25);
      this.overlayGraphics.fillRect(pos.x - half, pos.y - half, TILE_SIZE, TILE_SIZE);
      this.overlayGraphics.lineStyle(1, 0x4488ff, 0.4);
      this.overlayGraphics.strokeRect(pos.x - half, pos.y - half, TILE_SIZE, TILE_SIZE);
    }

    // Attack range for archers (red-orange)
    for (const tile of this.attackRangeTiles) {
      const pos = this.map.gridToWorld(tile.col, tile.row);
      this.overlayGraphics.fillStyle(0xff6644, 0.15);
      this.overlayGraphics.fillRect(pos.x - half, pos.y - half, TILE_SIZE, TILE_SIZE);
      this.overlayGraphics.lineStyle(1, 0xff6644, 0.3);
      this.overlayGraphics.strokeRect(pos.x - half, pos.y - half, TILE_SIZE, TILE_SIZE);
    }
  }

  private drawPath(path: { col: number; row: number }[]): void {
    this.pathGraphics.clear();
    if (path.length < 2) return;
    this.pathGraphics.lineStyle(2, 0xffd700, 0.7);
    for (let i = 0; i < path.length - 1; i++) {
      const from = this.map.gridToWorld(path[i].col, path[i].row);
      const to = this.map.gridToWorld(path[i + 1].col, path[i + 1].row);
      for (let s = 0; s < 6; s += 2) {
        const t1 = s / 6;
        const t2 = (s + 1) / 6;
        this.pathGraphics.beginPath();
        this.pathGraphics.moveTo(from.x + (to.x - from.x) * t1, from.y + (to.y - from.y) * t1);
        this.pathGraphics.lineTo(from.x + (to.x - from.x) * t2, from.y + (to.y - from.y) * t2);
        this.pathGraphics.strokePath();
      }
    }
  }
}
