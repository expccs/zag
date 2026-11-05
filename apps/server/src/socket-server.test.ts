import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { AUTH_ERROR } from '@zag/protocol';
import { createHttpServer } from './http-server';
import { createLogger, type LogFields } from './logger';
import { createSocketServer, type ZagServer } from './socket-server';

interface LogRecord extends LogFields {
  level: string;
  message: string;
}

const USER_ID = 'user-0123456789';

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
  let io: ZagServer;
  let url = '';

  before(async () => {
    const logger = createLogger({
      write: (line) => records.push(JSON.parse(line) as LogRecord),
    });
    const httpServer = createHttpServer({
      health: () => ({ ok: true, version: 'test', uptimeS: 0, clients: 0 }),
    });
    io = createSocketServer(httpServer, {
      allowedOrigins: [],
      trustProxy: true,
      logger,
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  after(() => {
    io.close();
  });

  it('serves /health', async () => {
    const response = await fetch(`${url}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; version: string };
    assert.equal(body.ok, true);
    assert.equal(body.version, 'test');
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
});
