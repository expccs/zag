import type { Server, Socket } from 'socket.io';
import { AppError, type Application, type TouchEvent } from './application';
import type { GeoSample } from './geo-fence';
import { QueueError } from './session-queue';

type Ack<T> = (response: T) => void;

type Result<T> = ({ success: true } & T) | { success: false; code: string };

const USER_ID_MIN = 8;
const USER_ID_MAX = 64;
const DIRECTIONS = new Set(['left', 'right', 'none']);

const isUnit = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1;

const isBit = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

const isTouchEvent = (value: unknown): value is TouchEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    isUnit(event.x) &&
    isUnit(event.y) &&
    isBit(event.touch) &&
    isBit(event.swipe) &&
    DIRECTIONS.has(event.direction as string)
  );
};

const toGeoSample = (value: unknown): GeoSample => {
  const sample = (value ?? {}) as Record<string, unknown>;
  return {
    latitude: Number(sample.latitude),
    longitude: Number(sample.longitude),
    accuracy: Number(sample.accuracy) || 0,
  };
};

const failure = (error: unknown): Result<never> => {
  if (error instanceof AppError || error instanceof QueueError) {
    return { success: false, code: error.code };
  }
  console.error(error);
  return { success: false, code: 'EINTERNAL' };
};

export interface SocketApiOptions {
  disconnectGraceMs: number;
}

export const attachSocketApi = (
  io: Server,
  app: Application,
  options: SocketApiOptions,
): void => {
  const socketsByUser = new Map<string, Set<Socket>>();
  const graceTimers = new Map<string, NodeJS.Timeout>();

  const emitToUser = (userId: string, event: string, payload: unknown) => {
    const sockets = socketsByUser.get(userId);
    if (!sockets) return;
    for (const socket of sockets) socket.emit(event, payload);
  };

  app.on('state', (state) => io.emit('state:update', state));
  app.on('queue', (userId, place) => emitToUser(userId, 'queue:update', place));
  app.on('sessionStart', (userId, info) => {
    emitToUser(userId, 'session:start', info);
  });
  app.on('sessionEnd', (userId, reason) => {
    emitToUser(userId, 'session:end', { reason });
  });

  io.use((socket, next) => {
    const userId = socket.handshake.auth.userId;
    const isValid =
      typeof userId === 'string' &&
      userId.length >= USER_ID_MIN &&
      userId.length <= USER_ID_MAX;
    if (!isValid) {
      next(new Error('EAUTH'));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    const grace = graceTimers.get(userId);
    if (grace) {
      clearTimeout(grace);
      graceTimers.delete(userId);
    }
    let bucket = socketsByUser.get(userId);
    if (!bucket) {
      bucket = new Set();
      socketsByUser.set(userId, bucket);
    }
    bucket.add(socket);

    socket.emit('state:update', app.publicState);

    socket.on('state:get', (ack: Ack<unknown>) => {
      ack(app.publicState);
    });

    socket.on('geo:check', (sample: unknown, ack: Ack<unknown>) => {
      ack(app.checkLocation(toGeoSample(sample)));
    });

    socket.on('session:request', (request: unknown, ack: Ack<unknown>) => {
      try {
        const body = (request ?? {}) as Record<string, unknown>;
        const ticket = app.requestSession(userId, {
          mode: body.mode as never,
          params: (body.params ?? {}) as Record<string, string | number>,
        });
        ack({ success: true, ...ticket });
      } catch (error) {
        ack(failure(error));
      }
    });

    socket.on('session:cancel', (ack: Ack<unknown>) => {
      ack({ success: true, removed: app.cancelSession(userId) });
    });

    socket.on('touch:event', (event: unknown) => {
      if (!isTouchEvent(event)) return;
      app.handleTouch(userId, event);
    });

    socket.on('disconnect', () => {
      const sockets = socketsByUser.get(userId);
      if (!sockets) return;
      sockets.delete(socket);
      if (sockets.size > 0) return;
      socketsByUser.delete(userId);
      const timer = setTimeout(() => {
        graceTimers.delete(userId);
        app.cancelSession(userId);
      }, options.disconnectGraceMs);
      graceTimers.set(userId, timer);
    });
  });
};
