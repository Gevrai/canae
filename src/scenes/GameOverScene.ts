import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  private result: 'victory' | 'defeat' = 'defeat';

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { result?: 'victory' | 'defeat' }): void {
    this.result = data?.result ?? 'defeat';
  }

  create(): void {
    const { width, height } = this.scale;

    const title = this.result === 'victory' ? 'VICTORY' : 'DEFEAT';
    const color = this.result === 'victory' ? '#ffd700' : '#cc3333';

    this.add.text(width / 2, height / 3, title, {
      fontSize: '64px',
      color,
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const subtitle = this.result === 'victory'
      ? 'The enemy has been vanquished!'
      : 'Your forces have been routed.';

    this.add.text(width / 2, height / 2, subtitle, {
      fontSize: '24px',
      color: '#cccccc',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    const menuBtn = this.add.text(width / 2, height / 2 + 80, '▶  Main Menu', {
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: '#2d6a4f',
      padding: { x: 28, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setStyle({ backgroundColor: '#40916c' }));
    menuBtn.on('pointerout', () => menuBtn.setStyle({ backgroundColor: '#2d6a4f' }));
    menuBtn.on('pointerdown', () => this.scene.start('MenuScene'));
  }
}
