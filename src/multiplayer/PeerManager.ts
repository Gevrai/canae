import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';

const PEER_PREFIX = 'canae-';
// Unambiguous characters (no O/0, I/1, L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const CONNECT_TIMEOUT = 10000;

export type PeerRole = 'host' | 'guest';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export class PeerManager {
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private role: PeerRole = 'host';
  private roomCode = '';
  private messageHandlers: ((data: unknown) => void)[] = [];
  private connectHandlers: (() => void)[] = [];
  private disconnectHandlers: (() => void)[] = [];
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;

  get isConnected(): boolean { return this._connected; }
  get currentRole(): PeerRole { return this.role; }
  get code(): string { return this.roomCode; }

  createLobby(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.role = 'host';
      this.roomCode = generateRoomCode();
      const peerId = PEER_PREFIX + this.roomCode;

      this.peer = new Peer(peerId);

      const timeout = setTimeout(() => {
        reject(new Error('Lobby creation timed out'));
      }, CONNECT_TIMEOUT);

      this.peer.on('open', () => {
        clearTimeout(timeout);
        this.peer!.on('connection', (conn) => this.setupConnection(conn));
        resolve(this.roomCode);
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  joinLobby(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.role = 'guest';
      this.roomCode = code.toUpperCase().trim();
      const remotePeerId = PEER_PREFIX + this.roomCode;

      this.peer = new Peer();

      const timeout = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, CONNECT_TIMEOUT);

      this.peer.on('open', () => {
        const conn = this.peer!.connect(remotePeerId, { reliable: true });

        conn.on('open', () => {
          clearTimeout(timeout);
          this.setupConnection(conn);
          resolve();
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      this.peer.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private setupConnection(conn: DataConnection): void {
    this.connection = conn;
    this._connected = true;

    for (const handler of this.connectHandlers) handler();

    conn.on('data', (data) => {
      this.resetDisconnectTimer();
      for (const handler of this.messageHandlers) handler(data);
    });

    conn.on('close', () => {
      this._connected = false;
      for (const handler of this.disconnectHandlers) handler();
    });

    conn.on('error', () => {
      this._connected = false;
      for (const handler of this.disconnectHandlers) handler();
    });

    this.resetDisconnectTimer();
  }

  private resetDisconnectTimer(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = setTimeout(() => {
      if (this._connected) {
        this._connected = false;
        for (const handler of this.disconnectHandlers) handler();
      }
    }, 15000);
  }

  send(data: unknown): void {
    if (this.connection?.open) {
      this.connection.send(data);
    }
  }

  onMessage(callback: (data: unknown) => void): void {
    this.messageHandlers.push(callback);
  }

  onConnect(callback: () => void): void {
    this.connectHandlers.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectHandlers.push(callback);
  }

  disconnect(): void {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this._connected = false;
    this.connection?.close();
    this.connection = null;
    this.peer?.destroy();
    this.peer = null;
    this.messageHandlers = [];
    this.connectHandlers = [];
    this.disconnectHandlers = [];
  }
}
