import Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_MARGIN, PARCHMENT_BG } from '../config/game.config';
import { TERRAIN_TYPES } from '../config/terrain.config';
import type { TerrainDef } from '../config/terrain.config';
import { Terrain } from '../entities/Terrain';

// Simple seeded PRNG for reproducible maps
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple value noise for natural terrain clusters
function valueNoise(cols: number, rows: number, scale: number, rng: () => number): number[][] {
  const coarseCols = Math.ceil(cols / scale) + 2;
  const coarseRows = Math.ceil(rows / scale) + 2;
  const coarse: number[][] = [];
  for (let r = 0; r < coarseRows; r++) {
    coarse[r] = [];
    for (let c = 0; c < coarseCols; c++) {
      coarse[r][c] = rng();
    }
  }

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const smooth = (t: number) => t * t * (3 - 2 * t);

  const result: number[][] = [];
  for (let r = 0; r < rows; r++) {
    result[r] = [];
    for (let c = 0; c < cols; c++) {
      const cx = c / scale;
      const cy = r / scale;
      const ix = Math.floor(cx);
      const iy = Math.floor(cy);
      const fx = smooth(cx - ix);
      const fy = smooth(cy - iy);
      const top = lerp(coarse[iy][ix], coarse[iy][ix + 1], fx);
      const bot = lerp(coarse[iy + 1][ix], coarse[iy + 1][ix + 1], fx);
      result[r][c] = lerp(top, bot, fy);
    }
  }
  return result;
}

export class MapSystem {
  private scene: Phaser.Scene;
  private grid: Terrain[][] = [];
  // Available for external access if needed (e.g., highlight overlays)
  mapGraphics!: Phaser.GameObjects.Graphics;

