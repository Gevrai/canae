import Phaser from 'phaser';
import type { Unit } from '../entities/Unit';

export class UnitPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  show(unit: Unit, terrainName: string | null, terrainBonus: number, terrainSpeed: number = 1.0): void {
    this.hide();

    const { width, height } = this.scene.scale;
    const compact = width < 500;
    const pw = compact ? width - 16 : 360;
    const ph = compact ? 125 : 145;
    const px = compact ? 8 : (width - pw) / 2;
    const py = height - ph - 8;

    this.container = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(200);

    // Panel background
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a1a, 0.75);
    bg.fillRoundedRect(px, py, pw, ph, 8);
    bg.lineStyle(1, 0x8b7355, 0.5);
    bg.strokeRoundedRect(px, py, pw, ph, 8);
    this.container.add(bg);

    const lx = px + 12;
    const smallFont = compact ? '11px' : '12px';

    // Unit type icon & name
    const iconG = this.scene.add.graphics();
    this.drawUnitIcon(iconG, unit.unitType, lx + 16, py + 22);
    this.container.add(iconG);

    const name = unit.unitType.charAt(0).toUpperCase() + unit.unitType.slice(1);
    this.container.add(this.scene.add.text(lx + 38, py + 12, name, {
      fontSize: compact ? '15px' : '18px',
      color: '#e8d8c0',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }));

    // Health bar
    const hpX = lx + 38;
    const hpY = py + (compact ? 34 : 38);
    const barW = compact ? 120 : 160;
    const barH = 10;
    const hpRatio = unit.hp / unit.maxHp;
    const hpG = this.scene.add.graphics();
    hpG.fillStyle(0x333333, 0.8);
    hpG.fillRoundedRect(hpX, hpY, barW, barH, 3);
    let hpColor = 0x44cc44;
    if (hpRatio < 0.3) hpColor = 0xcc4444;
    else if (hpRatio < 0.6) hpColor = 0xcccc44;
    hpG.fillStyle(hpColor, 0.9);
    hpG.fillRoundedRect(hpX, hpY, Math.max(4, barW * hpRatio), barH, 3);
    this.container.add(hpG);

    this.container.add(this.scene.add.text(hpX + barW + 6, hpY - 2, `${unit.hp}/${unit.maxHp}`, {
      fontSize: smallFont,
      color: '#cccccc',
      fontFamily: 'Georgia, serif',
    }));

    // Morale bar
    const morY = hpY + barH + 4;
    const morRatio = unit.morale / 100;
    const morG = this.scene.add.graphics();
    morG.fillStyle(0x333333, 0.8);
    morG.fillRoundedRect(hpX, morY, barW, barH - 2, 3);
    morG.fillStyle(0x4488dd, 0.9);
    morG.fillRoundedRect(hpX, morY, Math.max(4, barW * morRatio), barH - 2, 3);
    this.container.add(morG);

    this.container.add(this.scene.add.text(hpX + barW + 6, morY - 2, `Morale: ${Math.round(unit.morale)}`, {
      fontSize: smallFont,
      color: '#aaaacc',
      fontFamily: 'Georgia, serif',
    }));

    // Stamina bar
    const stamY = morY + barH + 2;
    const stamRatio = unit.stamina / unit.maxStamina;
    const stamG = this.scene.add.graphics();
    stamG.fillStyle(0x333333, 0.8);
    stamG.fillRoundedRect(hpX, stamY, barW, barH - 2, 3);
    stamG.fillStyle(0x4488cc, 0.9);
    stamG.fillRoundedRect(hpX, stamY, Math.max(4, barW * stamRatio), barH - 2, 3);
    this.container.add(stamG);

    this.container.add(this.scene.add.text(hpX + barW + 6, stamY - 2, `Stamina: ${Math.round(unit.stamina)}/${unit.maxStamina}`, {
      fontSize: smallFont,
      color: '#88aacc',
      fontFamily: 'Georgia, serif',
    }));

    // Stats column (right side)
    const statsX = compact ? px + pw - 100 : px + pw / 2 + 30;
    const statsY = py + 12;
    const statsLines = [
      `⚔ ATK: ${unit.attack}`,
      `🛡 DEF: ${unit.defense}`,
      `💨 SPD: ${unit.speed.toFixed(1)}`,
    ];
    this.container.add(this.scene.add.text(statsX, statsY, statsLines.join('\n'), {
      fontSize: smallFont,
      color: '#c8c0a8',
      fontFamily: 'Georgia, serif',
      lineSpacing: 4,
    }));

    // Status effects
    const statusY = py + ph - (compact ? 24 : 28);
    const statuses: string[] = [];
    if (unit.hasChargeBonus) statuses.push('Charging');
    if (unit.isCharging) statuses.push('⚡ Charge');
    if (unit.isBraced) statuses.push('🛡 Braced');
    if (unit.isRouting) statuses.push('Routing');
    if (unit.attackTargetId) statuses.push('In Combat');

    if (statuses.length > 0) {
      this.container.add(this.scene.add.text(lx, statusY, statuses.join(' · '), {
        fontSize: smallFont,
        color: unit.isRouting ? '#ff6666' : '#ffd700',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      }));
    }

    // Terrain info
    if (terrainName) {
      const bonusStr = terrainBonus > 0 ? ` (+${Math.round(terrainBonus * 100)}% DEF)` : '';
      const speedStr = terrainSpeed !== 1.0 ? ` · ${Math.round(terrainSpeed * 100)}% SPD` : '';
      this.container.add(this.scene.add.text(statsX, statusY, `📍 ${terrainName}${bonusStr}${speedStr}`, {
        fontSize: smallFont,
        color: '#a0b898',
        fontFamily: 'Georgia, serif',
      }));
    }

    // Dismiss button
    const dismissBtn = this.scene.add.text(px + pw - 12, py + 8, '✕', {
      fontSize: '18px',
      color: '#a09080',
      fontFamily: 'sans-serif',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    dismissBtn.on('pointerdown', () => {
      this.scene.events.emit('hud:dismiss');
    });
    this.container.add(dismissBtn);
  }

  hide(): void {
    this.container?.destroy();
    this.container = null;
  }

  /** Get the current container for zoom compensation. */
  getContainer(): Phaser.GameObjects.Container | null {
    return this.container;
  }

  private drawUnitIcon(g: Phaser.GameObjects.Graphics, type: string, cx: number, cy: number): void {
    g.lineStyle(2, 0xddc8a8, 0.9);
    switch (type) {
      case 'infantry':
        g.beginPath(); g.moveTo(cx - 6, cy - 7); g.lineTo(cx + 6, cy + 7); g.strokePath();
        g.beginPath(); g.moveTo(cx + 6, cy - 7); g.lineTo(cx - 6, cy + 7); g.strokePath();
        g.lineStyle(1.5, 0xddc8a8, 0.7);
        g.beginPath(); g.moveTo(cx - 3, cy - 1); g.lineTo(cx - 6, cy + 2); g.strokePath();
        g.beginPath(); g.moveTo(cx + 3, cy - 1); g.lineTo(cx + 6, cy + 2); g.strokePath();
        break;
      case 'cavalry':
        g.beginPath(); g.moveTo(cx - 6, cy - 5); g.lineTo(cx + 4, cy); g.lineTo(cx - 6, cy + 5); g.strokePath();
        g.beginPath(); g.moveTo(cx - 1, cy - 5); g.lineTo(cx + 9, cy); g.lineTo(cx - 1, cy + 5); g.strokePath();
        break;
      case 'archer':
        g.beginPath(); g.arc(cx - 3, cy, 9, -1.3, 1.3, false); g.strokePath();
        g.lineStyle(1, 0xddc8a8, 0.5);
        g.beginPath();
        g.moveTo(cx - 3 + 9 * Math.cos(-1.3), cy + 9 * Math.sin(-1.3));
        g.lineTo(cx - 3 + 9 * Math.cos(1.3), cy + 9 * Math.sin(1.3));
        g.strokePath();
        g.lineStyle(2, 0xddc8a8, 0.9);
        g.beginPath(); g.moveTo(cx - 3, cy); g.lineTo(cx + 9, cy); g.strokePath();
        g.beginPath(); g.moveTo(cx + 6, cy - 3); g.lineTo(cx + 9, cy); g.lineTo(cx + 6, cy + 3); g.strokePath();
        break;
    }
  }
}
