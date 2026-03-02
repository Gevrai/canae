import Phaser from 'phaser';
import { PARCHMENT_BG } from '../config/game.config';
import { loadSettings, saveSettings } from '../config/settings';
import type { GameSettings } from '../config/settings';
import type { AIDifficulty } from '../systems/AISystem';
import { PeerManager } from '../multiplayer/PeerManager';
import { GameSync } from '../multiplayer/GameSync';

export class MenuScene extends Phaser.Scene {
  private settings!: GameSettings;
  private settingsOverlay: Phaser.GameObjects.Container | null = null;
  private lobbyOverlay: Phaser.GameObjects.Container | null = null;
  private peerManager: PeerManager | null = null;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Clean up any previous peer connection
    this.peerManager?.disconnect();
    this.peerManager = null;

    this.settings = loadSettings();
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(PARCHMENT_BG);

    // Parchment background decorations
    this.drawBackground(width, height);

    // Laurel wreath around title
    this.drawLaurelWreath(width / 2, height * 0.22, 90);

    // Title
    this.add.text(width / 2, height * 0.22, 'CANAE', {
      fontSize: '72px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontStyle: 'bold',
      stroke: '#3a2510',
      strokeThickness: 2,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(width / 2, height * 0.33, 'A Game of Ancient Warfare', {
      fontSize: '20px',
      color: '#8b7355',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);

    // Decorative line
    const g = this.add.graphics();
    g.lineStyle(2, 0x8b7355, 0.6);
    g.beginPath();
    g.moveTo(width / 2 - 140, height * 0.38);
    g.lineTo(width / 2 + 140, height * 0.38);
    g.strokePath();
    // Small diamond in center
    const dy = height * 0.38;
    g.fillStyle(0x8b7355, 0.6);
    g.fillTriangle(width / 2 - 5, dy, width / 2, dy - 4, width / 2 + 5, dy);
    g.fillTriangle(width / 2 - 5, dy, width / 2, dy + 4, width / 2 + 5, dy);

    // Menu buttons
    this.createButton(width / 2, height * 0.50, 'Solo Battle', () => {
      this.scene.start('BattleScene', { difficulty: this.settings.difficulty });
    });

    this.createButton(width / 2, height * 0.62, 'Multiplayer', () => {
      this.showLobby();
    });

    this.createButton(width / 2, height * 0.74, 'Settings', () => {
      this.toggleSettings();
    });

    // Version
    this.add.text(width - 10, height - 10, 'v0.7', {
      fontSize: '12px',
      color: '#b0a080',
      fontFamily: 'Georgia, serif',
    }).setOrigin(1, 1);
  }

  private drawBackground(w: number, h: number): void {
    const g = this.add.graphics();

    // Border decoration
    const m = 24;
    g.lineStyle(3, 0x8b7355, 0.5);
    g.strokeRect(m, m, w - m * 2, h - m * 2);
    g.lineStyle(1, 0xa08a68, 0.3);
    g.strokeRect(m + 6, m + 6, w - m * 2 - 12, h - m * 2 - 12);

    // Corner ornaments
    const corners = [
      { x: m + 6, y: m + 6 },
      { x: w - m - 6, y: m + 6 },
      { x: m + 6, y: h - m - 6 },
      { x: w - m - 6, y: h - m - 6 },
    ];
    g.lineStyle(1.5, 0x8b7355, 0.5);
    for (const c of corners) {
      const sx = c.x < w / 2 ? 1 : -1;
      const sy = c.y < h / 2 ? 1 : -1;
      g.beginPath();
      g.moveTo(c.x, c.y + 20 * sy);
      g.lineTo(c.x, c.y);
      g.lineTo(c.x + 20 * sx, c.y);
      g.strokePath();
    }

    // Subtle vignette
    for (let i = 0; i < 60; i++) {
      const alpha = 0.05 * (1 - i / 60);
      g.fillStyle(0x5a4a30, alpha);
      g.fillRect(0, i, w, 1);
      g.fillRect(0, h - i - 1, w, 1);
      g.fillRect(i, 0, 1, h);
      g.fillRect(w - i - 1, 0, 1, h);
    }
  }

  private drawLaurelWreath(cx: number, cy: number, radius: number): void {
    const g = this.add.graphics();
    const leafColor = 0x6b7a4b;

    // Left branch
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI * 0.7 + (i / 8) * Math.PI * 0.6;
      const lx = cx + Math.cos(angle) * radius;
      const ly = cy + Math.sin(angle) * radius * 0.5;
      g.fillStyle(leafColor, 0.5 - i * 0.03);
      g.fillEllipse(lx, ly, 12, 6);
    }
    // Right branch (mirrored)
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI * 0.3 - (i / 8) * Math.PI * 0.6;
      const lx = cx + Math.cos(angle) * radius;
      const ly = cy + Math.sin(angle) * radius * 0.5;
      g.fillStyle(leafColor, 0.5 - i * 0.03);
      g.fillEllipse(lx, ly, 12, 6);
    }
    // Stems
    g.lineStyle(1.5, 0x5a6940, 0.4);
    g.beginPath();
    g.arc(cx, cy, radius * 0.85, Math.PI * 0.75, Math.PI * 1.25, false);
    g.strokePath();
    g.beginPath();
    g.arc(cx, cy, radius * 0.85, -Math.PI * 0.25, Math.PI * 0.25, false);
    g.strokePath();
  }

