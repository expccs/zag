import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type {
  FacadeCommand,
  FacadeGateway,
  FacadeTouch,
} from '../../app/ports/facade-gateway';
import type { Logger } from '../../app/ports/logger';

export interface TouchDesignerEvents {
  open: [];
  close: [code: number, reason: string];
  message: [message: unknown];
}

export interface TouchDesignerClientOptions {
  url: string;
  logger: Logger;
  pingIntervalMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  commandBufferSize?: number;
}

const DEFAULT_PING_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 10_000;
const DEFAULT_COMMAND_BUFFER_SIZE = 32;

/**
 * `FacadeGateway` adapter: JSON over a WebSocket to TouchDesigner
 * (docs/backend/reference/touch-designer-client.ts). Reconnects with
 * backoff, watches pongs, keeps the last `commandBufferSize` commands
 * while offline and drops the touch stream instead of buffering it.
 */
// Typed base so that the class header fits one line.
class Emitter extends EventEmitter<TouchDesignerEvents> {}

export class TouchDesignerClient extends Emitter implements FacadeGateway {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelayMs: number;
  private awaitingPong = false;
  private closed = false;
  private dropped = 0;
  private readonly pendingCommands: string[] = [];

  private readonly url: string;
  private readonly pingIntervalMs: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly commandBufferSize: number;
  private readonly logger: Logger;

  constructor(options: TouchDesignerClientOptions) {
    super();
    this.url = options.url;
    this.logger = options.logger;
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.commandBufferSize =
      options.commandBufferSize ?? DEFAULT_COMMAND_BUFFER_SIZE;
    this.reconnectDelayMs = this.reconnectBaseMs;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  connect(): void {
    if (this.closed || this.ws) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectDelayMs = this.reconnectBaseMs;
      this.logger.info('connected', { url: this.url });
      this.startPing();
      this.flushCommands();
      this.emit('open');
    });
    ws.on('message', (raw) => {
      this.handleMessage(raw.toString());
    });
    ws.on('pong', () => {
      this.awaitingPong = false;
    });
    ws.on('error', (error) => {
      this.logger.warn('socket error', { error: error.message });
    });
    ws.on('close', (code, reason) => {
      this.stopPing();
      this.ws = null;
      this.emit('close', code, reason.toString());
      this.scheduleReconnect();
    });
  }

  stream(touch: FacadeTouch): boolean {
    if (!this.isConnected) {
      this.dropped++;
      return false;
    }
    return this.sendRaw(JSON.stringify(touch));
  }

  command(command: FacadeCommand): void {
    const payload = JSON.stringify({
      ...command,
      timestamp: new Date().toISOString(),
    });
    if (this.isConnected && this.sendRaw(payload)) return;
    if (this.pendingCommands.length >= this.commandBufferSize) {
      this.pendingCommands.shift();
    }
    this.pendingCommands.push(payload);
  }

  close(): void {
    this.closed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners();
      ws.close();
    }
  }

  private sendRaw(payload: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(payload);
      return true;
    } catch (error) {
      this.logger.warn('send failed', { error });
      return false;
    }
  }

  private flushCommands(): void {
    while (this.pendingCommands.length > 0 && this.isConnected) {
      const payload = this.pendingCommands.shift() as string;
      this.sendRaw(payload);
    }
  }

  private handleMessage(raw: string): void {
    let message: unknown = raw;
    try {
      message = JSON.parse(raw);
    } catch {
      this.logger.warn('non-JSON message received');
    }
    this.emit('message', message);
  }

  private startPing(): void {
    this.stopPing();
    this.awaitingPong = false;
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.awaitingPong) {
        this.logger.warn('pong timeout, terminating socket');
        this.ws.terminate();
        return;
      }
      this.awaitingPong = true;
      this.ws.ping();
    }, this.pingIntervalMs);
  }

  private stopPing(): void {
    if (!this.pingTimer) return;
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const delayMs = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(delayMs * 2, this.reconnectMaxMs);
    this.logger.info('reconnect scheduled', { delayMs });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }
}
