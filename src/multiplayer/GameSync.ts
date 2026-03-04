import { PeerManager } from './PeerManager';
import type { Unit } from '../entities/Unit';

// --- Message types ---

export type MessageType =
  | 'GAME_START'
  | 'UNIT_MOVE'
  | 'UNIT_ATTACK'
  | 'STATE_SYNC'
  | 'GAME_OVER'
  | 'PING'
  | 'PONG';

export interface UnitSnapshot {
  id: number;
  unitType: string;
  faction: 'player' | 'enemy';
  x: number;
  y: number;
  hp: number;
  morale: number;
  stamina: number;
  isRouting: boolean;
  attackTargetId: number | null;
  facingAngle: number;
  isMoving: boolean;
  targetX: number | null;
  targetY: number | null;
  isBraced: boolean;
  isCharging: boolean;
}

export interface GameMessage {
  type: MessageType;
  payload?: unknown;
  timestamp: number;
}

export interface MovePayload {
  unitId: number;
  targetX: number;
  targetY: number;
}

export interface AttackPayload {
  unitId: number;
  targetUnitId: number;
}

export interface StateSyncPayload {
  units: UnitSnapshot[];
  battleTime: number;
}

export interface GameStartPayload {
  seed: number;
}

export interface GameOverPayload {
  result: 'victory' | 'defeat';
}

// --- Callbacks ---

export interface GameSyncCallbacks {
  onGameStart?: (payload: GameStartPayload) => void;
  onMoveCommand?: (payload: MovePayload) => void;
  onAttackCommand?: (payload: AttackPayload) => void;
  onStateSync?: (payload: StateSyncPayload) => void;
  onGameOver?: (payload: GameOverPayload) => void;
}

// --- GameSync ---

const STATE_SYNC_INTERVAL = 500;
const PING_INTERVAL = 3000;

export class GameSync {
  private peerManager: PeerManager;
  private callbacks: GameSyncCallbacks = {};
  private isHost = false;
  private syncTimer = 0;
  private pingTimer = 0;
  private lastPingTime = 0;
  private _latency = 0;
  private getUnitsSnapshot: (() => UnitSnapshot[]) | null = null;
  private getBattleTime: (() => number) | null = null;

  constructor(peerManager: PeerManager) {
    this.peerManager = peerManager;
    this.peerManager.onMessage((data) => this.handleMessage(data as GameMessage));
  }

  setCallbacks(callbacks: GameSyncCallbacks): void {
    this.callbacks = callbacks;
  }

  startAsHost(
    getUnits: () => UnitSnapshot[],
    getBattleTime: () => number,
  ): void {
    this.isHost = true;
    this.getUnitsSnapshot = getUnits;
    this.getBattleTime = getBattleTime;

    // Notify guest that game is starting
    this.sendMessage('GAME_START', { seed: 42 } satisfies GameStartPayload);
  }

  startAsClient(): void {
    this.isHost = false;
  }

  update(delta: number): void {
    if (!this.peerManager.isConnected) return;

    // Periodic ping
    this.pingTimer += delta;
    if (this.pingTimer >= PING_INTERVAL) {
      this.pingTimer -= PING_INTERVAL;
      this.lastPingTime = Date.now();
      this.sendMessage('PING');
    }

    // Host sends periodic state sync
    if (this.isHost && this.getUnitsSnapshot && this.getBattleTime) {
      this.syncTimer += delta;
      if (this.syncTimer >= STATE_SYNC_INTERVAL) {
        this.syncTimer -= STATE_SYNC_INTERVAL;
        const payload: StateSyncPayload = {
          units: this.getUnitsSnapshot(),
          battleTime: this.getBattleTime(),
        };
        this.sendMessage('STATE_SYNC', payload);
      }
    }
  }

  sendMoveCommand(unitId: number, targetX: number, targetY: number): void {
    const payload: MovePayload = { unitId, targetX, targetY };
    this.sendMessage('UNIT_MOVE', payload);
  }

  sendAttackCommand(unitId: number, targetId: number): void {
    const payload: AttackPayload = { unitId, targetUnitId: targetId };
    this.sendMessage('UNIT_ATTACK', payload);
  }

  sendGameOver(result: 'victory' | 'defeat'): void {
    this.sendMessage('GAME_OVER', { result } satisfies GameOverPayload);
  }

  getLatency(): number {
    return this._latency;
  }

  private sendMessage(type: MessageType, payload?: unknown): void {
    const msg: GameMessage = { type, timestamp: Date.now(), payload };
    this.peerManager.send(msg);
  }

  private handleMessage(msg: GameMessage): void {
    switch (msg.type) {
      case 'PING':
        this.sendMessage('PONG');
        break;
      case 'PONG':
        this._latency = Date.now() - this.lastPingTime;
        break;
      case 'GAME_START':
        this.callbacks.onGameStart?.(msg.payload as GameStartPayload);
        break;
      case 'UNIT_MOVE':
        this.callbacks.onMoveCommand?.(msg.payload as MovePayload);
        break;
      case 'UNIT_ATTACK':
        this.callbacks.onAttackCommand?.(msg.payload as AttackPayload);
        break;
      case 'STATE_SYNC':
        this.callbacks.onStateSync?.(msg.payload as StateSyncPayload);
        break;
      case 'GAME_OVER':
        this.callbacks.onGameOver?.(msg.payload as GameOverPayload);
        break;
    }
  }

  static snapshotUnit(u: Unit): UnitSnapshot {
    return {
      id: u.id,
      unitType: u.unitType,
      faction: u.faction,
      x: u.x,
      y: u.y,
      hp: u.hp,
      morale: u.morale,
      stamina: u.stamina,
      isRouting: u.isRouting,
      attackTargetId: u.attackTargetId,
      facingAngle: u.facingAngle,
      isMoving: u.isMoving,
      targetX: u.targetX,
      targetY: u.targetY,
      isBraced: u.isBraced,
      isCharging: u.isCharging,
    };
  }
}
