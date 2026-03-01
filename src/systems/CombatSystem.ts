import { Unit } from '../entities/Unit';
import { MapSystem } from './MapSystem';

export interface CombatResult {
  attackerDamage: number;
  defenderDamage: number;
}

export class CombatSystem {
  private map: MapSystem;

  constructor(map: MapSystem) {
    this.map = map;
  }

  resolve(attacker: Unit, defender: Unit): CombatResult {
    const terrain = this.map.getTerrain(defender.col, defender.row);
    const defenseBonus = terrain?.defenseBonus ?? 0;

    const attackerDamage = Math.max(1, attacker.attack - defender.defense - defenseBonus);
    const defenderDamage = Math.max(1, defender.attack - attacker.defense);

    defender.hp -= attackerDamage;
    attacker.hp -= Math.floor(defenderDamage * 0.5);

    return { attackerDamage, defenderDamage: Math.floor(defenderDamage * 0.5) };
  }
}
