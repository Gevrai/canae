import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { Faction } from '../config/units.config';
import type { MapSystem } from './MapSystem';

interface GridPos {
  col: number;
  row: number;
}

const DIRS = [
  { dc: 0, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
];

export class MovementSystem {
  private scene: Phaser.Scene;
  private map: MapSystem;

  constructor(scene: Phaser.Scene, map: MapSystem) {
    this.scene = scene;
    this.map = map;
  }

  findPath(
    startCol: number, startRow: number,
    endCol: number, endRow: number,
    faction: Faction,
    units: Unit[],
  ): GridPos[] {
    if (startCol === endCol && startRow === endRow) return [];

    const endTerrain = this.map.getTerrain(endCol, endRow);
    if (!endTerrain || !endTerrain.passable) return [];
    if (units.some(u => u.col === endCol && u.row === endRow && u.isAlive())) return [];

    const key = (c: number, r: number) => c * 10000 + r;

    interface ANode {
      col: number;
      row: number;
      g: number;
      f: number;
      parent: ANode | null;
    }

    const openSet: ANode[] = [];
    const closedSet = new Set<number>();
    const gScores = new Map<number, number>();
    const h = (c: number, r: number) => Math.abs(c - endCol) + Math.abs(r - endRow);

    const startNode: ANode = {
      col: startCol, row: startRow,
      g: 0, f: h(startCol, startRow),
      parent: null,
    };
    openSet.push(startNode);
    gScores.set(key(startCol, startRow), 0);

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      if (current.col === endCol && current.row === endRow) {
        const path: GridPos[] = [];
        let node: ANode | null = current;
        while (node) {
          path.unshift({ col: node.col, row: node.row });
          node = node.parent;
        }
        return path;
      }

      closedSet.add(key(current.col, current.row));

      for (const dir of DIRS) {
        const nc = current.col + dir.dc;
        const nr = current.row + dir.dr;
        if (!this.map.isInBounds(nc, nr)) continue;
        const nk = key(nc, nr);
        if (closedSet.has(nk)) continue;

        const terrain = this.map.getTerrain(nc, nr);
        if (!terrain || !terrain.passable) continue;

        // Enemy units block passage
        const occupant = units.find(u => u.col === nc && u.row === nr && u.isAlive());
        if (occupant && occupant.faction !== faction) continue;

        const g = current.g + terrain.movementCost;
        const existingG = gScores.get(nk);
        if (existingG !== undefined && g >= existingG) continue;

        gScores.set(nk, g);
        const node: ANode = {
          col: nc, row: nr,
          g, f: g + h(nc, nr),
          parent: current,
        };
        const existingIdx = openSet.findIndex(n => key(n.col, n.row) === nk);
        if (existingIdx >= 0) openSet.splice(existingIdx, 1);
        openSet.push(node);
      }
    }

    return [];
  }

  getReachableTiles(
    col: number, row: number, movement: number,
    faction: Faction, units: Unit[],
  ): GridPos[] {
    const result: GridPos[] = [];
    const visited = new Map<number, number>();
    const key = (c: number, r: number) => c * 10000 + r;

    const queue: { col: number; row: number; cost: number }[] = [
      { col, row, cost: 0 },
    ];
    visited.set(key(col, row), 0);

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const current = queue.shift()!;

      for (const dir of DIRS) {
        const nc = current.col + dir.dc;
        const nr = current.row + dir.dr;
        if (!this.map.isInBounds(nc, nr)) continue;

        const terrain = this.map.getTerrain(nc, nr);
        if (!terrain || !terrain.passable) continue;

        const occupant = units.find(u => u.col === nc && u.row === nr && u.isAlive());
        if (occupant && occupant.faction !== faction) continue;

        const newCost = current.cost + terrain.movementCost;
        if (newCost > movement) continue;

        const nk = key(nc, nr);
        const existingCost = visited.get(nk);
        if (existingCost !== undefined && newCost >= existingCost) continue;

        visited.set(nk, newCost);
        queue.push({ col: nc, row: nr, cost: newCost });

        if (!occupant) {
          const ei = result.findIndex(t => t.col === nc && t.row === nr);
          if (ei < 0) result.push({ col: nc, row: nr });
        }
      }
    }

    return result;
  }

  moveUnit(unit: Unit, path: GridPos[], unitSystem: { getVisual(u: Unit): { container: Phaser.GameObjects.Container } | undefined }): void {
    if (path.length < 2) return;

    unit.isMoving = true;
    unit.currentPath = path;
    const steps = path.slice(1);

    const animateStep = (index: number) => {
      if (index >= steps.length) {
        unit.isMoving = false;
        unit.moved = true;
        unit.currentPath = [];
        unit.lastMoveTime = this.scene.time.now;
        unit.tilesMoved = steps.length;
        if (unit.unitType === 'cavalry' && steps.length >= 3) {
          unit.hasChargeBonus = true;
        }
        return;
      }

      const step = steps[index];
      const pos = this.map.gridToWorld(step.col, step.row);
      const visual = unitSystem.getVisual(unit);
      if (!visual) {
        const last = steps[steps.length - 1];
        unit.col = last.col;
        unit.row = last.row;
        unit.isMoving = false;
        unit.moved = true;
        unit.currentPath = [];
        return;
      }

      const dx = step.col - unit.col;
      const dy = step.row - unit.row;
      unit.facingAngle = Math.atan2(dy, dx);

      this.scene.tweens.add({
        targets: visual.container,
        x: pos.x,
        y: pos.y,
        duration: 150,
        ease: 'Linear',
        onComplete: () => {
          unit.col = step.col;
          unit.row = step.row;
          animateStep(index + 1);
        },
      });
    };

    animateStep(0);
  }
}
