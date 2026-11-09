import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  AUTH_ERROR,
  EVENTS,
  isValidUserId,
  type ClientToServerEvents,
  type PublicState,
  type ServerToClientEvents,
  type SocketData,
} from '@zag/protocol';
import type { ClientGateway } from '../../app/ports/client-gateway';
import type { Logger } from '../../app/ports/logger';

export type ZagServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

export type ZagSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

type NextHandler = (error?: Error) => void;

export interface SocketServerOptions {
  allowedOrigins: string[];
  trustProxy: boolean;
  logger: Logger;
  /** Current app state, pushed on connect and served by `state:get`. */
  state: () => PublicState;
}

/** `ClientGateway` adapter: Socket.IO over the shared http server. */
export class ZagSocketServer implements ClientGateway {
  readonly io: ZagServer;

  private readonly logger: Logger;
  private readonly trustProxy: boolean;
  private readonly state: () => PublicState;

  constructor(httpServer: HttpServer, options: SocketServerOptions) {
    this.logger = options.logger;
    this.trustProxy = options.trustProxy;
    this.state = options.state;
    this.io = new Server(httpServer, {
      transports: ['websocket'],
      cors: { origin: options.allowedOrigins },
    });
    this.io.use((socket, next) => this.authenticate(socket, next));
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  get clientsCount(): number {
    return this.io.engine.clientsCount;
  }

  broadcastState(state: PublicState): void {
    this.io.emit(EVENTS.stateUpdate, state);
  }

  close(): void {
    this.io.close();
  }

  static resolveClientIp(
    request: IncomingMessage,
    trustProxy: boolean,
  ): string {
    if (trustProxy) {
      const header = request.headers['x-forwarded-for'];
      const forwarded = ZagSocketServer.firstHeader(header);
      const first = forwarded.split(',')[0]?.trim();
      if (first) return first;
    }
    return request.socket.remoteAddress ?? 'unknown';
  }

  private static firstHeader(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }

  private authenticate(socket: ZagSocket, next: NextHandler): void {
    const { userId } = socket.handshake.auth;
    if (!isValidUserId(userId)) {
      this.logger.warn('socket rejected', {
        socketId: socket.id,
        ip: ZagSocketServer.resolveClientIp(socket.request, this.trustProxy),
        reason: AUTH_ERROR,
      });
      next(new Error(AUTH_ERROR));
      return;
    }
    socket.data.userId = userId;
    next();
  }

  private handleConnection(socket: ZagSocket): void {
    const connectedAt = Date.now();
    const info = this.describeConnection(socket);
    this.logger.info('socket connected', {
      ...info,
      clients: this.clientsCount,
    });
    socket.emit(EVENTS.stateUpdate, this.state());
    socket.on(EVENTS.stateGet, (ack) => ack(this.state()));

    socket.on('disconnect', (reason) => {
      this.logger.info('socket disconnected', {
        socketId: info.socketId,
        userId: info.userId,
        reason,
        durationMs: Date.now() - connectedAt,
      });
    });
  }

  private describeConnection(socket: ZagSocket) {
    const { request } = socket;
    return {
      socketId: socket.id,
      userId: socket.data.userId,
      transport: socket.conn.transport.name,
      ip: ZagSocketServer.resolveClientIp(request, this.trustProxy),
      userAgent: ZagSocketServer.firstHeader(request.headers['user-agent']),
      origin: ZagSocketServer.firstHeader(request.headers.origin),
      recovered: socket.recovered,
    };
  }
}
