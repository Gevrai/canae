import Phaser from 'phaser';
import { PARCHMENT_BG } from '../config/game.config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Future asset loading goes here
  }

  create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor(PARCHMENT_BG);

    const title = this.add.text(width / 2, height / 2 - 20, 'CANAE', {
      fontSize: '56px',
      color: '#5a3a1a',
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(width / 2, height / 2 + 30, 'Loading...', {
      fontSize: '18px',
      color: '#8b7355',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [title, sub],
      alpha: 1,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        this.tweens.add({
          targets: [title, sub],
          alpha: 0,
          delay: 800,
          duration: 400,
          ease: 'Power2',
          onComplete: () => this.scene.start('MenuScene'),
        });
      },
    });
  }
}
