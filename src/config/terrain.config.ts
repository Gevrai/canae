export interface TerrainDef {
  name: string;
  key: string;
  color: number;
  movementCost: number;
  defenseBonus: number;
  blocksLoS: boolean;
  passable: boolean;
}

export const TERRAIN_TYPES: Record<string, TerrainDef> = {
  grass:  { name: 'Plains',  key: 'grass',  color: 0xd4c5a0, movementCost: 1,   defenseBonus: 0,    blocksLoS: false, passable: true },
  hills:  { name: 'Hills',   key: 'hills',  color: 0xb8a07a, movementCost: 1.5, defenseBonus: 0.2,  blocksLoS: false, passable: true },
  forest: { name: 'Forest',  key: 'forest', color: 0x8b9a6b, movementCost: 1.8, defenseBonus: 0.3,  blocksLoS: true,  passable: true },
  water:  { name: 'Water',   key: 'water',  color: 0x7ba3b8, movementCost: 99,  defenseBonus: 0,    blocksLoS: false, passable: false },
  mud:    { name: 'Mud',     key: 'mud',    color: 0x8b7355, movementCost: 2,   defenseBonus: 0,    blocksLoS: false, passable: true },
  road:   { name: 'Road',    key: 'road',   color: 0xe0d5b5, movementCost: 0.7, defenseBonus: 0,    blocksLoS: false, passable: true },
};
