import Phaser from 'phaser';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2, 'Game Over', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
  }
}
