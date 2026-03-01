import Phaser from 'phaser';
import { CAMERA_SPEED } from '../config/game.config';

export class CameraSystem {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartX = 0;
  private camStartY = 0;

  // Pinch zoom state
  private pinchStartDist = 0;
  private pinchStartZoom = 1;

  private readonly minZoom = 0.4;
  private readonly maxZoom = 2.0;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
    }

    const cam = scene.cameras.main;
    cam.setBounds(0, 0, mapWidth, mapHeight);
    cam.centerOn(mapWidth / 2, mapHeight / 2);
    cam.setZoom(1);

    // Mouse/touch drag
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (scene.input.pointer1.isDown && scene.input.pointer2.isDown) return;
      this.isDragging = true;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.camStartX = cam.scrollX;
      this.camStartY = cam.scrollY;
    });

    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Pinch zoom (two fingers)
      if (scene.input.pointer1.isDown && scene.input.pointer2.isDown) {
        this.isDragging = false;
        const p1 = scene.input.pointer1;
        const p2 = scene.input.pointer2;
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.pinchStartDist === 0) {
          this.pinchStartDist = dist;
          this.pinchStartZoom = cam.zoom;
        } else {
          const scale = dist / this.pinchStartDist;
          cam.setZoom(Phaser.Math.Clamp(this.pinchStartZoom * scale, this.minZoom, this.maxZoom));
        }
        return;
      }

      this.pinchStartDist = 0;

      if (!this.isDragging || !pointer.isDown) return;
      const dx = (this.dragStartX - pointer.x) / cam.zoom;
      const dy = (this.dragStartY - pointer.y) / cam.zoom;
      cam.scrollX = this.camStartX + dx;
      cam.scrollY = this.camStartY + dy;
    });

    scene.input.on('pointerup', () => {
      this.isDragging = false;
      this.pinchStartDist = 0;
    });

    // Mouse wheel zoom
    scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const zoomDelta = deltaY > 0 ? -0.1 : 0.1;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + zoomDelta, this.minZoom, this.maxZoom));
    });
  }

  update(): void {
    if (!this.cursors) return;
    const cam = this.scene.cameras.main;
    const speed = CAMERA_SPEED / cam.zoom;
    if (this.cursors.left.isDown) cam.scrollX -= speed;
    if (this.cursors.right.isDown) cam.scrollX += speed;
    if (this.cursors.up.isDown) cam.scrollY -= speed;
    if (this.cursors.down.isDown) cam.scrollY += speed;
  }
}
