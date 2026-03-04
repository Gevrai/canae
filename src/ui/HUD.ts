import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { UnitSystem } from '../systems/UnitSystem';
import type { MapSystem } from '../systems/MapSystem';
import { MAP_COLS, MAP_ROWS, TILE_SIZE, MAP_MARGIN } from '../config/game.config';
import { FACTION_COLORS } from '../config/units.config';
import { UnitPanel } from './UnitPanel';

interface CombatLogEntry {
  text: string;
  time: number;
}

export class HUD {
  private scene: Phaser.Scene;
  private unitSystem!: UnitSystem;
  private map!: MapSystem;

  // Root container for all HUD elements (zoom-compensated)
  private root!: Phaser.GameObjects.Container;

  // Top bar
  private topBar!: Phaser.GameObjects.Graphics;
  private playerCountText!: Phaser.GameObjects.Text;
  private enemyCountText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private battleTime = 0;

  // Bottom panel
  private unitPanel!: UnitPanel;

  // Minimap
  private minimapContainer!: Phaser.GameObjects.Container;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private minimapUnits!: Phaser.GameObjects.Graphics;
  private minimapViewport!: Phaser.GameObjects.Graphics;
  private minimapHitZone!: Phaser.GameObjects.Zone;
  private readonly MINIMAP_W = 160;
  private readonly MINIMAP_H = 107;
  private readonly MINIMAP_MARGIN = 8;

  // Combat log
  private combatLog: CombatLogEntry[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];
  private readonly MAX_LOG = 4;
  private readonly LOG_LIFETIME = 8000;

  // Fullscreen button
  private fsBtn!: Phaser.GameObjects.Text;

  // Unit counts for top bar
  private playerTotal = 0;
  private enemyTotal = 0;

  // Compact mode
  private compact = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(unitSystem: UnitSystem, map: MapSystem): void {
    this.unitSystem = unitSystem;
    this.map = map;
    this.battleTime = 0;
    this.combatLog = [];
    this.compact = this.scene.scale.width < 500;

    this.playerTotal = unitSystem.getUnitsByFaction('player').length;
    this.enemyTotal = unitSystem.getUnitsByFaction('enemy').length;

    // Root container: scrollFactor(0) + zoom compensation in update()
    this.root = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(200);

    this.createTopBar();
    this.unitPanel = new UnitPanel(this.scene);
    this.createMinimap();
    this.createCombatLog();
    this.createFullscreenButton();
  }

  update(delta: number): void {
    this.battleTime += delta;

    // Compensate for camera zoom so HUD stays fixed on screen
    this.compensateZoom(this.root);
    const panelContainer = this.unitPanel.getContainer();
    if (panelContainer) {
      this.compensateZoom(panelContainer);
    }

    this.updateTopBar();
    this.updateMinimap();
    this.updateCombatLogFade();
  }

  /** Adjust a scrollFactor(0) container to counteract camera zoom. */
  private compensateZoom(container: Phaser.GameObjects.Container): void {
    const cam = this.scene.cameras.main;
    const z = cam.zoom;
    const w = cam.width;
    const h = cam.height;
    container.setScale(1 / z);
    container.setPosition(
      -w / 2 * (1 - z) / z,
      -h / 2 * (1 - z) / z,
    );
  }

  showUnit(unit: Unit | null, terrain: string | null, terrainBonus: number): void {
    if (unit) {
      this.unitPanel.show(unit, terrain, terrainBonus);
    } else {
      this.unitPanel.hide();
    }
  }

  addCombatLog(message: string): void {
    this.combatLog.push({ text: message, time: this.battleTime });
    if (this.combatLog.length > this.MAX_LOG) {
      this.combatLog.shift();
    }
    this.refreshCombatLog();
  }

  destroy(): void {
    this.unitPanel?.hide();
    this.logTexts = [];
    this.root?.destroy();
  }

  // --- Top Bar ---
  private createTopBar(): void {
    const w = this.scene.scale.width;
    const barH = 36;

    this.topBar = this.scene.add.graphics();
    this.topBar.fillStyle(0x1a1a1a, 0.65);
    this.topBar.fillRect(0, 0, w, barH);
    this.topBar.lineStyle(1, 0x8b7355, 0.4);
    this.topBar.beginPath();
    this.topBar.moveTo(0, barH);
    this.topBar.lineTo(w, barH);
    this.topBar.strokePath();
    this.root.add(this.topBar);

    const fontSize = this.compact ? '13px' : '15px';

    this.playerCountText = this.scene.add.text(12, 8, '', {
      fontSize,
      color: '#e8a0a0',
      fontFamily: 'Georgia, serif',
    });
    this.root.add(this.playerCountText);

    this.enemyCountText = this.scene.add.text(this.compact ? 140 : 200, 8, '', {
      fontSize,
      color: '#b8a0d0',
      fontFamily: 'Georgia, serif',
    });
    this.root.add(this.enemyCountText);

    this.timerText = this.scene.add.text(w / 2, 8, '', {
      fontSize,
      color: '#d0c8b0',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5, 0);
    this.root.add(this.timerText);
  }

  private updateTopBar(): void {
    const playerAlive = this.unitSystem.getUnitsByFaction('player').length;
    const enemyAlive = this.unitSystem.getUnitsByFaction('enemy').length;

    this.playerCountText.setText(`⚔ Player: ${playerAlive}/${this.playerTotal}`);
    this.enemyCountText.setText(`☠ Enemy: ${enemyAlive}/${this.enemyTotal}`);

    const secs = Math.floor(this.battleTime / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
  }

  // --- Minimap ---
  private createMinimap(): void {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const mx = sw - this.MINIMAP_W - this.MINIMAP_MARGIN;
    const my = sh - this.MINIMAP_H - this.MINIMAP_MARGIN;

    this.minimapContainer = this.scene.add.container(mx, my);

    // Background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a1a, 0.6);
    bg.fillRect(-2, -2, this.MINIMAP_W + 4, this.MINIMAP_H + 4);
    bg.lineStyle(1, 0x8b7355, 0.5);
    bg.strokeRect(-2, -2, this.MINIMAP_W + 4, this.MINIMAP_H + 4);
    this.minimapContainer.add(bg);

    // Terrain
    this.minimapGraphics = this.scene.add.graphics();
    this.drawMinimapTerrain();
    this.minimapContainer.add(this.minimapGraphics);

    // Units overlay
    this.minimapUnits = this.scene.add.graphics();
    this.minimapContainer.add(this.minimapUnits);

    // Viewport rectangle
    this.minimapViewport = this.scene.add.graphics();
    this.minimapContainer.add(this.minimapViewport);

    this.root.add(this.minimapContainer);

    // Make minimap tappable for quick-pan
    this.minimapHitZone = this.scene.add.zone(
      mx + this.MINIMAP_W / 2,
      my + this.MINIMAP_H / 2,
      this.MINIMAP_W,
      this.MINIMAP_H,
    ).setInteractive();
    this.root.add(this.minimapHitZone);

    this.minimapHitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.x - mx;
      const localY = pointer.y - my;
      const worldX = (localX / this.MINIMAP_W) * (MAP_COLS * TILE_SIZE + MAP_MARGIN * 2);
      const worldY = (localY / this.MINIMAP_H) * (MAP_ROWS * TILE_SIZE + MAP_MARGIN * 2);
      this.scene.cameras.main.centerOn(worldX, worldY);
    });
  }

