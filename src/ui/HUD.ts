import Phaser from 'phaser';

export class HUD {
  private scene: Phaser.Scene;
  private turnText: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    this.turnText = this.scene.add.text(10, 10, 'Turn: 1', {
      fontSize: '18px',
      color: '#ffffff',
    }).setScrollFactor(0);
  }

  setTurn(turn: number): void {
    this.turnText?.setText(`Turn: ${turn}`);
  }
}
