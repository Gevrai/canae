import Phaser from 'phaser';
import { PARCHMENT_BG } from '../config/game.config';
import { AudioSystem } from '../systems/AudioSystem';

interface BattleStats {
  result: 'victory' | 'defeat';
  playerKills: number;
  playerLost: number;
  enemyKills: number;
  enemyLost: number;
  duration: number;
  mvpName: string;
  mvpKills: number;
}

const DEFAULT_STATS: BattleStats = {
  result: 'defeat',
  playerKills: 0,
  playerLost: 0,
  enemyKills: 0,
  enemyLost: 0,
  duration: 0,
  mvpName: 'None',
  mvpKills: 0,
};

export class GameOverScene extends Phaser.Scene {
  private stats: BattleStats = { ...DEFAULT_STATS };

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: Partial<BattleStats> & { result?: 'victory' | 'defeat' }): void {
    this.stats = { ...DEFAULT_STATS, ...data, result: data?.result ?? 'defeat' };
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(PARCHMENT_BG);

    const isVictory = this.stats.result === 'victory';

    // Border
    const g = this.add.graphics();
    g.lineStyle(3, 0x8b7355, 0.5);
    g.strokeRect(24, 24, width - 48, height - 48);
    g.lineStyle(1, 0xa08a68, 0.3);
    g.strokeRect(30, 30, width - 60, height - 60);

    // Laurel wreath for victory
    if (isVictory) {
      this.drawLaurelWreath(width / 2, height * 0.2, 80);
    }

    // Title
    const title = isVictory ? 'VICTORIA' : 'DEFEAT';
    const titleColor = isVictory ? '#8B6914' : '#8B2500';
    this.add.text(width / 2, height * 0.2, title, {
      fontSize: '64px',
      color: titleColor,
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontStyle: 'bold',
      stroke: isVictory ? '#5a4a1a' : '#3a1510',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Subtitle
    const subtitle = isVictory
      ? 'The enemy has been vanquished!'
      : 'Your forces have been routed.';
    this.add.text(width / 2, height * 0.30, subtitle, {
      fontSize: '18px',
      color: '#8b7355',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Play result sound
    if (isVictory) {
      AudioSystem.getInstance().playVictory();
    } else {
      AudioSystem.getInstance().playDefeat();
    }

    // Stats panel
    const secs = Math.floor(this.stats.duration / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const statsLines = [
      `Enemy Units Destroyed: ${this.stats.enemyLost}`,
      `Units Lost: ${this.stats.playerLost}`,
      `Battle Duration: ${m}:${s.toString().padStart(2, '0')}`,
      `MVP: ${this.stats.mvpName} (${this.stats.mvpKills} kills)`,
    ];

    const statsY = height * 0.38;
    for (let i = 0; i < statsLines.length; i++) {
      this.add.text(width / 2, statsY + i * 28, statsLines[i], {
        fontSize: '16px',
        color: '#5a4a30',
        fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);
    }

    // Decorative separator
    g.lineStyle(1.5, 0x8b7355, 0.5);
    g.beginPath();
    g.moveTo(width / 2 - 100, height * 0.60);
    g.lineTo(width / 2 + 100, height * 0.60);
    g.strokePath();

    // Buttons
    this.createButton(width / 2, height * 0.68, 'Play Again', () => {
      this.scene.start('BattleScene');
    });

    this.createButton(width / 2, height * 0.78, 'Main Menu', () => {
      this.scene.start('MenuScene');
    });
  }

  private createButton(x: number, y: number, label: string, callback: () => void): void {
    const bw = 220;
    const bh = 44;

    const bg = this.add.graphics();
    this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, false);

    const txt = this.add.text(0, 0, label, {
      fontSize: '20px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, txt]);
    container.setSize(bw, bh);
    container.setInteractive({ useHandCursor: true });

    container.on('pointerover', () => {
      this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, true);
      txt.setColor('#2a1a0a');
    });
    container.on('pointerout', () => {
      this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, false);
      txt.setColor('#4a3520');
    });
    container.on('pointerdown', () => { container.setScale(0.96); });
    container.on('pointerup', () => {
      container.setScale(1);
      callback();
    });
  }

  private drawButtonBg(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, hover: boolean): void {
    g.clear();
    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(x + 2, y + 2, w, h, 6);
    g.fillStyle(hover ? 0xd4c0a0 : 0xddd0b8, 1);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1.5, 0x8b7355, 0.7);
    g.strokeRoundedRect(x, y, w, h, 6);
    g.fillStyle(0xffffff, 0.1);
    g.fillRoundedRect(x + 2, y + 2, w - 4, h / 3, { tl: 5, tr: 5, bl: 0, br: 0 });
  }

  private drawLaurelWreath(cx: number, cy: number, radius: number): void {
    const g = this.add.graphics();
    const leafColor = 0x6b7a4b;

    for (let i = 0; i < 8; i++) {
      const angle = Math.PI * 0.7 + (i / 8) * Math.PI * 0.6;
      const lx = cx + Math.cos(angle) * radius;
      const ly = cy + Math.sin(angle) * radius * 0.5;
      g.fillStyle(leafColor, 0.5 - i * 0.03);
      g.fillEllipse(lx, ly, 12, 6);
    }
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI * 0.3 - (i / 8) * Math.PI * 0.6;
      const lx = cx + Math.cos(angle) * radius;
      const ly = cy + Math.sin(angle) * radius * 0.5;
      g.fillStyle(leafColor, 0.5 - i * 0.03);
      g.fillEllipse(lx, ly, 12, 6);
    }
    g.lineStyle(1.5, 0x5a6940, 0.4);
    g.beginPath();
    g.arc(cx, cy, radius * 0.85, Math.PI * 0.75, Math.PI * 1.25, false);
    g.strokePath();
    g.beginPath();
    g.arc(cx, cy, radius * 0.85, -Math.PI * 0.25, Math.PI * 0.25, false);
    g.strokePath();
  }
}
