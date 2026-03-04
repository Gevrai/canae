export interface TerrainDef {
  name: string;
  key: string;
  color: number;
  movementCost: number;
  defenseBonus: number;
  blocksLoS: boolean;
  passable: boolean;
  /** Multiplier applied to unit base speed on this terrain */
  speedMultiplier: number;
  /** Multiplier applied to stamina drain while moving on this terrain */
  staminaDrainMultiplier: number;
}

export const TERRAIN_TYPES: Record<string, TerrainDef> = {
  grass:  { name: 'Plains',  key: 'grass',  color: 0xd4c5a0, movementCost: 1,   defenseBonus: 0,    blocksLoS: false, passable: true,  speedMultiplier: 1.0,  staminaDrainMultiplier: 1.0 },
  hills:  { name: 'Hills',   key: 'hills',  color: 0xb8a07a, movementCost: 1.5, defenseBonus: 0.2,  blocksLoS: false, passable: true,  speedMultiplier: 0.65, staminaDrainMultiplier: 1.8 },
  forest: { name: 'Forest',  key: 'forest', color: 0x8b9a6b, movementCost: 1.8, defenseBonus: 0.3,  blocksLoS: true,  passable: true,  speedMultiplier: 0.55, staminaDrainMultiplier: 1.6 },
  water:  { name: 'Water',   key: 'water',  color: 0x7ba3b8, movementCost: 99,  defenseBonus: 0,    blocksLoS: false, passable: false, speedMultiplier: 0,    staminaDrainMultiplier: 1.0 },
  mud:    { name: 'Mud',     key: 'mud',    color: 0x8b7355, movementCost: 2,   defenseBonus: 0,    blocksLoS: false, passable: true,  speedMultiplier: 0.50, staminaDrainMultiplier: 2.0 },
  road:   { name: 'Road',    key: 'road',   color: 0xe0d5b5, movementCost: 0.7, defenseBonus: 0,    blocksLoS: false, passable: true,  speedMultiplier: 1.3,  staminaDrainMultiplier: 0.7 },
};
