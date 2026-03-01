import Phaser from 'phaser';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2, 'Battle Scene', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
  }
}
