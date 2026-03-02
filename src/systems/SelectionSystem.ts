import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { MapSystem } from './MapSystem';
import type { UnitSystem } from './UnitSystem';
import type { MovementSystem } from './MovementSystem';
import { TILE_SIZE } from '../config/game.config';

export class SelectionSystem {
  private scene: Phaser.Scene;
  private map: MapSystem;
  private unitSystem: UnitSystem;
  private movementSystem: MovementSystem;
  private selectedUnit: Unit | null = null;
  private reachableTiles: { col: number; row: number }[] = [];
  private overlayGraphics: Phaser.GameObjects.Graphics;
  private pathGraphics: Phaser.GameObjects.Graphics;
  private pointerDownPos: { x: number; y: number } | null = null;
  private hoveredTile: { col: number; row: number } | null = null;

  constructor(
    scene: Phaser.Scene,
    map: MapSystem,
    unitSystem: UnitSystem,
    movementSystem: MovementSystem,
  ) {
    this.scene = scene;
    this.map = map;
    this.unitSystem = unitSystem;
    this.movementSystem = movementSystem;

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
    this.drawOverlay();
  }

  deselect(): void {
    if (this.selectedUnit) {
      this.unitSystem.setSelected(this.selectedUnit, false);
    }
    this.selectedUnit = null;
    this.reachableTiles = [];
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
      if (clickedUnit) {
        if (clickedUnit.faction === 'player') {
          if (clickedUnit === this.selectedUnit) {
            this.deselect();
          } else {
            this.select(clickedUnit);
          }
        } else {
          // Enemy clicked — deselect for now (combat is handled separately)
          this.deselect();
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
      if (clickedUnit && clickedUnit.faction === 'player' && !clickedUnit.moved && !clickedUnit.isMoving) {
        this.select(clickedUnit);
      }
    }
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
    for (const tile of this.reachableTiles) {
      const pos = this.map.gridToWorld(tile.col, tile.row);
      this.overlayGraphics.fillStyle(0x4488ff, 0.25);
      this.overlayGraphics.fillRect(pos.x - half, pos.y - half, TILE_SIZE, TILE_SIZE);
      this.overlayGraphics.lineStyle(1, 0x4488ff, 0.4);
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
