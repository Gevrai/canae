import Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { UNIT_TYPES, FACTION_COLORS } from '../config/units.config';
import type { Faction } from '../config/units.config';
import type { MapSystem } from './MapSystem';
import { MAP_COLS, MAP_ROWS } from '../config/game.config';

const BLOCK_W = 48;
const BLOCK_H = 32;

export interface UnitVisual {
  container: Phaser.GameObjects.Container;
  block: Phaser.GameObjects.Graphics;
  healthBar: Phaser.GameObjects.Graphics;
  staminaBar: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Graphics;
  braceIcon: Phaser.GameObjects.Graphics;
  chargeTrail: Phaser.GameObjects.Graphics;
}

export class UnitSystem {
  private scene: Phaser.Scene;
  private map: MapSystem;
  private units: Unit[] = [];
  private visuals = new Map<number, UnitVisual>();

  constructor(scene: Phaser.Scene, map: MapSystem) {
    this.scene = scene;
    this.map = map;
  }

  createUnit(type: string, faction: Faction, col: number, row: number): Unit {
    const def = UNIT_TYPES[type];
    if (!def) throw new Error(`Unknown unit type: ${type}`);
    const unit = new Unit(def, col, row, faction);
    this.units.push(unit);
    this.createVisual(unit);
    return unit;
  }

  destroyUnit(id: number): void {
    const idx = this.units.findIndex(u => u.id === id);
    if (idx < 0) return;
    const visual = this.visuals.get(id);
    if (visual) {
      visual.container.destroy();
      this.visuals.delete(id);
    }
    this.units.splice(idx, 1);
  }

  getUnits(): Unit[] {
    return this.units;
  }

  getUnitAt(col: number, row: number): Unit | undefined {
    return this.units.find(u => u.col === col && u.row === row && u.isAlive());
  }

  getUnitAtWorld(wx: number, wy: number, radius: number = 30): Unit | undefined {
    return this.units.find(u => {
      if (!u.isAlive()) return false;
      const dx = u.x - wx;
      const dy = u.y - wy;
      return Math.sqrt(dx * dx + dy * dy) <= (u.collisionRadius + radius);
    });
  }

  getUnitsByFaction(faction: Faction): Unit[] {
    return this.units.filter(u => u.faction === faction && u.isAlive());
  }

  getUnitsInRange(x: number, y: number, range: number): Unit[] {
    return this.units.filter(u => {
      if (!u.isAlive()) return false;
      const dx = u.x - x;
      const dy = u.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= range && dist > 0;
    });
  }

  getVisual(unit: Unit): UnitVisual | undefined {
    return this.visuals.get(unit.id);
  }

  setSelected(unit: Unit, selected: boolean): void {
    unit.isSelected = selected;
    const visual = this.visuals.get(unit.id);
    if (visual) {
      visual.glow.setVisible(selected);
    }
  }

  updateHealthBar(unit: Unit): void {
    const visual = this.visuals.get(unit.id);
    if (!visual) return;
    this.drawHealthBar(visual.healthBar, unit);
  }

  updateStaminaBar(unit: Unit): void {
    const visual = this.visuals.get(unit.id);
    if (!visual) return;
    this.drawStaminaBar(visual.staminaBar, unit);
  }

  update(_delta: number): void {
    for (const unit of this.units) {
      if (!unit.isAlive()) continue;
      const visual = this.visuals.get(unit.id);
      if (visual) {
        visual.container.setPosition(unit.x, unit.y);
        this.drawStaminaBar(visual.staminaBar, unit);
        this.drawHealthBar(visual.healthBar, unit);

        // Brace indicator (infantry)
        visual.braceIcon.setVisible(unit.isBraced);

        // Charge trail (cavalry)
        this.updateChargeTrail(visual.chargeTrail, unit);
      }
    }
  }

