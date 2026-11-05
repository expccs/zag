import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  AUTH_ERROR,
  isValidUserId,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@zag/protocol';
import type { Logger } from './logger';

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

export interface SocketServerOptions {
  allowedOrigins: string[];
  trustProxy: boolean;
  logger: Logger;
}

const firstHeader = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

export const resolveClientIp = (
  request: IncomingMessage,
  trustProxy: boolean,
): string => {
  if (trustProxy) {
    const forwarded = firstHeader(request.headers['x-forwarded-for']);
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
};

const describeConnection = (socket: ZagSocket, trustProxy: boolean) => {
  const { request } = socket;
  return {
    socketId: socket.id,
    userId: socket.data.userId,
    transport: socket.conn.transport.name,
    ip: resolveClientIp(request, trustProxy),
    userAgent: firstHeader(request.headers['user-agent']),
    origin: firstHeader(request.headers.origin),
    recovered: socket.recovered,
  };
};

export const createSocketServer = (
  httpServer: HttpServer,
  options: SocketServerOptions,
): ZagServer => {
  const { logger, trustProxy } = options;
  const io: ZagServer = new Server(httpServer, {
    transports: ['websocket'],
    cors: { origin: options.allowedOrigins },
  });

  io.use((socket, next) => {
    const { userId } = socket.handshake.auth;
    if (!isValidUserId(userId)) {
      logger.warn('socket rejected', {
        socketId: socket.id,
        ip: resolveClientIp(socket.request, trustProxy),
        reason: AUTH_ERROR,
      });
      next(new Error(AUTH_ERROR));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const connectedAt = Date.now();
    const info = describeConnection(socket, trustProxy);
    logger.info('socket connected', {
      ...info,
      clients: io.engine.clientsCount,
    });

    socket.on('disconnect', (reason) => {
      logger.info('socket disconnected', {
        socketId: info.socketId,
        userId: info.userId,
        reason,
        durationMs: Date.now() - connectedAt,
      });
    });
  });

  return io;
};
