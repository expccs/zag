import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { Logger } from './cloud-client';

export interface TouchDesignerMessage {
  type: string;
  [field: string]: unknown;
}

export interface TouchDesignerEvents {
  open: [];
  close: [code: number, reason: string];
  message: [message: unknown];
}

export interface TouchDesignerClientOptions {
  url: string;
  pingIntervalMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  commandBufferSize?: number;
  logger?: Logger;
}

const DEFAULT_PING_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 10_000;
const DEFAULT_COMMAND_BUFFER_SIZE = 32;

export class TouchDesignerClient extends EventEmitter<TouchDesignerEvents> {
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
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.reconnectBaseMs = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    this.reconnectMaxMs = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    this.commandBufferSize =
      options.commandBufferSize ?? DEFAULT_COMMAND_BUFFER_SIZE;
    this.logger = options.logger ?? console;
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
      this.logger.warn(`[td] socket error: ${error.message}`);
    });
    ws.on('close', (code, reason) => {
      this.stopPing();
      this.ws = null;
      this.emit('close', code, reason.toString());
      this.scheduleReconnect();
    });
  }

  stream(message: TouchDesignerMessage): boolean {
    if (!this.isConnected) {
      this.dropped++;
      return false;
    }
    return this.sendRaw(JSON.stringify(message));
  }

  command(message: TouchDesignerMessage): void {
    const payload = JSON.stringify({
      ...message,
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
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[td] send failed: ${message}`);
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
      this.logger.warn('[td] non-JSON message received');
    }
    this.emit('message', message);
  }

  private startPing(): void {
    this.stopPing();
    this.awaitingPong = false;
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.awaitingPong) {
        this.logger.warn('[td] pong timeout, terminating socket');
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
    this.logger.log(`[td] reconnect in ${delayMs}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }
}
