import { PeerManager } from './PeerManager';

export interface GameState {
  turn: number;
  units: unknown[];
}

export class GameSync {
  private peerManager: PeerManager;
  private state: GameState = { turn: 0, units: [] };

  constructor(peerManager: PeerManager) {
    this.peerManager = peerManager;
  }

  sendState(state: GameState): void {
    this.peerManager.send({ type: 'state', payload: state });
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = state;
  }
}