  readonly mapWidthPx: number;
  readonly mapHeightPx: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.mapWidthPx = MAP_COLS * TILE_SIZE + MAP_MARGIN * 2;
    this.mapHeightPx = MAP_ROWS * TILE_SIZE + MAP_MARGIN * 2;
    this.generate();
    this.render();
  }

  // --- Procedural generation ---
  private generate(): void {
    const rng = mulberry32(42);
    const elevation = valueNoise(MAP_COLS, MAP_ROWS, 6, rng);
    const moisture = valueNoise(MAP_COLS, MAP_ROWS, 8, rng);
    const forestNoise = valueNoise(MAP_COLS, MAP_ROWS, 5, rng);

    // River path: meanders roughly top-to-bottom in left third of map
    const riverCol: number[] = [];
    let rc = 7 + Math.floor(rng() * 3);
    for (let r = 0; r < MAP_ROWS; r++) {
      riverCol[r] = rc;
      const drift = rng();
      if (drift < 0.3) rc = Math.max(4, rc - 1);
      else if (drift > 0.7) rc = Math.min(12, rc + 1);
    }

    // Road path: horizontal across middle-ish
    const roadRow: number[] = [];
    let rr = Math.floor(MAP_ROWS * 0.45) + Math.floor(rng() * 3);
    for (let c = 0; c < MAP_COLS; c++) {
      roadRow[c] = rr;
      const drift = rng();
      if (drift < 0.25) rr = Math.max(Math.floor(MAP_ROWS * 0.3), rr - 1);
      else if (drift > 0.75) rr = Math.min(Math.floor(MAP_ROWS * 0.7), rr + 1);
    }

    for (let r = 0; r < MAP_ROWS; r++) {
      this.grid[r] = [];
      for (let c = 0; c < MAP_COLS; c++) {
        let type: TerrainDef = TERRAIN_TYPES.grass;

        // Water: river cells + adjacent for width
        const distToRiver = Math.abs(c - riverCol[r]);
        if (distToRiver === 0) {
          type = TERRAIN_TYPES.water;
        } else if (distToRiver === 1 && moisture[r][c] > 0.4) {
          type = TERRAIN_TYPES.mud;
        }

        // Hills on map flanks
        if (type === TERRAIN_TYPES.grass) {
          const edgeFactor = Math.min(c, MAP_COLS - 1 - c) / MAP_COLS;
          if (elevation[r][c] > 0.6 && edgeFactor < 0.3) {
            type = TERRAIN_TYPES.hills;
          } else if (elevation[r][c] > 0.72) {
            type = TERRAIN_TYPES.hills;
          }
        }

        // Forest clusters
        if (type === TERRAIN_TYPES.grass && forestNoise[r][c] > 0.62 && moisture[r][c] > 0.35) {
          type = TERRAIN_TYPES.forest;
        }

        // Road overrides grass/hills (not water)
        if (roadRow[c] === r && type !== TERRAIN_TYPES.water) {
          type = TERRAIN_TYPES.road;
        }

        this.grid[r][c] = new Terrain(type, c, r);
      }
    }
  }

  // --- Rendering ---
  private render(): void {
    const g = this.scene.add.graphics();
    this.mapGraphics = g;

    this.drawParchmentBackground(g);
    this.drawTerrain(g);
    this.drawGridLines(g);
    this.drawMapBorder(g);
    this.drawParchmentOverlay();
  }

  private drawParchmentBackground(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(PARCHMENT_BG, 1);
    g.fillRect(0, 0, this.mapWidthPx, this.mapHeightPx);
  }

  private drawTerrain(g: Phaser.GameObjects.Graphics): void {
    const rng = mulberry32(123);
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const terrain = this.grid[r][c];
        const x = c * TILE_SIZE + MAP_MARGIN;
        const y = r * TILE_SIZE + MAP_MARGIN;

        // Base color with slight variation for natural look
        const variation = (rng() - 0.5) * 0.06;
        const baseColor = terrain.def.color;
        const variedColor = this.adjustBrightness(baseColor, variation);
        g.fillStyle(variedColor, 1);
        g.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // Per-type decorations
        this.drawTerrainDetail(g, terrain.def.key, x, y, rng);
      }
    }
  }

  private drawTerrainDetail(g: Phaser.GameObjects.Graphics, key: string, x: number, y: number, rng: () => number): void {
    switch (key) {
      case 'hills':
        this.drawHillContours(g, x, y, rng);
        break;
      case 'forest':
        this.drawTreeSymbols(g, x, y, rng);
        break;
      case 'water':
        this.drawWaterWaves(g, x, y, rng);
        break;
      case 'road':
        this.drawRoadPath(g, x, y);
        break;
      case 'mud':
        this.drawMudSpeckles(g, x, y, rng);
        break;
    }
  }

  private drawHillContours(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    g.lineStyle(1, 0x9a8a6a, 0.4);
    for (let i = 0; i < 3; i++) {
      const cy = y + 15 + i * 14 + rng() * 4;
      const cx = x + 10 + rng() * 8;
      g.beginPath();
      g.arc(cx + 22, cy, 18 - i * 3, Math.PI, 0, false);
      g.strokePath();
    }
  }

  private drawTreeSymbols(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const tx = x + 10 + rng() * 44;
      const ty = y + 14 + rng() * 36;
      g.fillStyle(0x6b7a4b, 0.7);
      g.fillCircle(tx, ty, 4 + rng() * 3);
      g.fillStyle(0x5a6940, 0.5);
      g.fillCircle(tx - 1, ty - 1, 2.5);
    }
  }

  private drawWaterWaves(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    g.lineStyle(1, 0x6892a5, 0.35);
    for (let i = 0; i < 3; i++) {
      const wy = y + 16 + i * 16;
      const wx = x + 6 + rng() * 4;
      g.beginPath();
      g.moveTo(wx, wy);
      g.lineTo(wx + 10, wy - 3);
      g.lineTo(wx + 20, wy);
      g.lineTo(wx + 30, wy - 3);
      g.lineTo(wx + 40, wy);
      g.strokePath();
    }
  }

  private drawRoadPath(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.lineStyle(3, 0xc8b898, 0.5);
    g.beginPath();
    g.moveTo(x, y + TILE_SIZE / 2);
    g.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);
    g.strokePath();

    // Dashed edge lines
    g.lineStyle(1, 0xb0a080, 0.3);
    g.beginPath();
    g.moveTo(x, y + TILE_SIZE / 2 - 8);
    g.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2 - 8);
    g.strokePath();
    g.beginPath();
    g.moveTo(x, y + TILE_SIZE / 2 + 8);
    g.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2 + 8);
    g.strokePath();
  }

  private drawMudSpeckles(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: () => number): void {
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x7a6345, 0.3 + rng() * 0.2);
      g.fillCircle(x + 6 + rng() * 52, y + 6 + rng() * 52, 1.5 + rng() * 2);
    }
  }

  private drawGridLines(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(1, 0xbaa888, 0.15);
    for (let c = 0; c <= MAP_COLS; c++) {
      const x = c * TILE_SIZE + MAP_MARGIN;
      g.beginPath();
      g.moveTo(x, MAP_MARGIN);
      g.lineTo(x, MAP_ROWS * TILE_SIZE + MAP_MARGIN);
      g.strokePath();
    }
    for (let r = 0; r <= MAP_ROWS; r++) {
      const y = r * TILE_SIZE + MAP_MARGIN;
      g.beginPath();
      g.moveTo(MAP_MARGIN, y);
      g.lineTo(MAP_COLS * TILE_SIZE + MAP_MARGIN, y);
      g.strokePath();
    }
  }

  private drawMapBorder(g: Phaser.GameObjects.Graphics): void {
    const bx = MAP_MARGIN - 4;
    const by = MAP_MARGIN - 4;
    const bw = MAP_COLS * TILE_SIZE + 8;
    const bh = MAP_ROWS * TILE_SIZE + 8;

    // Outer border
    g.lineStyle(3, 0x8b7355, 0.8);
    g.strokeRect(bx, by, bw, bh);

    // Inner border
    g.lineStyle(1, 0xa08a68, 0.5);
    g.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
  }

  private drawParchmentOverlay(): void {
    // Edge vignette for aged parchment feel
    const overlay = this.scene.add.graphics();
    const w = this.mapWidthPx;
    const h = this.mapHeightPx;
    const edgeSize = 80;

    // Dark edges (top, bottom, left, right)
    for (let i = 0; i < edgeSize; i++) {
      const alpha = 0.08 * (1 - i / edgeSize);
      overlay.fillStyle(0x5a4a30, alpha);
      // top
      overlay.fillRect(0, i, w, 1);
      // bottom
      overlay.fillRect(0, h - i - 1, w, 1);
      // left
      overlay.fillRect(i, 0, 1, h);
      // right
      overlay.fillRect(w - i - 1, 0, 1, h);
    }

    // Subtle noise speckles for texture
    const rng = mulberry32(777);
    overlay.fillStyle(0x6b5b3a, 0.03);
    for (let i = 0; i < 600; i++) {
      const sx = rng() * w;
      const sy = rng() * h;
      overlay.fillCircle(sx, sy, 0.5 + rng() * 1.5);
    }
  }

  // --- Public API ---
  getTerrain(col: number, row: number): TerrainDef | null {
    return this.grid[row]?.[col]?.def ?? null;
  }

  getTerrainEntity(col: number, row: number): Terrain | null {
    return this.grid[row]?.[col] ?? null;
  }

  worldToGrid(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor((x - MAP_MARGIN) / TILE_SIZE),
      row: Math.floor((y - MAP_MARGIN) / TILE_SIZE),
    };
  }

  gridToWorld(col: number, row: number): { x: number; y: number } {
    return {
      x: col * TILE_SIZE + TILE_SIZE / 2 + MAP_MARGIN,
      y: row * TILE_SIZE + TILE_SIZE / 2 + MAP_MARGIN,
    };
  }

  isInBounds(col: number, row: number): boolean {
    return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS;
  }

  // --- Helpers ---
  private adjustBrightness(color: number, amount: number): number {
    let r = (color >> 16) & 0xff;
    let g = (color >> 8) & 0xff;
    let b = color & 0xff;
    r = Math.min(255, Math.max(0, Math.round(r * (1 + amount))));
    g = Math.min(255, Math.max(0, Math.round(g * (1 + amount))));
    b = Math.min(255, Math.max(0, Math.round(b * (1 + amount))));
    return (r << 16) | (g << 8) | b;
  }
}
