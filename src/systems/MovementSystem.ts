import { MapSystem } from './MapSystem';

export class MovementSystem {
  constructor(_map: MapSystem) {
  }

  findPath(
    startCol: number, startRow: number,
    endCol: number, endRow: number,
  ): { col: number; row: number }[] {
    // A* placeholder — returns direct path for now
    const path: { col: number; row: number }[] = [];
    path.push({ col: startCol, row: startRow });
    path.push({ col: endCol, row: endRow });
    return path;
  }

  getMovableRange(col: number, row: number, movement: number): { col: number; row: number }[] {
    const range: { col: number; row: number }[] = [];
    for (let dc = -movement; dc <= movement; dc++) {
      for (let dr = -movement; dr <= movement; dr++) {
        if (Math.abs(dc) + Math.abs(dr) <= movement) {
          range.push({ col: col + dc, row: row + dr });
        }
      }
    }
    return range;
  }
}