  setupInitialArmies(): void {
    const center = Math.floor(MAP_COLS / 2);

    // Player army (bottom)
    const pRow = MAP_ROWS - 4;
    for (let i = 0; i < 4; i++) {
      this.createUnitSafe('infantry', 'player', center - 2 + i, pRow);
    }
    this.createUnitSafe('cavalry', 'player', center - 4, pRow);
    this.createUnitSafe('cavalry', 'player', center + 3, pRow);
    this.createUnitSafe('archer', 'player', center - 1, pRow + 1);
    this.createUnitSafe('archer', 'player', center + 1, pRow + 1);

    // Enemy army (top), mirrored
    const eRow = 3;
    for (let i = 0; i < 4; i++) {
      this.createUnitSafe('infantry', 'enemy', center - 2 + i, eRow);
    }
    this.createUnitSafe('cavalry', 'enemy', center - 4, eRow);
    this.createUnitSafe('cavalry', 'enemy', center + 3, eRow);
    this.createUnitSafe('archer', 'enemy', center - 1, eRow - 1);
    this.createUnitSafe('archer', 'enemy', center + 1, eRow - 1);
  }

  private createUnitSafe(type: string, faction: Faction, col: number, row: number): Unit | null {
    if (!this.map.isInBounds(col, row)) return null;
    const terrain = this.map.getTerrain(col, row);
    if (!terrain || !terrain.passable) {
      const offsets = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]];
      for (const [dc, dr] of offsets) {
        const nc = col + dc;
        const nr = row + dr;
        if (this.map.isInBounds(nc, nr)) {
          const t = this.map.getTerrain(nc, nr);
          if (t && t.passable && !this.getUnitAt(nc, nr)) {
            return this.createUnit(type, faction, nc, nr);
          }
        }
      }
      return null;
    }
    if (this.getUnitAt(col, row)) return null;
    return this.createUnit(type, faction, col, row);
  }

  private createVisual(unit: Unit): void {
    const pos = this.map.gridToWorld(unit.col, unit.row);
    const container = this.scene.add.container(pos.x, pos.y);
    container.setDepth(10);

    const block = this.scene.add.graphics();
    this.drawUnitBlock(block, unit);
    container.add(block);

    const healthBar = this.scene.add.graphics();
    this.drawHealthBar(healthBar, unit);
    container.add(healthBar);

    const staminaBar = this.scene.add.graphics();
    this.drawStaminaBar(staminaBar, unit);
    container.add(staminaBar);

    const glow = this.scene.add.graphics();
    this.drawSelectionGlow(glow);
    glow.setVisible(false);
    container.add(glow);

    const braceIcon = this.scene.add.graphics();
    this.drawBraceIcon(braceIcon);
    braceIcon.setVisible(false);
    container.add(braceIcon);

    const chargeTrail = this.scene.add.graphics();
    container.add(chargeTrail);

    this.visuals.set(unit.id, { container, block, healthBar, staminaBar, glow, braceIcon, chargeTrail });
  }

  private drawUnitBlock(g: Phaser.GameObjects.Graphics, unit: Unit): void {
    g.clear();
    const color = FACTION_COLORS[unit.faction];
    const hw = BLOCK_W / 2;
    const hh = BLOCK_H / 2;

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillRect(-hw + 2, -hh + 3, BLOCK_W, BLOCK_H);

    // Main block
    g.fillStyle(color, 1);
    g.fillRect(-hw, -hh, BLOCK_W, BLOCK_H);

    // 3D edges
    g.fillStyle(0xffffff, 0.15);
    g.fillRect(-hw, -hh, BLOCK_W, 2);
    g.fillRect(-hw, -hh, 2, BLOCK_H);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(-hw, hh - 2, BLOCK_W, 2);
    g.fillRect(hw - 2, -hh, 2, BLOCK_H);

    // Icon
    this.drawUnitIcon(g, unit.unitType);
  }

  private drawUnitIcon(g: Phaser.GameObjects.Graphics, type: string): void {
    const c = 0xddc8a8;
    g.lineStyle(2, c, 0.9);
    switch (type) {
      case 'infantry':
        // Crossed swords
        g.beginPath(); g.moveTo(-6, -7); g.lineTo(6, 7); g.strokePath();
        g.beginPath(); g.moveTo(6, -7); g.lineTo(-6, 7); g.strokePath();
        g.lineStyle(1.5, c, 0.7);
        g.beginPath(); g.moveTo(-3, -1); g.lineTo(-6, 2); g.strokePath();
        g.beginPath(); g.moveTo(3, -1); g.lineTo(6, 2); g.strokePath();
        break;
      case 'cavalry':
        // Charge chevrons
        g.beginPath(); g.moveTo(-6, -5); g.lineTo(2, 0); g.lineTo(-6, 5); g.strokePath();
        g.beginPath(); g.moveTo(-1, -5); g.lineTo(7, 0); g.lineTo(-1, 5); g.strokePath();
        break;
      case 'archer':
        // Bow arc
        g.beginPath(); g.arc(-3, 0, 9, -1.3, 1.3, false); g.strokePath();
        // Bowstring
        g.lineStyle(1, c, 0.5);
        g.beginPath();
        g.moveTo(-3 + 9 * Math.cos(-1.3), 9 * Math.sin(-1.3));
        g.lineTo(-3 + 9 * Math.cos(1.3), 9 * Math.sin(1.3));
        g.strokePath();
        // Arrow
        g.lineStyle(2, c, 0.9);
        g.beginPath(); g.moveTo(-3, 0); g.lineTo(9, 0); g.strokePath();
        g.beginPath(); g.moveTo(6, -3); g.lineTo(9, 0); g.lineTo(6, 3); g.strokePath();
        break;
    }
  }

  private drawHealthBar(g: Phaser.GameObjects.Graphics, unit: Unit): void {
    g.clear();
    const hw = BLOCK_W / 2;
    const barY = BLOCK_H / 2 + 3;
    const barH = 3;
    const ratio = unit.hp / unit.maxHp;

    g.fillStyle(0x333333, 0.8);
    g.fillRect(-hw, barY, BLOCK_W, barH);

    let barColor = 0x44cc44;
    if (ratio < 0.3) barColor = 0xcc4444;
    else if (ratio < 0.6) barColor = 0xcccc44;
    g.fillStyle(barColor, 0.9);
    g.fillRect(-hw, barY, Math.floor(BLOCK_W * ratio), barH);
  }

  private drawSelectionGlow(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    const hw = BLOCK_W / 2 + 3;
    const hh = BLOCK_H / 2 + 3;
    for (let i = 3; i >= 1; i--) {
      g.lineStyle(2, 0xffd700, 0.2 + (3 - i) * 0.15);
      g.strokeRect(-hw - i, -hh - i, (hw + i) * 2, (hh + i) * 2);
    }
    g.lineStyle(2, 0xffd700, 0.8);
    g.strokeRect(-hw, -hh, hw * 2, hh * 2);
  }

  private drawStaminaBar(g: Phaser.GameObjects.Graphics, unit: Unit): void {
    g.clear();
    const hw = BLOCK_W / 2;
    const barY = BLOCK_H / 2 + 3 + 3 + 2; // below health bar (barH=3) + gap
    const barH = 2;
    const ratio = unit.stamina / unit.maxStamina;

    g.fillStyle(0x333333, 0.8);
    g.fillRect(-hw, barY, BLOCK_W, barH);

    g.fillStyle(0x4488cc, 0.9);
    g.fillRect(-hw, barY, Math.floor(BLOCK_W * ratio), barH);
  }

  private drawBraceIcon(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    // Small gold shield shape above the unit
    const cy = -BLOCK_H / 2 - 10;
    g.fillStyle(0xffd700, 0.85);
    g.beginPath();
    g.moveTo(-5, cy - 4);
    g.lineTo(5, cy - 4);
    g.lineTo(5, cy + 2);
    g.lineTo(0, cy + 6);
    g.lineTo(-5, cy + 2);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0x8b6914, 0.9);
    g.strokePath();
  }

  private updateChargeTrail(g: Phaser.GameObjects.Graphics, unit: Unit): void {
    g.clear();
    if (!unit.isCharging) return;

    // Speed lines behind the unit opposite to facing direction
    const angle = unit.facingAngle + Math.PI;
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * 0.3;
      const a = angle + spread;
      const startDist = 12 + i * 3;
      const endDist = 22 + i * 4;
      const sx = Math.cos(a) * startDist;
      const sy = Math.sin(a) * startDist;
      const ex = Math.cos(a) * endDist;
      const ey = Math.sin(a) * endDist;
      g.lineStyle(1.5, 0xffd700, 0.5 - i * 0.12);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
      g.strokePath();
    }
  }
}