  private drawMinimapTerrain(): void {
    this.minimapGraphics.clear();
    const cw = this.MINIMAP_W / MAP_COLS;
    const ch = this.MINIMAP_H / MAP_ROWS;

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const t = this.map.getTerrain(c, r);
        if (!t) continue;
        this.minimapGraphics.fillStyle(t.color, 0.8);
        this.minimapGraphics.fillRect(c * cw, r * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
  }

  private updateMinimap(): void {
    this.minimapUnits.clear();
    const cw = this.MINIMAP_W / MAP_COLS;
    const ch = this.MINIMAP_H / MAP_ROWS;

    const units = this.unitSystem.getUnits();
    for (const u of units) {
      if (!u.isAlive()) continue;
      const color = FACTION_COLORS[u.faction];
      this.minimapUnits.fillStyle(color, 1);
      this.minimapUnits.fillCircle(u.col * cw + cw / 2, u.row * ch + ch / 2, 2.5);
    }

    // Viewport rectangle
    this.minimapViewport.clear();
    const cam = this.scene.cameras.main;
    const mapW = MAP_COLS * TILE_SIZE + MAP_MARGIN * 2;
    const mapH = MAP_ROWS * TILE_SIZE + MAP_MARGIN * 2;
    const vx = (cam.scrollX / mapW) * this.MINIMAP_W;
    const vy = (cam.scrollY / mapH) * this.MINIMAP_H;
    const vw = ((cam.width / cam.zoom) / mapW) * this.MINIMAP_W;
    const vh = ((cam.height / cam.zoom) / mapH) * this.MINIMAP_H;
    this.minimapViewport.lineStyle(1, 0xffd700, 0.8);
    this.minimapViewport.strokeRect(vx, vy, vw, vh);
  }

  // --- Combat Log ---
  private createCombatLog(): void {
    this.logTexts = [];
  }

  private refreshCombatLog(): void {
    for (const t of this.logTexts) t.destroy();
    this.logTexts = [];

    const sw = this.scene.scale.width;
    const fontSize = this.compact ? '11px' : '12px';
    const logX = sw - this.MINIMAP_W - this.MINIMAP_MARGIN - 10;

    for (let i = 0; i < this.combatLog.length; i++) {
      const entry = this.combatLog[i];
      const age = this.battleTime - entry.time;
      const alpha = Math.max(0.2, 1 - age / this.LOG_LIFETIME);

      const txt = this.scene.add.text(logX, 44 + i * 18, entry.text, {
        fontSize,
        color: '#d0c8b0',
        fontFamily: 'Georgia, serif',
        wordWrap: { width: this.compact ? 200 : 280 },
      }).setOrigin(1, 0).setAlpha(alpha);
      this.root.add(txt);

      this.logTexts.push(txt);
    }
  }

  private updateCombatLogFade(): void {
    const now = this.battleTime;
    let changed = false;

    // Remove old entries
    while (this.combatLog.length > 0 && now - this.combatLog[0].time > this.LOG_LIFETIME) {
      this.combatLog.shift();
      changed = true;
    }

    if (changed) {
      this.refreshCombatLog();
      return;
    }

    // Update alpha on existing
    for (let i = 0; i < this.logTexts.length; i++) {
      if (i >= this.combatLog.length) break;
      const age = now - this.combatLog[i].time;
      const alpha = Math.max(0.2, 1 - age / this.LOG_LIFETIME);
      this.logTexts[i].setAlpha(alpha);
    }
  }

  // --- Fullscreen ---
  private createFullscreenButton(): void {
    const sw = this.scene.scale.width;
    this.fsBtn = this.scene.add.text(sw - 40, 8, '⛶', {
      fontSize: '20px',
      color: '#d0c8b0',
      fontFamily: 'sans-serif',
    }).setInteractive({ useHandCursor: true });
    this.root.add(this.fsBtn);

    this.fsBtn.on('pointerdown', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  }
}
