import type { TerrainDef } from '../config/terrain.config';

export class Terrain {
  public readonly col: number;
  public readonly row: number;
  public readonly def: TerrainDef;

  constructor(def: TerrainDef, col: number, row: number) {
    this.def = def;
    this.col = col;
    this.row = row;
  }

  get movementCost(): number { return this.def.movementCost; }
  get defenseModifier(): number { return this.def.defenseBonus; }
  get blocksLoS(): boolean { return this.def.blocksLoS; }
  get passable(): boolean { return this.def.passable; }
}
