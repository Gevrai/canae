export interface UnitDef {
  name: string;
  maxHp: number;
  attack: number;
  defense: number;
  movement: number;
  range: number;
  color: number;
}

export const UNIT_TYPES: Record<string, UnitDef> = {
  infantry: { name: 'Infantry', maxHp: 100, attack: 10, defense: 8, movement: 3, range: 1, color: 0x3a86ff },
  cavalry: { name: 'Cavalry', maxHp: 80, attack: 14, defense: 5, movement: 5, range: 1, color: 0xff006e },
  archer: { name: 'Archer', maxHp: 60, attack: 12, defense: 4, movement: 3, range: 3, color: 0x8338ec },
  general: { name: 'General', maxHp: 120, attack: 8, defense: 10, movement: 4, range: 1, color: 0xffbe0b },
};
