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
  targetX: number;
  targetY: number;
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

// Range constants (pixels)
const MELEE_RANGE = 40;
const ARCHER_RANGE = 256;
const CLOSE_PROXIMITY = 128;
const FLANK_DISTANCE = 128;
const RETREAT_DISTANCE = 200;
const RANGED_PREFERRED_DIST = 200;

// Stamina thresholds
const CHARGE_MIN_STAMINA = 20;
const LOW_STAMINA_RATIO = 0.3;

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
  private initialEnemyCount = 0;
  private lastCombatTime = new Map<number, number>();
  private elapsedTime = 0;
  private desperate = false;
  private criticallyDesperate = false;

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
    this.elapsedTime = 0;
    this.initialEnemyCount = 0;
    this.lastCombatTime.clear();
    this.desperate = false;
    this.criticallyDesperate = false;
  }

  stop(): void {
    this.active = false;
  }

  update(delta: number): void {
    if (!this.active) return;

    this.elapsedTime += delta;
    this.timer += delta;
    if (this.timer < this.params.interval) return;
    this.timer -= this.params.interval;

    this.executeDecisions();
  }

  // --- Distance helper ---

  private unitDist(a: Unit, b: Unit): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private pointDist(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --- Stamina helpers ---

  private staminaRatio(unit: Unit): number {
    return unit.stamina / unit.maxStamina;
  }

  private isLowStamina(unit: Unit): boolean {
    return this.staminaRatio(unit) < LOW_STAMINA_RATIO;
  }

  // --- Core loop ---

  private executeDecisions(): void {
    const enemies = this.unitSystem.getUnitsByFaction('enemy');
    const players = this.unitSystem.getUnitsByFaction('player');
    if (players.length === 0 || enemies.length === 0) return;

    // Track initial army size for desperation calculation
    if (this.initialEnemyCount === 0) {
      this.initialEnemyCount = enemies.length;
    }
    this.desperate = enemies.length / this.initialEnemyCount < 0.5;
    this.criticallyDesperate = enemies.length <= 3;

    // Update last combat time for units currently engaged
    for (const unit of enemies) {
      if (unit.attackTargetId) {
        this.lastCombatTime.set(unit.id, this.elapsedTime);
      }
    }

    const decisions: AIDecision[] = [];

    for (const unit of enemies) {
      if (unit.isMoving || unit.isRouting || !unit.isAlive()) continue;
      // Skip units already actively in combat
      if (unit.attackTargetId && !unit.isMoving) {
        const target = this.unitSystem.getUnits().find(u => u.id === unit.attackTargetId);
        if (target && target.isAlive()) {
          const dist = this.unitDist(unit, target);
          if (dist <= MELEE_RANGE) continue;
          if (unit.unitType === 'archer' && dist <= ARCHER_RANGE) continue;
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

    // Prefer resting when stamina is very low (unless critically desperate)
    if (this.isLowStamina(unit) && !this.criticallyDesperate && !this.desperate) {
      return this.planHold(unit);
    }

    // Retreat if heavily damaged (fight to the death when critically desperate)
    if (hpRatio < 0.3 && !this.criticallyDesperate) {
      return this.planRetreat(unit, players, allies);
    }

    // Idle units advance after 15s without combat
    const lastCombat = this.lastCombatTime.get(unit.id) ?? 0;
    if (this.elapsedTime - lastCombat >= 15000) {
      const nearest = this.findNearestEnemy(unit, players);
      if (nearest) {
        this.lastCombatTime.set(unit.id, this.elapsedTime);
        return this.planAttack(unit, nearest, 8);
      }
    }

    // Check if a nearby ally is in combat and needs support
    const supportTarget = this.findSupportTarget(unit, allies, players);

    // Choose action based on unit type and situation
    const bestTarget = this.selectTarget(unit, players);
    if (!bestTarget) {
      if (supportTarget) return supportTarget;
      if (this.desperate) {
        const nearest = this.findNearestEnemy(unit, players);
        if (nearest) return this.planAttack(unit, nearest, 5);
      }
      return this.planHold(unit);
    }

    const distToTarget = this.unitDist(unit, bestTarget);

    // Already in range — let auto-engage handle it
    if (unit.unitType === 'archer' && distToTarget <= ARCHER_RANGE) return null;
    if (unit.unitType !== 'archer' && distToTarget <= MELEE_RANGE) return null;

    // Type-specific strategies
    switch (unit.unitType) {
      case 'cavalry':
        // Don't charge if stamina too low
        if (unit.stamina < CHARGE_MIN_STAMINA) {
          return this.planHold(unit);
        }
        if (this.params.enableFlanking && this.rng() > 0.3) {
          const flank = this.planFlank(unit, bestTarget, players, allies);
          if (flank) return flank;
        }
        return this.planAttack(unit, bestTarget, 10);

      case 'archer': {
        if (this.criticallyDesperate) {
          return this.planAttack(unit, bestTarget, 8);
        }
        const archerDecision = this.planArcherBehavior(unit, bestTarget, players, allies);
        if (!archerDecision && this.desperate) {
          return this.planAttack(unit, bestTarget, 6);
        }
        return archerDecision;
      }

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
      const dist = this.unitDist(unit, player);
      let score = 100;

      // Prefer closer targets (scaled for pixel distances)
      score -= (dist / 64) * 3;

      // Prefer damaged units (focus fire on hard)
      const hpRatio = player.hp / player.maxHp;
      if (this.params.focusFire) {
        score += (1 - hpRatio) * 40;
      } else {
        score += (1 - hpRatio) * 15;
      }

      // Prefer tired enemies
      if (this.isLowStamina(player)) score += 10;

      // Type matchup bonuses
      if (unit.unitType === 'cavalry' && player.unitType === 'archer') score += 20;
      if (unit.unitType === 'infantry' && player.unitType === 'cavalry') score += 10;
      if (unit.unitType === 'archer') {
        if (dist <= ARCHER_RANGE) score += 25;
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

  // --- Action planners ---

  private planAttack(unit: Unit, target: Unit, priority: number): AIDecision {
    const pos = this.findApproachPosition(unit, target);
    return {
      unit,
      action: 'attack',
      targetX: pos.x,
      targetY: pos.y,
      priority,
    };
  }

  private planFlank(unit: Unit, target: Unit, players: Unit[], allies: Unit[]): AIDecision | null {
    const facing = target.facingAngle;
    const flankAngles = [facing + Math.PI, facing + Math.PI / 2, facing - Math.PI / 2];

    let bestPos: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const angle of flankAngles) {
      for (let rMul = 1; rMul <= 3; rMul++) {
        const dist = FLANK_DISTANCE * rMul;
        const fx = target.x + Math.cos(angle) * dist;
        const fy = target.y + Math.sin(angle) * dist;

        // Check terrain passability at target position
        const terrain = this.map.getTerrainAtWorld(fx, fy);
        if (!terrain?.passable) continue;

        // Avoid positions too close to other player units
        const nearEnemy = players.some(p => {
          if (p === target) return false;
          return this.pointDist(p.x, p.y, fx, fy) < 64;
        });
        if (nearEnemy) continue;

        // Avoid clustering with allies
        const nearAlly = allies.filter(a =>
          a !== unit && this.pointDist(a.x, a.y, fx, fy) < 64
        ).length;
        if (nearAlly >= 2) continue;

        const d = this.pointDist(unit.x, unit.y, fx, fy);
        if (d < bestDist) {
          bestDist = d;
          bestPos = { x: fx, y: fy };
        }
      }
    }

    if (!bestPos) return null;

    return {
      unit,
      action: 'flank',
      targetX: bestPos.x,
      targetY: bestPos.y,
      priority: 12,
    };
  }

  private planArcherBehavior(unit: Unit, target: Unit, players: Unit[], allies: Unit[]): AIDecision | null {
    const distToTarget = this.unitDist(unit, target);

    // If enemies are too close, retreat behind friendly infantry
    const nearbyEnemies = players.filter(p =>
      this.unitDist(unit, p) <= CLOSE_PROXIMITY
    );

    if (nearbyEnemies.length > 0) {
      const friendlyInfantry = allies.filter(a => a.unitType === 'infantry' && a.isAlive());
      if (friendlyInfantry.length > 0) {
        const retreat = this.findPositionBehindFriendly(unit, friendlyInfantry, players);
        if (retreat) {
          return {
            unit,
            action: 'retreat',
            targetX: retreat.x,
            targetY: retreat.y,
            priority: 8,
          };
        }
      }
    }

    // Move to a position within range but keeping distance
    if (distToTarget > ARCHER_RANGE) {
      const rangedPos = this.findRangedPosition(unit, target, allies);
      if (rangedPos) {
        return {
          unit,
          action: 'attack',
          targetX: rangedPos.x,
          targetY: rangedPos.y,
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
      const retreat = this.findPositionBehindFriendly(unit, friendlyInfantry, players);
      if (retreat) {
        return { unit, action: 'retreat', targetX: retreat.x, targetY: retreat.y, priority: 15 };
      }
    }

    // Compute average enemy direction and move away
    let avgEx = 0, avgEy = 0;
    for (const p of players) { avgEx += p.x; avgEy += p.y; }
    avgEx /= players.length;
    avgEy /= players.length;

    const dx = unit.x - avgEx;
    const dy = unit.y - avgEy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const retreatX = unit.x + (dx / len) * RETREAT_DISTANCE;
    const retreatY = unit.y + (dy / len) * RETREAT_DISTANCE;

    // Clamp within map bounds
    const cx = Math.max(0, Math.min(this.map.mapWidthPx, retreatX));
    const cy = Math.max(0, Math.min(this.map.mapHeightPx, retreatY));

    return { unit, action: 'retreat', targetX: cx, targetY: cy, priority: 15 };
  }

  private planHold(unit: Unit): AIDecision | null {
    // Look for nearby advantageous terrain
    const terrain = this.map.getTerrain(unit.col, unit.row);
    if (terrain?.key === 'hills' || terrain?.key === 'forest') return null;

    // Search for better terrain within ~128px (2 tiles)
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dc === 0 && dr === 0) continue;
        const nc = unit.col + dc;
        const nr = unit.row + dr;
        if (!this.map.isInBounds(nc, nr)) continue;
        const t = this.map.getTerrain(nc, nr);
        if (t?.key === 'hills' && t.passable) {
          const worldPos = this.map.gridToWorld(nc, nr);
          return { unit, action: 'hold', targetX: worldPos.x, targetY: worldPos.y, priority: 2 };
        }
      }
    }
    return null;
  }

  private findSupportTarget(unit: Unit, allies: Unit[], players: Unit[]): AIDecision | null {
    for (const ally of allies) {
      if (ally === unit || !ally.isAlive() || !ally.attackTargetId) continue;
      const dist = this.unitDist(unit, ally);
      if (dist > 512 || dist <= CLOSE_PROXIMITY) continue;

      const enemiesNearAlly = players.filter(p =>
        this.unitDist(p, ally) <= CLOSE_PROXIMITY
      ).length;
      const friendsNearAlly = allies.filter(a =>
        a !== unit && this.unitDist(a, ally) <= CLOSE_PROXIMITY
      ).length;

      if (enemiesNearAlly > friendsNearAlly) {
        const pos = this.findApproachPosition(unit, ally);
        return { unit, action: 'support', targetX: pos.x, targetY: pos.y, priority: 6 };
      }
    }
    return null;
  }

  // --- Position helpers ---

  private findNearestEnemy(unit: Unit, players: Unit[]): Unit | null {
    let nearest: Unit | null = null;
    let bestDist = Infinity;
    for (const p of players) {
      if (!p.isAlive()) continue;
      const d = this.unitDist(unit, p);
      if (d < bestDist) {
        bestDist = d;
        nearest = p;
      }
    }
    return nearest;
  }

  private findApproachPosition(unit: Unit, target: Unit): { x: number; y: number } {
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / len;
    const dirY = dy / len;

    if (unit.unitType === 'archer') {
      // Move to 80% of max range from target
      const desiredDist = ARCHER_RANGE * 0.8;
      return {
        x: target.x - dirX * desiredDist,
        y: target.y - dirY * desiredDist,
      };
    }

    // Melee / cavalry: move to a point adjacent to target at ~MELEE_RANGE
    return {
      x: target.x - dirX * MELEE_RANGE,
      y: target.y - dirY * MELEE_RANGE,
    };
  }

  private findRangedPosition(unit: Unit, target: Unit, allies: Unit[]): { x: number; y: number } | null {
    // Compute direction from target toward unit (to keep distance)
    const dx = unit.x - target.x;
    const dy = unit.y - target.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const dirX = dx / len;
    const dirY = dy / len;

    // Ideal position: RANGED_PREFERRED_DIST from target along the current direction
    let bestPos: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    // Try several candidate positions at various angles around the direction
    for (let angleOff = -Math.PI / 2; angleOff <= Math.PI / 2; angleOff += Math.PI / 8) {
      const cos = Math.cos(angleOff);
      const sin = Math.sin(angleOff);
      const rotX = dirX * cos - dirY * sin;
      const rotY = dirX * sin + dirY * cos;

      const cx = target.x + rotX * RANGED_PREFERRED_DIST;
      const cy = target.y + rotY * RANGED_PREFERRED_DIST;

      const terrain = this.map.getTerrainAtWorld(cx, cy);
      if (!terrain?.passable) continue;

      const distToTarget = this.pointDist(cx, cy, target.x, target.y);
      if (distToTarget > ARCHER_RANGE || distToTarget < MELEE_RANGE) continue;

      let score = 0;
      // Prefer being at max range
      score += (distToTarget / 64) * 5;
      // Prefer tiles behind friendly infantry
      const hasInfantryScreen = allies.some(a =>
        a.unitType === 'infantry' && a.isAlive() &&
        this.unitDist(a, target) < distToTarget
      );
      if (hasInfantryScreen) score += 15;
      // Prefer hills
      if (terrain.key === 'hills') score += 10;
      // Check LoS via grid coords
      const gridFrom = this.map.worldToGrid(cx, cy);
      if (!this.combatSystem.hasLineOfSight(gridFrom.col, gridFrom.row, target.col, target.row)) {
        score -= 100;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPos = { x: cx, y: cy };
      }
    }

    return bestPos;
  }

  private findPositionBehindFriendly(
    unit: Unit,
    friendlyInfantry: Unit[],
    enemies: Unit[],
  ): { x: number; y: number } | null {
    // Average enemy position
    let avgEx = 0, avgEy = 0;
    for (const e of enemies) { avgEx += e.x; avgEy += e.y; }
    avgEx /= enemies.length;
    avgEy /= enemies.length;

    // Direction away from enemies
    const awayDx = unit.x - avgEx;
    const awayDy = unit.y - avgEy;
    const awayLen = Math.sqrt(awayDx * awayDx + awayDy * awayDy) || 1;
    const awayX = awayDx / awayLen;
    const awayY = awayDy / awayLen;

    // Average infantry position — try to retreat near them
    let avgIx = 0, avgIy = 0;
    for (const f of friendlyInfantry) { avgIx += f.x; avgIy += f.y; }
    avgIx /= friendlyInfantry.length;
    avgIy /= friendlyInfantry.length;

    // Position behind infantry, away from enemies
    let bestPos: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    // Try several candidate positions
    for (let angleOff = -Math.PI / 2; angleOff <= Math.PI / 2; angleOff += Math.PI / 6) {
      const cos = Math.cos(angleOff);
      const sin = Math.sin(angleOff);
      const rotX = awayX * cos - awayY * sin;
      const rotY = awayX * sin + awayY * cos;

      const cx = avgIx + rotX * CLOSE_PROXIMITY;
      const cy = avgIy + rotY * CLOSE_PROXIMITY;

      const terrain = this.map.getTerrainAtWorld(cx, cy);
      if (!terrain?.passable) continue;

      let score = 0;
      const distToEnemies = this.pointDist(cx, cy, avgEx, avgEy);
      score += (distToEnemies / 64) * 3;

      // Bonus for being near friendly infantry
      const nearInfantry = friendlyInfantry.some(f =>
        this.pointDist(f.x, f.y, cx, cy) <= CLOSE_PROXIMITY
      );
      if (nearInfantry) score += 10;

      // Infantry should be between this position and enemies
      const hasCover = friendlyInfantry.some(f => {
        const fDist = this.pointDist(f.x, f.y, avgEx, avgEy);
        return fDist < distToEnemies;
      });
      if (hasCover) score += 15;

      if (score > bestScore) {
        bestScore = score;
        bestPos = { x: cx, y: cy };
      }
    }

    return bestPos;
  }

  // --- Decision execution ---

  private executeDecision(decision: AIDecision): void {
    const { unit, targetX, targetY } = decision;
    if (!unit.isAlive() || unit.isMoving || unit.isRouting) return;

    // If already near the target, nothing to do
    if (this.pointDist(unit.x, unit.y, targetX, targetY) < MELEE_RANGE * 0.5) return;

    unit.attackTargetId = null;
    this.movementSystem.setTarget(unit, targetX, targetY);
  }
}
