import Phaser from 'phaser';
import { CAMERA_SPEED } from '../config/game.config';

export class CameraSystem {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
    }
  }

  update(): void {
    if (!this.cursors) return;
    const cam = this.scene.cameras.main;
    if (this.cursors.left.isDown) cam.scrollX -= CAMERA_SPEED;
    if (this.cursors.right.isDown) cam.scrollX += CAMERA_SPEED;
    if (this.cursors.up.isDown) cam.scrollY -= CAMERA_SPEED;
    if (this.cursors.down.isDown) cam.scrollY += CAMERA_SPEED;
  }
}
