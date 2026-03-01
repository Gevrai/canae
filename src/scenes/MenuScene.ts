import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 3, 'CANAE', {
      fontSize: '64px',
      color: '#e0c097',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const playBtn = this.add.text(width / 2, height / 2 + 40, '▶  Play', {
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#2d6a4f',
      padding: { x: 32, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    playBtn.on('pointerover', () => playBtn.setStyle({ backgroundColor: '#40916c' }));
    playBtn.on('pointerout', () => playBtn.setStyle({ backgroundColor: '#2d6a4f' }));
    playBtn.on('pointerdown', () => this.scene.start('BattleScene'));
  }
}
