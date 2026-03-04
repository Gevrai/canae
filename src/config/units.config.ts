export interface UnitDef {
  name: string;
  key: string;
  maxHp: number;
  attack: number;
  defense: number;
  /** Pixels per second base movement speed */
  speed: number;
  /** Maximum stamina pool */
  maxStamina: number;
  /** Stamina drained per second while moving */
  staminaDrainMove: number;
  /** Stamina drained per melee swing or ranged shot */
  staminaDrainFight: number;
  /** Stamina recovered per second when idle */
  staminaRecovery: number;
  /** Attack/engagement range in pixels */
  range: number;
  morale: number;
  /** Sight range in pixels */
  sightRange: number;
  /** Collision radius in pixels */
  collisionRadius: number;
  description: string;
}

export const UNIT_TYPES: Record<string, UnitDef> = {
  infantry: {
    name: 'Infantry', key: 'infantry',
    maxHp: 100, attack: 15, defense: 12,
    speed: 80, maxStamina: 100,
    staminaDrainMove: 2.0, staminaDrainFight: 5, staminaRecovery: 4.0,
    range: 40, morale: 100, sightRange: 256, collisionRadius: 14,
    description: 'Stalwart foot soldiers. Strong at holding positions and defense.',
  },
  cavalry: {
    name: 'Cavalry', key: 'cavalry',
    maxHp: 80, attack: 20, defense: 8,
    speed: 160, maxStamina: 80,
    staminaDrainMove: 3.0, staminaDrainFight: 5, staminaRecovery: 4.0,
    range: 40, morale: 100, sightRange: 320, collisionRadius: 18,
    description: 'Fast mounted warriors. Excel at flanking and charges. Weak in forests.',
  },
  archer: {
    name: 'Archer', key: 'archer',
    maxHp: 60, attack: 18, defense: 5,
    speed: 96, maxStamina: 70,
    staminaDrainMove: 2.5, staminaDrainFight: 3, staminaRecovery: 4.0,
    range: 256, morale: 100, sightRange: 384, collisionRadius: 12,
    description: 'Ranged fighters. Deadly from afar but vulnerable in melee.',
  },
};

export type Faction = 'player' | 'enemy';

export const FACTION_COLORS: Record<Faction, number> = {
  player: 0x8B2500,
  enemy: 0x4A2A6B,
};
