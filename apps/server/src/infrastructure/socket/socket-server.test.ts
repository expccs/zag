import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import {
  AUTH_ERROR,
  type PublicState,
  type SessionRequest,
  type SessionTicket,
  type TouchEvent,
} from '@zag/protocol';
import type { LogFields } from '../../app/ports/logger';
import { SessionError, type SessionApi } from '../../app/ports/session-api';
import { HealthHttpServer } from '../http/health-http-server';
import { StructuredLogger } from '../logging/structured-logger';
import { ZagSocketServer } from './socket-server';

interface LogRecord extends LogFields {
  level: string;
  message: string;
}

const USER_ID = 'user-0123456789';
const STATE: PublicState = {
  flags: {
    techPause: false,
    interactive: true,
    locationRestriction: false,
    schedule: false,
  },
  screen: 'interactive',
  synced: true,
};
const TICKET: SessionTicket = {
  sessionId: 's1',
  waitMs: 0,
  position: 0,
  durationMs: 40_000,
};

/** Records calls; `request` fails for mode `nope`, throws raw for `boom`. */
class FakeSessionApi implements SessionApi {
  readonly calls: string[] = [];
  readonly touches: TouchEvent[] = [];

  request(userId: string, request: SessionRequest): SessionTicket {
    this.calls.push(`request:${userId}:${request.mode}`);
    if ((request.mode as string) === 'nope') throw new SessionError('EBADMODE');
    if ((request.mode as string) === 'boom') throw new Error('kaboom');
    return TICKET;
  }

  cancel(userId: string): boolean {
    this.calls.push(`cancel:${userId}`);
    return true;
  }

  handleTouch(userId: string, event: TouchEvent): boolean {
    this.touches.push(event);
    this.calls.push(`touch:${userId}`);
    return true;
  }

  userConnected(userId: string): void {
    this.calls.push(`connected:${userId}`);
  }

  userDisconnected(userId: string): void {
    this.calls.push(`disconnected:${userId}`);
  }
}

const waitFor = <T>(
  check: () => T | undefined,
  timeoutMs = 2_000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      const value = check();
      if (value !== undefined) {
        resolve(value);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('waitFor: timeout'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });

const connectClient = (url: string, auth: object): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect(url, { transports: ['websocket'], auth });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });

const closed = (socket: Socket): Promise<void> =>
  new Promise((resolve) => {
    socket.once('disconnect', () => resolve());
    socket.close();
  });

