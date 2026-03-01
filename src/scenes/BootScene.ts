import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Future asset loading goes here
  }

  create(): void {
    this.scene.start('MenuScene');
  }
}
