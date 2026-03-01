import Peer, { DataConnection } from 'peerjs';

export class PeerManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;

  createPeer(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = id ? new Peer(id) : new Peer();
      this.peer.on('open', (peerId) => resolve(peerId));
      this.peer.on('error', (err) => reject(err));
    });
  }

  connect(remotePeerId: string): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('Peer not initialized'));
      this.connection = this.peer.connect(remotePeerId);
      this.connection.on('open', () => resolve(this.connection!));
      this.connection.on('error', (err) => reject(err));
    });
  }

  onConnection(callback: (conn: DataConnection) => void): void {
    this.peer?.on('connection', callback);
  }

  send(data: unknown): void {
    this.connection?.send(data);
  }

  destroy(): void {
    this.peer?.destroy();
  }
}
