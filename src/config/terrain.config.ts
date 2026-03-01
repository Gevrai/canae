export interface TerrainDef {
  name: string;
  color: number;
  movementCost: number;
  defenseBonus: number;
}

export const TERRAIN_TYPES: Record<string, TerrainDef> = {
  plains: { name: 'Plains', color: 0x90be6d, movementCost: 1, defenseBonus: 0 },
  forest: { name: 'Forest', color: 0x2d6a4f, movementCost: 2, defenseBonus: 2 },
  hills: { name: 'Hills', color: 0xa68a64, movementCost: 2, defenseBonus: 3 },
  river: { name: 'River', color: 0x457b9d, movementCost: 3, defenseBonus: -1 },
  road: { name: 'Road', color: 0xc9b99a, movementCost: 0.5, defenseBonus: 0 },
  marsh: { name: 'Marsh', color: 0x6b705c, movementCost: 3, defenseBonus: -1 },
};
