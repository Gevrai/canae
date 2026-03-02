import Phaser from 'phaser';
import { MapSystem } from '../systems/MapSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { UnitSystem } from '../systems/UnitSystem';
import { SelectionSystem } from '../systems/SelectionSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { AISystem } from '../systems/AISystem';

type BattlePhase = 'deployment' | 'battle' | 'ended';

export class BattleScene extends Phaser.Scene {
  private cameraSystem!: CameraSystem;
  private unitSystem!: UnitSystem;
  private combatSystem!: CombatSystem;
  private aiSystem!: AISystem;
  private phase: BattlePhase = 'deployment';
  private phaseTimer = 0;
  private victoryCheckTimer = 0;

  constructor() {
    super({ key: 'BattleScene' });
  }

  create(): void {
    this.phase = 'deployment';
    this.phaseTimer = 0;
    this.victoryCheckTimer = 0;

    const mapSystem = new MapSystem(this);
    this.unitSystem = new UnitSystem(this, mapSystem);
    const movementSystem = new MovementSystem(this, mapSystem);
    this.combatSystem = new CombatSystem(this, mapSystem, this.unitSystem);
    new SelectionSystem(this, mapSystem, this.unitSystem, movementSystem, this.combatSystem);

    this.aiSystem = new AISystem(
      this.unitSystem, movementSystem, this.combatSystem, mapSystem, 'normal',
    );

    this.unitSystem.setupInitialArmies();

    this.cameraSystem = new CameraSystem(this, mapSystem.mapWidthPx, mapSystem.mapHeightPx);

    this.showDeploymentBanner();
  }

  update(_time: number, delta: number): void {
    this.cameraSystem.update();
    this.unitSystem.update(delta);

    if (this.phase === 'deployment') {
      this.phaseTimer += delta;
      if (this.phaseTimer >= 2000) {
        this.phase = 'battle';
        this.aiSystem.start();
      }
      return;
    }

    if (this.phase === 'battle') {
      this.combatSystem.update(delta);
      this.aiSystem.update(delta);

      this.victoryCheckTimer += delta;
      if (this.victoryCheckTimer >= 1000) {
        this.victoryCheckTimer -= 1000;
        const result = this.combatSystem.checkVictoryConditions();
        if (result) {
          this.phase = 'ended';
          this.aiSystem.stop();
          this.time.delayedCall(1500, () => {
            this.scene.start('GameOverScene', { result });
          });
        }
      }
    }
  }

  private showDeploymentBanner(): void {
    const { width, height } = this.scale;

    const banner = this.add.text(width / 2, height / 2, 'Battle Begins!', {
      fontSize: '48px',
      color: '#ffd700',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          y: banner.y - 30,
          delay: 1200,
          duration: 400,
          ease: 'Power2',
          onComplete: () => banner.destroy(),
        });
      },
    });
  }
}
