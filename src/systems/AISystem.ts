import type { Unit } from '../entities/Unit';
import type { UnitSystem } from './UnitSystem';
import type { MovementSystem } from './MovementSystem';
import type { CombatSystem } from './CombatSystem';
import type { MapSystem } from './MapSystem';

export type AIDifficulty = 'easy' | 'normal' | 'hard';

type AIAction = 'attack' | 'hold' | 'flank' | 'retreat' | 'support';

interface AIDecision {
  unit: Unit;
  action: AIAction;
  targetCol: number;
  targetRow: number;
  priority: number;
}

interface DifficultyParams {
  interval: number;
  suboptimalChance: number;
  enableFlanking: boolean;
  focusFire: boolean;
  staggerDelay: number;
}

const DIFFICULTY_PARAMS: Record<AIDifficulty, DifficultyParams> = {
  easy:   { interval: 4000, suboptimalChance: 0.35, enableFlanking: false, focusFire: false, staggerDelay: 800 },
  normal: { interval: 2500, suboptimalChance: 0.1,  enableFlanking: true,  focusFire: false, staggerDelay: 400 },
  hard:   { interval: 2000, suboptimalChance: 0,    enableFlanking: true,  focusFire: true,  staggerDelay: 200 },
};

// Deterministic seeded RNG for reproducibility
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export class AISystem {
  private unitSystem: UnitSystem;
  private movementSystem: MovementSystem;
  private combatSystem: CombatSystem;
  private map: MapSystem;
  private params: DifficultyParams;
  private timer = 0;
  private rng: () => number;
  private unitStaggerOffset = new Map<number, number>();
  private active = false;

  constructor(
    unitSystem: UnitSystem,
    movementSystem: MovementSystem,
    combatSystem: CombatSystem,
    map: MapSystem,
    difficulty: AIDifficulty = 'normal',
  ) {
    this.unitSystem = unitSystem;
    this.movementSystem = movementSystem;
    this.combatSystem = combatSystem;
    this.map = map;
    this.params = DIFFICULTY_PARAMS[difficulty];
    this.rng = seededRandom(12345);
  }

  start(): void {
    this.active = true;
    this.timer = 0;
  }

  stop(): void {
    this.active = false;
  }

  update(delta: number): void {
    if (!this.active) return;

    this.timer += delta;
    if (this.timer < this.params.interval) return;
    this.timer -= this.params.interval;

    this.executeDecisions();
  }

  private executeDecisions(): void {
    const enemies = this.unitSystem.getUnitsByFaction('enemy');
    const players = this.unitSystem.getUnitsByFaction('player');
    if (players.length === 0 || enemies.length === 0) return;

    const decisions: AIDecision[] = [];

    for (const unit of enemies) {
      if (unit.isMoving || unit.isRouting || !unit.isAlive()) continue;
      // Skip units already actively in combat (melee)
      if (unit.attackTargetId && !unit.isMoving) {
        const target = this.unitSystem.getUnits().find(u => u.id === unit.attackTargetId);
        if (target && target.isAlive()) {
          const dist = Math.abs(unit.col - target.col) + Math.abs(unit.row - target.row);
          if (dist <= unit.range) continue;
        }
      }

      const decision = this.makeDecision(unit, players, enemies);
      if (decision) decisions.push(decision);
    }

    // Sort by priority (higher first) and stagger execution
    decisions.sort((a, b) => b.priority - a.priority);

    let staggerMs = 0;
    for (const decision of decisions) {
      const offset = this.getStaggerOffset(decision.unit.id);
      const delay = staggerMs + offset;
      staggerMs += this.params.staggerDelay;

      if (delay <= 0) {
        this.executeDecision(decision);
      } else {
        // Capture decision in closure
        const d = decision;
        setTimeout(() => this.executeDecision(d), delay);
      }
    }
  }

  private getStaggerOffset(unitId: number): number {
    if (!this.unitStaggerOffset.has(unitId)) {
      this.unitStaggerOffset.set(unitId, Math.floor(this.rng() * 300));
    }
    return this.unitStaggerOffset.get(unitId)!;
  }

  private makeDecision(unit: Unit, players: Unit[], allies: Unit[]): AIDecision | null {
    const hpRatio = unit.hp / unit.maxHp;

    // Retreat if heavily damaged
    if (hpRatio < 0.3) {
      return this.planRetreat(unit, players, allies);
    }

    // Check if a nearby ally is in combat and needs support
    const supportTarget = this.findSupportTarget(unit, allies, players);

    // Choose action based on unit type and situation
    const bestTarget = this.selectTarget(unit, players);
    if (!bestTarget) {
      if (supportTarget) return supportTarget;
      return this.planHold(unit);
    }

    const distToTarget = Math.abs(unit.col - bestTarget.col) + Math.abs(unit.row - bestTarget.row);

    // Already in range — let auto-engage handle it
    if (distToTarget <= unit.range) return null;

    // Type-specific strategies
    switch (unit.unitType) {
      case 'cavalry':
        if (this.params.enableFlanking && this.rng() > 0.3) {
          const flank = this.planFlank(unit, bestTarget, players, allies);
          if (flank) return flank;
        }
        return this.planAttack(unit, bestTarget, 10);

      case 'archer':
        return this.planArcherBehavior(unit, bestTarget, players, allies);

      default: // infantry
        return this.planAttack(unit, bestTarget, 5);
    }
  }

  private selectTarget(unit: Unit, players: Unit[]): Unit | null {
    if (players.length === 0) return null;

    interface ScoredTarget { unit: Unit; score: number }
    const scored: ScoredTarget[] = [];

    for (const player of players) {
      if (!player.isAlive()) continue;
      const dist = Math.abs(unit.col - player.col) + Math.abs(unit.row - player.row);
      let score = 100;

      // Prefer closer targets
      score -= dist * 3;

      // Prefer damaged units (focus fire on hard)
      const hpRatio = player.hp / player.maxHp;
      if (this.params.focusFire) {
        score += (1 - hpRatio) * 40;
      } else {
        score += (1 - hpRatio) * 15;
      }

      // Type matchup bonuses
      if (unit.unitType === 'cavalry' && player.unitType === 'archer') score += 20;
      if (unit.unitType === 'infantry' && player.unitType === 'cavalry') score += 10;
      if (unit.unitType === 'archer') {
        // Archers prefer high-value targets in range
        if (dist <= unit.range) score += 25;
        if (player.unitType === 'cavalry') score += 10;
      }

      // Avoid type disadvantages
      if (unit.unitType === 'cavalry' && player.unitType === 'infantry') score -= 10;

      // Prefer targets on open ground
      const terrain = this.map.getTerrain(player.col, player.row);
      if (terrain?.key === 'hills' || terrain?.key === 'forest') score -= 8;

      scored.push({ unit: player, score });
    }

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);

    // Suboptimal chance: pick a random target instead
    if (this.params.suboptimalChance > 0 && this.rng() < this.params.suboptimalChance) {
      const idx = Math.floor(this.rng() * Math.min(scored.length, 3));
      return scored[idx].unit;
    }

    return scored[0].unit;
  }

  private planAttack(unit: Unit, target: Unit, priority: number): AIDecision {
    // Move toward the target — find a tile adjacent/in-range of target
    const dest = this.findApproachTile(unit, target);
    return {
      unit,
      action: 'attack',
      targetCol: dest?.col ?? target.col,
      targetRow: dest?.row ?? target.row,
      priority,
    };
  }

  private planFlank(unit: Unit, target: Unit, players: Unit[], allies: Unit[]): AIDecision | null {
    // Try to approach from the side or rear relative to enemy facing
    const facing = target.facingAngle;
    // Flank angles: +/- 90 degrees or rear
    const flankAngles = [facing + Math.PI, facing + Math.PI / 2, facing - Math.PI / 2];

    let bestTile: { col: number; row: number } | null = null;
    let bestDist = Infinity;

    for (const angle of flankAngles) {
      for (let r = 2; r <= 4; r++) {
        const fc = target.col + Math.round(Math.cos(angle) * r);
        const fr = target.row + Math.round(Math.sin(angle) * r);
        if (!this.map.isInBounds(fc, fr)) continue;
        const terrain = this.map.getTerrain(fc, fr);
        if (!terrain?.passable) continue;
        if (this.unitSystem.getUnitAt(fc, fr)) continue;

        // Avoid tiles too close to other player units
        const nearEnemy = players.some(p => {
          if (p === target) return false;
          return Math.abs(p.col - fc) + Math.abs(p.row - fr) <= 1;
        });
        if (nearEnemy) continue;

        // Avoid clustering with allies
        const nearAlly = allies.filter(a => a !== unit && Math.abs(a.col - fc) + Math.abs(a.row - fr) <= 1).length;
        if (nearAlly >= 2) continue;

        const d = Math.abs(unit.col - fc) + Math.abs(unit.row - fr);
        if (d < bestDist) {
          bestDist = d;
          bestTile = { col: fc, row: fr };
        }
      }
    }

    if (!bestTile) return null;

    return {
      unit,
      action: 'flank',
      targetCol: bestTile.col,
      targetRow: bestTile.row,
      priority: 12,
    };
  }

  private planArcherBehavior(unit: Unit, target: Unit, players: Unit[], allies: Unit[]): AIDecision | null {
    const distToTarget = Math.abs(unit.col - target.col) + Math.abs(unit.row - target.row);

    // If enemies are too close, retreat behind friendly infantry
    const nearbyEnemies = players.filter(p =>
      Math.abs(p.col - unit.col) + Math.abs(p.row - unit.row) <= 2
    );

    if (nearbyEnemies.length > 0) {
      // Find a tile behind friendly infantry
      const friendlyInfantry = allies.filter(a => a.unitType === 'infantry' && a.isAlive());
      if (friendlyInfantry.length > 0) {
        const retreat = this.findTileBehindFriendly(unit, friendlyInfantry, players);
        if (retreat) {
          return {
            unit,
            action: 'retreat',
            targetCol: retreat.col,
            targetRow: retreat.row,
            priority: 8,
          };
        }
      }
    }

    // Move to a position within range but not adjacent
    if (distToTarget > unit.range) {
      const rangedTile = this.findRangedPosition(unit, target, allies);
      if (rangedTile) {
        return {
          unit,
          action: 'attack',
          targetCol: rangedTile.col,
          targetRow: rangedTile.row,
          priority: 7,
        };
      }
    }

    return null;
  }

  private planRetreat(unit: Unit, players: Unit[], allies: Unit[]): AIDecision {
    // Retreat toward friendly units and away from enemies
    const friendlyInfantry = allies.filter(a => a !== unit && a.unitType === 'infantry' && a.isAlive());
    if (friendlyInfantry.length > 0) {
      const retreat = this.findTileBehindFriendly(unit, friendlyInfantry, players);
      if (retreat) {
        return { unit, action: 'retreat', targetCol: retreat.col, targetRow: retreat.row, priority: 15 };
      }
    }

    // Fall back toward own deployment zone (top of map)
    const retreatRow = Math.max(0, unit.row - 3);
    return { unit, action: 'retreat', targetCol: unit.col, targetRow: retreatRow, priority: 15 };
  }

  private planHold(unit: Unit): AIDecision | null {
    // Look for nearby advantageous terrain
    const terrain = this.map.getTerrain(unit.col, unit.row);
    if (terrain?.key === 'hills' || terrain?.key === 'forest') return null;

    // Check if there's better terrain nearby
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dc === 0 && dr === 0) continue;
        const nc = unit.col + dc;
        const nr = unit.row + dr;
        if (!this.map.isInBounds(nc, nr)) continue;
        const t = this.map.getTerrain(nc, nr);
        if (t?.key === 'hills' && t.passable && !this.unitSystem.getUnitAt(nc, nr)) {
          return { unit, action: 'hold', targetCol: nc, targetRow: nr, priority: 2 };
        }
      }
    }
    return null;
  }

  private findSupportTarget(unit: Unit, allies: Unit[], players: Unit[]): AIDecision | null {
    // Find friendly units in combat that are outnumbered
    for (const ally of allies) {
      if (ally === unit || !ally.isAlive() || !ally.attackTargetId) continue;
      const dist = Math.abs(unit.col - ally.col) + Math.abs(unit.row - ally.row);
      if (dist > 8 || dist <= 2) continue;

      const enemiesNearAlly = players.filter(p =>
        Math.abs(p.col - ally.col) + Math.abs(p.row - ally.row) <= 2
      ).length;
      const friendsNearAlly = allies.filter(a =>
        a !== unit && Math.abs(a.col - ally.col) + Math.abs(a.row - ally.row) <= 2
      ).length;

      if (enemiesNearAlly > friendsNearAlly) {
        const dest = this.findApproachTile(unit, ally);
        if (dest) {
          return { unit, action: 'support', targetCol: dest.col, targetRow: dest.row, priority: 6 };
        }
      }
    }
    return null;
  }

  // --- Pathfinding helpers ---

  private findApproachTile(unit: Unit, target: Unit): { col: number; row: number } | null {
    const reachable = this.movementSystem.getReachableTiles(
      unit.col, unit.row, unit.movement,
      unit.faction, this.unitSystem.getUnits(),
    );

    if (reachable.length === 0) return null;

    let bestTile: { col: number; row: number } | null = null;
    let bestDist = Infinity;

    for (const tile of reachable) {
      const d = Math.abs(tile.col - target.col) + Math.abs(tile.row - target.row);
      // For ranged units, prefer staying at range
      if (unit.range > 1 && d > 0 && d <= unit.range) {
        const moveD = Math.abs(tile.col - unit.col) + Math.abs(tile.row - unit.row);
        if (moveD < bestDist) {
          bestDist = moveD;
          bestTile = tile;
        }
      } else if (d < bestDist) {
        bestDist = d;
        bestTile = tile;
      }
    }

    return bestTile;
  }

  private findRangedPosition(unit: Unit, target: Unit, allies: Unit[]): { col: number; row: number } | null {
    const reachable = this.movementSystem.getReachableTiles(
      unit.col, unit.row, unit.movement,
      unit.faction, this.unitSystem.getUnits(),
    );

    let bestTile: { col: number; row: number } | null = null;
    let bestScore = -Infinity;

    for (const tile of reachable) {
      const distToTarget = Math.abs(tile.col - target.col) + Math.abs(tile.row - target.row);
      if (distToTarget > unit.range || distToTarget === 0) continue;

      let score = 0;
      // Prefer being at max range
      score += distToTarget * 5;
      // Prefer tiles behind friendly infantry
      const hasInfantryScreen = allies.some(a =>
        a.unitType === 'infantry' && a.isAlive() &&
        Math.abs(a.col - target.col) + Math.abs(a.row - target.row) <
        Math.abs(tile.col - target.col) + Math.abs(tile.row - target.row)
      );
      if (hasInfantryScreen) score += 15;
      // Prefer hills
      const terrain = this.map.getTerrain(tile.col, tile.row);
      if (terrain?.key === 'hills') score += 10;
      // Check LoS
      if (!this.combatSystem.hasLineOfSight(tile.col, tile.row, target.col, target.row)) {
        score -= 100;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    }

    return bestTile;
  }

  private findTileBehindFriendly(
    unit: Unit,
    friendlyInfantry: Unit[],
    enemies: Unit[],
  ): { col: number; row: number } | null {
    const reachable = this.movementSystem.getReachableTiles(
      unit.col, unit.row, unit.movement,
      unit.faction, this.unitSystem.getUnits(),
    );

    // Average enemy position
    let avgEnemyCol = 0, avgEnemyRow = 0;
    for (const e of enemies) { avgEnemyCol += e.col; avgEnemyRow += e.row; }
    avgEnemyCol /= enemies.length;
    avgEnemyRow /= enemies.length;

    let bestTile: { col: number; row: number } | null = null;
    let bestScore = -Infinity;

    for (const tile of reachable) {
      let score = 0;
      const distToEnemies = Math.abs(tile.col - avgEnemyCol) + Math.abs(tile.row - avgEnemyRow);
      score += distToEnemies * 3;

      // Bonus for being near friendly infantry
      const nearInfantry = friendlyInfantry.some(f =>
        Math.abs(f.col - tile.col) + Math.abs(f.row - tile.row) <= 2
      );
      if (nearInfantry) score += 10;

      // Infantry should be between this tile and enemies
      const hasCover = friendlyInfantry.some(f => {
        const fDist = Math.abs(f.col - avgEnemyCol) + Math.abs(f.row - avgEnemyRow);
        return fDist < distToEnemies;
      });
      if (hasCover) score += 15;

      if (score > bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    }

    return bestTile;
  }

  private executeDecision(decision: AIDecision): void {
    const { unit, targetCol, targetRow } = decision;
    if (!unit.isAlive() || unit.isMoving || unit.isRouting) return;

    // If already at target, nothing to do
    if (unit.col === targetCol && unit.row === targetRow) return;

    // Check if target tile is still available
    const occupant = this.unitSystem.getUnitAt(targetCol, targetRow);
    if (occupant && occupant.faction === 'player') {
      // Enemy unit at destination — try to attack by moving adjacent
      if (decision.action === 'attack') {
        const dist = Math.abs(unit.col - occupant.col) + Math.abs(unit.row - occupant.row);
        if (dist <= unit.range) {
          this.combatSystem.attack(unit, occupant);
          return;
        }
      }
      // Find an adjacent open tile instead
      const adj = this.findAdjacentOpen(targetCol, targetRow);
      if (adj) {
        this.moveAIUnit(unit, adj.col, adj.row);
      }
      return;
    }

    if (occupant) return; // Friendly unit there, skip

    this.moveAIUnit(unit, targetCol, targetRow);
  }

  private moveAIUnit(unit: Unit, destCol: number, destRow: number): void {
    const path = this.movementSystem.findPath(
      unit.col, unit.row,
      destCol, destRow,
      unit.faction,
      this.unitSystem.getUnits(),
    );

    if (path.length < 2) return;

    // Limit path to unit's movement range
    let cost = 0;
    let lastIdx = 0;
    for (let i = 1; i < path.length; i++) {
      const terrain = this.map.getTerrain(path[i].col, path[i].row);
      cost += terrain?.movementCost ?? 1;
      if (cost > unit.movement) break;
      lastIdx = i;
    }

    if (lastIdx === 0) return;
    const limitedPath = path.slice(0, lastIdx + 1);

    // Clear any existing attack target before moving
    unit.attackTargetId = null;
    this.movementSystem.moveUnit(unit, limitedPath, this.unitSystem);
  }

  private findAdjacentOpen(col: number, row: number): { col: number; row: number } | null {
    const dirs = [
      { dc: 0, dr: -1 }, { dc: 1, dr: 0 },
      { dc: 0, dr: 1 }, { dc: -1, dr: 0 },
    ];
    for (const d of dirs) {
      const nc = col + d.dc;
      const nr = row + d.dr;
      if (!this.map.isInBounds(nc, nr)) continue;
      const terrain = this.map.getTerrain(nc, nr);
      if (!terrain?.passable) continue;
      if (this.unitSystem.getUnitAt(nc, nr)) continue;
      return { col: nc, row: nr };
    }
    return null;
  }
}
