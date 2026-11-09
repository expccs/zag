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
  /** Pause between connection attempts; retried forever. */
  reconnectMs?: number;
}

/** One point of the stream as TD reads it (docs/touchdesigner-setup.md § 2). */
export interface StreamMessage {
  request: 'stream';
  payload: {
    type: 'stroke:begin' | 'stroke:move' | 'stroke:end';
    point: { x: number; y: number };
  };
}

/** TouchDesigner WebSocket server on the facade LAN (`TD_WS_URL` overrides). */
export const TD_DEFAULT_URL = 'ws://10.11.68.104:82';

const DEFAULT_PING_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_MS = 5_000;

// Typed base so that the class header fits one line.
class Emitter extends EventEmitter<TouchDesignerEvents> {}

/**
 * `FacadeGateway` adapter for the point stream: a WebSocket client of the
 * TouchDesigner server (`TD_WS_URL`), JSON `{ request: 'stream', payload }`
 * per touch (docs/touchdesigner-setup.md § 2). Commands are not sent here:
 * TD gets them from CCS (`CloudControls`). Keeps trying to connect for as
 * long as the process lives (every `reconnectMs`, 5 s), so a facade that
 * comes online later is picked up without a restart; an outage is logged
 * once, not on every attempt. Watches pongs and drops points while offline
 * (`droppedCount`) rather than replaying stale strokes.
 */
export class TouchDesignerClient extends Emitter implements FacadeGateway {
  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private awaitingPong = false;
  private closed = false;
  private dropped = 0;
  private outageLogged = false;

  private readonly url: string;
  private readonly pingIntervalMs: number;
  private readonly reconnectMs: number;
  private readonly logger: Logger;

  constructor(options: TouchDesignerClientOptions) {
    super();
    this.url = options.url;
    this.logger = options.logger;
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.reconnectMs = options.reconnectMs ?? DEFAULT_RECONNECT_MS;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  /** The TD message for a touch of the protocol. */
  static toStream(touch: FacadeTouch): StreamMessage {
    return {
      request: 'stream',
      payload: {
        type: `stroke:${touch.phase}`,
        point: { x: touch.x, y: touch.y },
      },
    };
  }

  connect(): void {
    if (this.closed || this.ws) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.outageLogged = false;
      this.logger.info('connected', { url: this.url });
      this.startPing();
      this.emit('open');
    });
    ws.on('message', (raw) => {
      this.handleMessage(raw.toString());
    });
    ws.on('pong', () => {
      this.awaitingPong = false;
    });
    ws.on('error', (error) => {
      this.reportOutage(error.message);
    });
    ws.on('close', (code, reason) => {
      this.stopPing();
      this.ws = null;
      this.emit('close', code, reason.toString());
      this.scheduleReconnect();
    });
  }

  /** Commands reach TD through CCS; nothing to send on this socket. */
  command(_command: FacadeCommand): void {
    this.logger.log('command handled by ccs', { url: this.url });
  }

  stream(touch: FacadeTouch): boolean {
    if (!this.isConnected) {
      this.dropped++;
      return false;
    }
    return this.sendRaw(JSON.stringify(TouchDesignerClient.toStream(touch)));
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

  // One warning per outage; the retries themselves stay quiet.
  private reportOutage(error: string): void {
    if (this.outageLogged) return;
    this.outageLogged = true;
    this.logger.warn('touchdesigner unreachable, retrying', {
      url: this.url,
      error,
      retryMs: this.reconnectMs,
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectMs);
  }
}