  private createButton(x: number, y: number, label: string, callback: () => void): void {
    const bw = 240;
    const bh = 48;

    const bg = this.add.graphics();
    this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, false);

    const txt = this.add.text(0, 0, label, {
      fontSize: '22px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [bg, txt]);
    const hitZone = this.add.zone(x, y, bw, bh).setInteractive({ useHandCursor: true });

    hitZone.on('pointerover', () => {
      this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, true);
      txt.setColor('#2a1a0a');
    });
    hitZone.on('pointerout', () => {
      this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, false);
      txt.setColor('#4a3520');
    });
    hitZone.on('pointerdown', () => {
      container.setScale(0.96);
    });
    hitZone.on('pointerup', () => {
      container.setScale(1);
      callback();
    });
  }

  private drawButtonBg(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, hover: boolean): void {
    g.clear();
    // Shadow
    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(x + 2, y + 2, w, h, 6);
    // Main
    g.fillStyle(hover ? 0xd4c0a0 : 0xddd0b8, 1);
    g.fillRoundedRect(x, y, w, h, 6);
    // Border
    g.lineStyle(1.5, 0x8b7355, 0.7);
    g.strokeRoundedRect(x, y, w, h, 6);
    // Top highlight
    g.fillStyle(0xffffff, 0.1);
    g.fillRoundedRect(x + 2, y + 2, w - 4, h / 3, { tl: 5, tr: 5, bl: 0, br: 0 });
  }

  // --- Multiplayer Lobby ---
  private showLobby(): void {
    if (this.lobbyOverlay) {
      this.closeLobby();
      return;
    }
    const { width, height } = this.scale;
    const pw = 380;
    const ph = 320;
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;

    const overlay = this.add.container(0, 0);

    // Dim background
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4).setInteractive();
    dim.on('pointerdown', () => { this.closeLobby(); });
    overlay.add(dim);

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0xddd0b8, 1);
    panel.fillRoundedRect(px, py, pw, ph, 8);
    panel.lineStyle(2, 0x8b7355, 0.8);
    panel.strokeRoundedRect(px, py, pw, ph, 8);
    overlay.add(panel);

    // Title
    overlay.add(this.add.text(width / 2, py + 30, 'Multiplayer', {
      fontSize: '26px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    // Create Game button
    this.addLobbyButton(overlay, width / 2, py + 90, 'Create Game', () => {
      this.closeLobby();
      this.showCreateGame();
    });

    // Join Game button
    this.addLobbyButton(overlay, width / 2, py + 150, 'Join Game', () => {
      this.closeLobby();
      this.showJoinGame();
    });

    // Back button
    this.addLobbyButton(overlay, width / 2, py + 240, 'Back', () => {
      this.closeLobby();
    });

    // Close button
    const closeBtn = this.add.text(px + pw - 12, py + 8, '✕', {
      fontSize: '22px',
      color: '#8b7355',
      fontFamily: 'sans-serif',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this.closeLobby(); });
    overlay.add(closeBtn);

    this.lobbyOverlay = overlay;
  }

  private closeLobby(): void {
    this.lobbyOverlay?.destroy();
    this.lobbyOverlay = null;
  }

  private addLobbyButton(container: Phaser.GameObjects.Container, x: number, y: number, label: string, callback: () => void): void {
    const bw = 220;
    const bh = 44;

    const bg = this.add.graphics();
    this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, false);

    const txt = this.add.text(0, 0, label, {
      fontSize: '20px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const btnContainer = this.add.container(x, y, [bg, txt]);
    container.add(btnContainer);

    const hitZone = this.add.zone(x, y, bw, bh).setInteractive({ useHandCursor: true });
    hitZone.on('pointerover', () => { this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, true); txt.setColor('#2a1a0a'); });
    hitZone.on('pointerout', () => { this.drawButtonBg(bg, -bw / 2, -bh / 2, bw, bh, false); txt.setColor('#4a3520'); });
    hitZone.on('pointerdown', () => { btnContainer.setScale(0.96); });
    hitZone.on('pointerup', () => { btnContainer.setScale(1); callback(); });
    container.add(hitZone);
  }

  private showCreateGame(): void {
    const { width, height } = this.scale;
    const pw = 380;
    const ph = 280;
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;

    const overlay = this.add.container(0, 0);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4).setInteractive();
    overlay.add(dim);

    const panel = this.add.graphics();
    panel.fillStyle(0xddd0b8, 1);
    panel.fillRoundedRect(px, py, pw, ph, 8);
    panel.lineStyle(2, 0x8b7355, 0.8);
    panel.strokeRoundedRect(px, py, pw, ph, 8);
    overlay.add(panel);

    overlay.add(this.add.text(width / 2, py + 30, 'Create Game', {
      fontSize: '24px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    const statusText = this.add.text(width / 2, py + 70, 'Creating lobby...', {
      fontSize: '16px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
    overlay.add(statusText);

    const codeText = this.add.text(width / 2, py + 110, '', {
      fontSize: '36px',
      color: '#8B2500',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      letterSpacing: 8,
    }).setOrigin(0.5);
    overlay.add(codeText);

    // Copy button (hidden initially)
    const copyBtn = this.add.text(width / 2, py + 155, '📋 Copy Code', {
      fontSize: '14px',
      color: '#5a3a1a',
      backgroundColor: '#c8b898',
      padding: { x: 12, y: 6 },
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false);
    overlay.add(copyBtn);

    const waitText = this.add.text(width / 2, py + 195, '', {
      fontSize: '16px',
      color: '#8b7355',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);
    overlay.add(waitText);

    // Cancel button
    this.addLobbyButton(overlay, width / 2, py + 240, 'Cancel', () => {
      this.peerManager?.disconnect();
      this.peerManager = null;
      overlay.destroy();
    });

    this.lobbyOverlay = overlay;

    // Create peer lobby
    this.peerManager = new PeerManager();
    this.peerManager.createLobby().then((code) => {
      statusText.setText('Room Code:');
      codeText.setText(code);
      copyBtn.setVisible(true);
      waitText.setText('Waiting for opponent...');

      copyBtn.on('pointerdown', () => {
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.setText('✓ Copied!');
          this.time.delayedCall(1500, () => { copyBtn.setText('📋 Copy Code'); });
        }).catch(() => {
          // Fallback: just show the code is already visible
          copyBtn.setText('Code shown above');
          this.time.delayedCall(1500, () => { copyBtn.setText('📋 Copy Code'); });
        });
      });

      this.peerManager!.onConnect(() => {
        waitText.setText('Connected! Starting battle...');
        waitText.setColor('#2a6a2a');

        const gameSync = new GameSync(this.peerManager!);

        this.time.delayedCall(1000, () => {
          overlay.destroy();
          this.lobbyOverlay = null;
          this.scene.start('BattleScene', {
            multiplayer: true,
            isHost: true,
            peerManager: this.peerManager,
            gameSync,
          });
        });
      });
    }).catch((err) => {
      statusText.setText('Failed to create lobby');
      statusText.setColor('#8B2500');
      waitText.setText(String(err.message || err));
    });
  }

  private showJoinGame(): void {
    const { width, height } = this.scale;
    const pw = 380;
    const ph = 280;
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;

    const overlay = this.add.container(0, 0);

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4).setInteractive();
    overlay.add(dim);

    const panel = this.add.graphics();
    panel.fillStyle(0xddd0b8, 1);
    panel.fillRoundedRect(px, py, pw, ph, 8);
    panel.lineStyle(2, 0x8b7355, 0.8);
    panel.strokeRoundedRect(px, py, pw, ph, 8);
    overlay.add(panel);

    overlay.add(this.add.text(width / 2, py + 30, 'Join Game', {
      fontSize: '24px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    overlay.add(this.add.text(width / 2, py + 70, 'Enter Room Code:', {
      fontSize: '16px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5));

    // Create HTML input for room code
    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.maxLength = 5;
    inputEl.placeholder = 'XXXXX';
    inputEl.style.cssText = `
      font-size: 24px; font-family: Georgia, serif; font-weight: bold;
      text-align: center; letter-spacing: 6px; text-transform: uppercase;
      width: 180px; padding: 8px; border: 2px solid #8b7355;
      background: #f0e8d8; color: #4a3520; border-radius: 6px; outline: none;
    `;
    const inputDom = this.add.dom(width / 2, py + 110, inputEl);
    overlay.add(inputDom);

    const statusText = this.add.text(width / 2, py + 160, '', {
      fontSize: '14px',
      color: '#8b7355',
      fontFamily: 'Georgia, serif',
      fontStyle: 'italic',
    }).setOrigin(0.5);
    overlay.add(statusText);

    // Connect button
    this.addLobbyButton(overlay, width / 2, py + 195, 'Connect', () => {
      const code = inputEl.value.toUpperCase().trim();
      if (code.length < 4) {
        statusText.setText('Please enter a valid room code');
        statusText.setColor('#8B2500');
        return;
      }

      statusText.setText('Connecting...');
      statusText.setColor('#8b7355');

      this.peerManager = new PeerManager();
      this.peerManager.joinLobby(code).then(() => {
        statusText.setText('Connected! Starting battle...');
        statusText.setColor('#2a6a2a');

        const gameSync = new GameSync(this.peerManager!);

        this.time.delayedCall(1000, () => {
          overlay.destroy();
          this.lobbyOverlay = null;
          this.scene.start('BattleScene', {
            multiplayer: true,
            isHost: false,
            peerManager: this.peerManager,
            gameSync,
          });
        });
      }).catch((err) => {
        statusText.setText(`Connection failed: ${err.message || err}`);
        statusText.setColor('#8B2500');
        this.peerManager?.disconnect();
        this.peerManager = null;
      });
    });

    // Cancel button
    this.addLobbyButton(overlay, width / 2, py + 245, 'Cancel', () => {
      this.peerManager?.disconnect();
      this.peerManager = null;
      overlay.destroy();
    });

    this.lobbyOverlay = overlay;

    // Auto-focus input
    this.time.delayedCall(100, () => { inputEl.focus(); });
  }

  private toggleSettings(): void {
    if (this.settingsOverlay) {
      this.settingsOverlay.destroy();
      this.settingsOverlay = null;
      return;
    }
    const { width, height } = this.scale;
    const pw = 320;
    const ph = 280;
    const px = (width - pw) / 2;
    const py = (height - ph) / 2;

    const overlay = this.add.container(0, 0);

    // Dim background
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.4).setInteractive();
    dim.on('pointerdown', () => { this.toggleSettings(); });
    overlay.add(dim);

    // Panel
    const panel = this.add.graphics();
    panel.fillStyle(0xddd0b8, 1);
    panel.fillRoundedRect(px, py, pw, ph, 8);
    panel.lineStyle(2, 0x8b7355, 0.8);
    panel.strokeRoundedRect(px, py, pw, ph, 8);
    overlay.add(panel);

    // Title
    overlay.add(this.add.text(width / 2, py + 30, 'Settings', {
      fontSize: '26px',
      color: '#4a3520',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    // Difficulty
    overlay.add(this.add.text(px + 24, py + 70, 'Difficulty:', {
      fontSize: '18px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, serif',
    }));

    const difficulties: AIDifficulty[] = ['easy', 'normal', 'hard'];
    const diffLabels = ['Easy', 'Normal', 'Hard'];
    let diffButtons: Phaser.GameObjects.Text[] = [];

    diffButtons = difficulties.map((diff, i) => {
      const isActive = this.settings.difficulty === diff;
      const btn = this.add.text(
        px + 24 + i * 96, py + 100,
        diffLabels[i],
        {
          fontSize: '16px',
          color: isActive ? '#ffffff' : '#5a3a1a',
          backgroundColor: isActive ? '#8B2500' : '#c8b898',
          padding: { x: 14, y: 8 },
          fontFamily: 'Georgia, serif',
        },
      ).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this.settings.difficulty = diff;
        saveSettings(this.settings);
        // Refresh buttons
        for (let j = 0; j < diffButtons.length; j++) {
          const active = difficulties[j] === diff;
          diffButtons[j].setStyle({
            color: active ? '#ffffff' : '#5a3a1a',
            backgroundColor: active ? '#8B2500' : '#c8b898',
          });
        }
      });
      return btn;
    });
    overlay.add(diffButtons);

    // Sound toggle
    overlay.add(this.add.text(px + 24, py + 150, 'Sound:', {
      fontSize: '18px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, serif',
    }));
    const soundBtn = this.add.text(px + 120, py + 150, this.settings.soundEnabled ? 'ON' : 'OFF', {
      fontSize: '16px',
      color: '#5a3a1a',
      backgroundColor: '#c8b898',
      padding: { x: 14, y: 6 },
      fontFamily: 'Georgia, serif',
    }).setInteractive({ useHandCursor: true });
    soundBtn.on('pointerdown', () => {
      this.settings.soundEnabled = !this.settings.soundEnabled;
      soundBtn.setText(this.settings.soundEnabled ? 'ON' : 'OFF');
      saveSettings(this.settings);
    });
    overlay.add(soundBtn);

    // Fullscreen toggle
    overlay.add(this.add.text(px + 24, py + 195, 'Fullscreen:', {
      fontSize: '18px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, serif',
    }));
    const fsBtn = this.add.text(px + 150, py + 195, document.fullscreenElement ? 'ON' : 'OFF', {
      fontSize: '16px',
      color: '#5a3a1a',
      backgroundColor: '#c8b898',
      padding: { x: 14, y: 6 },
      fontFamily: 'Georgia, serif',
    }).setInteractive({ useHandCursor: true });
    fsBtn.on('pointerdown', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        fsBtn.setText('OFF');
      } else {
        document.documentElement.requestFullscreen().catch(() => {});
        fsBtn.setText('ON');
      }
    });
    overlay.add(fsBtn);

    // Close button
    const closeBtn = this.add.text(px + pw - 12, py + 8, '✕', {
      fontSize: '22px',
      color: '#8b7355',
      fontFamily: 'sans-serif',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { this.toggleSettings(); });
    overlay.add(closeBtn);

    this.settingsOverlay = overlay;
  }
}
