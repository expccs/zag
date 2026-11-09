import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { AUTH_ERROR, type PublicState } from '@zag/protocol';
import { HealthHttpServer } from '../http/health-http-server';
import type { LogFields } from '../../app/ports/logger';
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

describe('socket server', () => {
  const records: LogRecord[] = [];
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
      }),
    });
    server = new ZagSocketServer(httpServer, {
      allowedOrigins: [],
      trustProxy: true,
      logger,
      state: () => STATE,
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
    socket.close();
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
