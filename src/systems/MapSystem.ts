import Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS } from '../config/game.config';
import { TERRAIN_TYPES } from '../config/terrain.config';
import type { TerrainDef } from '../config/terrain.config';

export class MapSystem {
  private grid: TerrainDef[][] = [];

  constructor(_scene: Phaser.Scene) {
    this.initGrid();
  }

  private initGrid(): void {
    for (let row = 0; row < MAP_ROWS; row++) {
      this.grid[row] = [];
      for (let col = 0; col < MAP_COLS; col++) {
        this.grid[row][col] = TERRAIN_TYPES.plains;
      }
    }
  }

  getTerrain(col: number, row: number): TerrainDef | null {
    return this.grid[row]?.[col] ?? null;
  }

  worldToGrid(x: number, y: number): { col: number; row: number } {
    return { col: Math.floor(x / TILE_SIZE), row: Math.floor(y / TILE_SIZE) };
  }

  gridToWorld(col: number, row: number): { x: number; y: number } {
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
  }
}