describe('socket server', () => {
  const records: LogRecord[] = [];
  const sessions = new FakeSessionApi();
  let server: ZagSocketServer;
  let url = '';

  before(async () => {
    const logger = new StructuredLogger({
      write: (line) => records.push(JSON.parse(line) as LogRecord),
    });
    const httpServer = HealthHttpServer.create({
      health: () => ({
        ok: true,
        version: 'test',
        uptimeS: 0,
        clients: 0,
        ccs: { mode: 'offline', connected: false, projectUID: null },
        state: STATE,
        sessions: { active: null, waiting: 0 },
        facade: { connected: true, dropped: 0 },
      }),
    });
    server = new ZagSocketServer(httpServer, {
      allowedOrigins: [],
      trustProxy: true,
      logger,
      state: () => STATE,
      sessions: () => sessions,
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  after(() => {
    server.close();
  });

  it('serves /health', async () => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; version: string };
    assert.equal(body.ok, true);
    assert.equal(body.version, 'test');
  });

  it('answers 404 elsewhere', async () => {
    const response = await fetch(`${url}/nope`);
    assert.equal(response.status, 404);
  });

  it('rejects a handshake without a valid userId', async () => {
    await assert.rejects(
      connectClient(url, { userId: 'short' }),
      (error: Error) => error.message === AUTH_ERROR,
    );
    const rejected = await waitFor(() =>
      records.find((record) => record.message === 'socket rejected'),
    );
    assert.equal(rejected.level, 'warn');
    assert.equal(rejected.reason, AUTH_ERROR);
  });

  it('logs connection and disconnection with user context', async () => {
    const client = await connectClient(url, { userId: USER_ID });
    const connected = await waitFor(() =>
      records.find(
        (record) =>
          record.message === 'socket connected' && record.userId === USER_ID,
      ),
    );
    assert.equal(connected.level, 'info');
    assert.equal(connected.transport, 'websocket');
    assert.equal(typeof connected.socketId, 'string');
    assert.equal(typeof connected.ip, 'string');
    assert.ok(typeof connected.clients === 'number' && connected.clients >= 1);
    assert.equal(server.clientsCount, 1);

    client.close();
    const disconnected = await waitFor(() =>
      records.find(
        (record) =>
          record.message === 'socket disconnected' &&
          record.socketId === connected.socketId,
      ),
    );
    assert.equal(disconnected.userId, USER_ID);
    assert.equal(typeof disconnected.reason, 'string');
    assert.equal(typeof disconnected.durationMs, 'number');
  });

  it('pushes the state on connect, answers state:get, broadcasts', async () => {
    // Listen before connecting: the push arrives right after the handshake.
    const socket = connect(url, {
      transports: ['websocket'],
      auth: { userId: USER_ID },
    });
    const pushed = new Promise<PublicState>((resolve) => {
      socket.once('state:update', resolve);
    });
    await new Promise<void>((resolve) => {
      socket.once('connect', () => resolve());
    });
    const asked = await socket.emitWithAck('state:get');
    assert.deepEqual(await pushed, STATE);
    assert.deepEqual(asked, STATE);

    const next: PublicState = { ...STATE, screen: 'disabled' };
    const broadcast = new Promise<PublicState>((resolve) => {
      socket.once('state:update', resolve);
    });
    server.broadcastState(next);
    assert.deepEqual(await broadcast, next);
    await closed(socket);
  });

  it('routes session:request / cancel / touch to the session API', async () => {
    const user = 'user-routing-000001';
    const calls = () => sessions.calls.filter((call) => call.includes(user));
    const socket = await connectClient(url, { userId: user });
    const ok = await socket.emitWithAck('session:request', {
      mode: 'comet',
      params: { color: '#ff4848' },
    });
    assert.deepEqual(ok, { success: true, ...TICKET });
    const bad = await socket.emitWithAck('session:request', { mode: 'nope' });
    assert.deepEqual(bad, { success: false, code: 'EBADMODE' });
    const boom = await socket.emitWithAck('session:request', { mode: 'boom' });
    assert.deepEqual(boom, { success: false, code: 'EINTERNAL' });
    const cancelled = await socket.emitWithAck('session:cancel');
    assert.deepEqual(cancelled, { success: true, removed: true });

    socket.emit('touch:event', { x: 2, y: 0, touch: 1 });
    socket.emit('touch:event', { x: 0.25, y: 0.75, touch: 1 });
    await waitFor(() => sessions.touches.length === 1 || undefined);
    assert.deepEqual(sessions.touches[0], { x: 0.25, y: 0.75, touch: 1 });
    assert.deepEqual(calls(), [
      `connected:${user}`,
      `request:${user}:comet`,
      `request:${user}:nope`,
      `request:${user}:boom`,
      `cancel:${user}`,
      `touch:${user}`,
    ]);
    const failed = records.find((r) => r.message === 'session request failed');
    assert.equal(failed?.level, 'error');
    await closed(socket);
    await waitFor(
      () => sessions.calls.includes(`disconnected:${user}`) || undefined,
    );
  });

  it('notifies every tab of a user, and only that user', async () => {
    const user = 'user-tabs-00000001';
    const other = 'user-other-000001';
    const [a1, a2, b] = await Promise.all([
      connectClient(url, { userId: user }),
      connectClient(url, { userId: user }),
      connectClient(url, { userId: other }),
    ]);
    const got: string[] = [];
    const listen = (socket: Socket, name: string) => {
      socket.on('queue:update', (p) => got.push(`${name}:queue:${p.position}`));
      socket.on('session:start', (i) => got.push(`${name}:start:${i.mode}`));
      socket.on('session:end', (e) => got.push(`${name}:end:${e.reason}`));
    };
    listen(a1, 'a1');
    listen(a2, 'a2');
    listen(b, 'b');

    server.notifyQueue(user, { waitMs: 10, position: 2 });
    server.notifySessionStart(other, {
      sessionId: 's2',
      mode: 'palette',
      durationMs: 1,
      endsAt: 1,
    });
    server.notifySessionEnd(user, { reason: 'completed' });
    await waitFor(() => (got.length === 5 ? got : undefined));
    assert.deepEqual(got.sort(), [
      'a1:end:completed',
      'a1:queue:2',
      'a2:end:completed',
      'a2:queue:2',
      'b:start:palette',
    ]);

    // The user is "disconnected" only when the last tab goes.
    await closed(a1);
    assert.equal(sessions.calls.includes(`disconnected:${user}`), false);
    await closed(a2);
    await waitFor(
      () => sessions.calls.includes(`disconnected:${user}`) || undefined,
    );
    await closed(b);
  });
});

describe('ZagSocketServer.resolveClientIp', () => {
  const request = (headers: Record<string, string>, remote = '10.0.0.1') =>
    ({ headers, socket: { remoteAddress: remote } }) as never;

  it('prefers the first X-Forwarded-For entry when the proxy is trusted', () => {
    const forwarded = request({ 'x-forwarded-for': '1.2.3.4, 10.0.0.2' });
    assert.equal(ZagSocketServer.resolveClientIp(forwarded, true), '1.2.3.4');
    assert.equal(ZagSocketServer.resolveClientIp(forwarded, false), '10.0.0.1');
    assert.equal(
      ZagSocketServer.resolveClientIp(request({}), true),
      '10.0.0.1',
    );
  });
});

describe('ZagSocketServer.isTouchEvent', () => {
  it('accepts unit coordinates and a touch bit only', () => {
    const valid = { x: 0, y: 1, touch: 0 };
    assert.equal(ZagSocketServer.isTouchEvent(valid), true);
    assert.equal(ZagSocketServer.isTouchEvent({ ...valid, x: 1.01 }), false);
    assert.equal(ZagSocketServer.isTouchEvent({ ...valid, touch: 2 }), false);
    assert.equal(ZagSocketServer.isTouchEvent({ x: 0, y: 0 }), false);
    assert.equal(ZagSocketServer.isTouchEvent(null), false);
  });
});
