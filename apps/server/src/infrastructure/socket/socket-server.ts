import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  AUTH_ERROR,
  EVENTS,
  isValidUserId,
  type ClientToServerEvents,
  type GeoCheckResult,
  type GeoSample,
  type PublicState,
  type QueuePlace,
  type ServerToClientEvents,
  type SessionEnd,
  type SessionInfo,
  type SessionRequest,
  type SessionRequestResult,
  type SocketData,
  type TouchEvent,
} from '@zag/protocol';
import type { ClientGateway } from '../../app/ports/client-gateway';
import type { GeoApi } from '../../app/ports/geo-api';
import type { Logger } from '../../app/ports/logger';
import { SessionError, type SessionApi } from '../../app/ports/session-api';
import { QueueError } from '../../app/domain/session-queue';

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

type ServerEvent = keyof ServerToClientEvents;

type ServerPayload<E extends ServerEvent> = Parameters<
  ServerToClientEvents[E]
>[0];

export interface SocketServerOptions {
  allowedOrigins: string[];
  trustProxy: boolean;
  logger: Logger;
  /** Current app state, pushed on connect and served by `state:get`. */
  state: () => PublicState;
  /** Resolved lazily: the session service itself notifies through us. */
  sessions: () => SessionApi;
  /** Same: the geo service pushes `geo:update` through us. */
  geo: () => GeoApi;
}

/**
 * `ClientGateway` adapter: Socket.IO over the shared http server. Keeps
 * the sockets of each `userId` so per-user events reach every tab, and
 * tells the session and geo APIs when a user's last socket goes away or
 * comes back (the grace period and the sample timer live in the app
 * layer).
 */
export class ZagSocketServer implements ClientGateway {
  readonly io: ZagServer;

  private readonly logger: Logger;
  private readonly trustProxy: boolean;
  private readonly state: () => PublicState;
  private readonly sessions: () => SessionApi;
  private readonly geo: () => GeoApi;
  private readonly socketsByUser = new Map<string, Set<ZagSocket>>();

  constructor(httpServer: HttpServer, options: SocketServerOptions) {
    this.logger = options.logger;
    this.trustProxy = options.trustProxy;
    this.state = options.state;
    this.sessions = options.sessions;
    this.geo = options.geo;
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

  notifyQueue(userId: string, place: QueuePlace): void {
    this.emitToUser(userId, EVENTS.queueUpdate, place);
  }

  notifySessionStart(userId: string, info: SessionInfo): void {
    this.emitToUser(userId, EVENTS.sessionStart, info);
  }

  notifySessionEnd(userId: string, end: SessionEnd): void {
    this.emitToUser(userId, EVENTS.sessionEnd, end);
  }

  notifyGeo(userId: string, result: GeoCheckResult): void {
    this.emitToUser(userId, EVENTS.geoUpdate, result);
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

  /** Shape check of a client payload; `x`/`y` are unit coordinates. */
  static isTouchEvent(value: unknown): value is TouchEvent {
    if (typeof value !== 'object' || value === null) return false;
    const event = value as Record<string, unknown>;
    return (
      ZagSocketServer.isUnit(event.x) &&
      ZagSocketServer.isUnit(event.y) &&
      ZagSocketServer.isBit(event.touch)
    );
  }

  /** Numbers only; the fence itself judges their range. */
  static toGeoSample(value: unknown): GeoSample {
    const body = (value ?? {}) as Record<string, unknown>;
    const accuracy = Number(body.accuracy);
    return {
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    };
  }

  private static isUnit(value: unknown): value is number {
    return typeof value === 'number' && value >= 0 && value <= 1;
  }

  private static isBit(value: unknown): value is 0 | 1 {
    return value === 0 || value === 1;
  }

  private static firstHeader(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
  }

  // Anything the client sends is untrusted: only `mode` and a flat
  // `params` object pass, the app validates the mode itself.
  private static toSessionRequest(value: unknown): SessionRequest {
    const body = (value ?? {}) as Record<string, unknown>;
    const params = body.params;
    const flat =
      typeof params === 'object' && params !== null && !Array.isArray(params)
        ? (params as Record<string, string | number>)
        : {};
    return { mode: body.mode as SessionRequest['mode'], params: flat };
  }

  private emitToUser<E extends ServerEvent>(
    userId: string,
    event: E,
    payload: ServerPayload<E>,
  ): void {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return;
    for (const socket of sockets) {
      (socket.emit as (event: E, payload: ServerPayload<E>) => void)(
        event,
        payload,
      );
    }
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
    const { userId } = socket.data;
    this.logger.info('socket connected', {
      ...info,
      clients: this.clientsCount,
    });
    const first = this.track(userId, socket);
    if (first) this.geo().userConnected(userId);
    this.sessions().userConnected(userId);
    socket.emit(EVENTS.stateUpdate, this.state());
    socket.on(EVENTS.stateGet, (ack) => ack(this.state()));
    socket.on(EVENTS.geoCheck, (sample, ack) => {
      ack(this.geo().check(userId, ZagSocketServer.toGeoSample(sample)));
    });
    socket.on(EVENTS.sessionRequest, (request, ack) => {
      ack(this.requestSession(userId, request));
    });
    socket.on(EVENTS.sessionCancel, (ack) => {
      ack({ success: true, removed: this.sessions().cancel(userId) });
    });
    socket.on(EVENTS.touchEvent, (event) => {
      if (!ZagSocketServer.isTouchEvent(event)) return;
      this.sessions().handleTouch(userId, event);
    });

    socket.on('disconnect', (reason) => {
      this.logger.info('socket disconnected', {
        socketId: info.socketId,
        userId,
        reason,
        durationMs: Date.now() - connectedAt,
      });
      const last = this.untrack(userId, socket);
      if (!last) return;
      this.geo().userDisconnected(userId);
      this.sessions().userDisconnected(userId);
    });
  }

  private requestSession(
    userId: string,
    request: unknown,
  ): SessionRequestResult {
    try {
      const body = ZagSocketServer.toSessionRequest(request);
      const ticket = this.sessions().request(userId, body);
      return { success: true, ...ticket };
    } catch (error) {
      if (error instanceof SessionError || error instanceof QueueError) {
        return { success: false, code: error.code };
      }
      this.logger.error('session request failed', { userId, error });
      return { success: false, code: 'EINTERNAL' };
    }
  }

  /** Remembers the socket; `true` when it is the user's first one. */
  private track(userId: string, socket: ZagSocket): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (sockets) {
      sockets.add(socket);
      return false;
    }
    this.socketsByUser.set(userId, new Set([socket]));
    return true;
  }

  /** Forgets the socket; `true` when it was the user's last one. */
  private untrack(userId: string, socket: ZagSocket): boolean {
    const sockets = this.socketsByUser.get(userId);
    if (!sockets) return false;
    sockets.delete(socket);
    if (sockets.size > 0) return false;
    this.socketsByUser.delete(userId);
    return true;
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
