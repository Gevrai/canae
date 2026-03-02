export interface UnitDef {
  name: string;
  key: string;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  movement: number;
  range: number;
  morale: number;
  sightRange: number;
  description: string;
}

export const UNIT_TYPES: Record<string, UnitDef> = {
  infantry: {
    name: 'Infantry', key: 'infantry',
    maxHp: 100, attack: 15, defense: 12,
    speed: 1.0, movement: 3, range: 1,
    morale: 100, sightRange: 4,
    description: 'Stalwart foot soldiers. Strong at holding positions and defense.',
  },
  cavalry: {
    name: 'Cavalry', key: 'cavalry',
    maxHp: 80, attack: 20, defense: 8,
    speed: 2.0, movement: 5, range: 1,
    morale: 100, sightRange: 5,
    description: 'Fast mounted warriors. Excel at flanking and charges. Weak in forests.',
  },
  archer: {
    name: 'Archer', key: 'archer',
    maxHp: 60, attack: 18, defense: 5,
    speed: 1.2, movement: 3, range: 4,
    morale: 100, sightRange: 6,
    description: 'Ranged fighters. Deadly from afar but vulnerable in melee.',
  },
};

export type Faction = 'player' | 'enemy';

export const FACTION_COLORS: Record<Faction, number> = {
  player: 0x8B2500,
  enemy: 0x4A2A6B,
};
