import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import { WebSocketServer } from 'ws';
import type {
  PublicState,
  QueuePlace,
  SessionEnd,
  SessionInfo,
  SessionRequestResult,
  SessionSnapshot,
} from '@zag/protocol';
import { ZagAppState } from './app/domain/app-state';
import { CLIENT_GATEWAY, type ClientGateway } from './app/ports/client-gateway';
import { CLOUD_GATEWAY } from './app/ports/cloud-gateway';
import { FACADE_GATEWAY } from './app/ports/facade-gateway';
import {
  HealthService,
  type HealthReport,
} from './app/services/health-service';
import { SessionService } from './app/services/session-service';
import { StateSyncService } from './app/services/state-sync-service';
import type { DependencyContainer } from 'tsyringe';
import { Application } from './bootstrap';
import type { FakeCloudClient } from './infrastructure/ccs/fake-cloud-client';
import {
  ConfigLoader,
  type ServerConfig,
} from './infrastructure/config/config';
import { HTTP_SERVER } from './infrastructure/http/http-api-server';
import { StructuredLogger } from './infrastructure/logging/structured-logger';

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const once = <T>(socket: Socket, event: string): Promise<T> =>
  new Promise((resolve) => {
    socket.once(event, resolve);
  });

const connectClient = (url: string, userId: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const socket = connect(url, {
      transports: ['websocket'],
      auth: { userId },
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });

class FakeClients implements ClientGateway {
  readonly broadcasts: PublicState[] = [];
  readonly notified: string[] = [];
  clientsCount = 7;
  closed = false;

  broadcastState(state: PublicState): void {
    this.broadcasts.push(state);
  }

  notifyQueue(userId: string): void {
    this.notified.push(userId);
  }

  notifySessionStart(userId: string): void {
    this.notified.push(userId);
  }

  notifySessionEnd(userId: string): void {
    this.notified.push(userId);
  }

  close(): void {
    this.closed = true;
  }
}

interface FacadeMessage {
  request: string;
  payload: { type: string; point: { x: number; y: number } };
}

/** Stands in for TouchDesigner: records every JSON message. */
class FakeTouchDesigner {
  readonly received: FacadeMessage[] = [];
  private readonly server = new WebSocketServer({ port: 0 });

  constructor() {
    this.server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        this.received.push(JSON.parse(raw.toString()) as FacadeMessage);
      });
    });
  }

  get url(): string {
    const { port } = this.server.address() as AddressInfo;
    return `ws://127.0.0.1:${port}`;
  }

  listening(): Promise<void> {
    return new Promise((resolve) => {
      this.server.once('listening', () => resolve());
    });
  }

  close(): Promise<void> {
    for (const client of this.server.clients) client.terminate();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

const logger = new StructuredLogger({ write: () => {} });
const ENV = {
  CCS_MODE: 'offline',
  PORT: '0',
  SESSION_MS: '150',
  FADE_MS: '30',
  DISCONNECT_GRACE_MS: '80',
};

describe('Application (composition root)', () => {
  const td = new FakeTouchDesigner();
  let config: ServerConfig;
  let container: DependencyContainer;
  let url = '';

  before(async () => {
    await td.listening();
    config = ConfigLoader.load({ ...ENV, TD_WS_URL: td.url });
    container = Application.createContainer(config, logger, 'test');
    const app = new Application(container);
    const httpServer = app.httpServer;
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    container.resolve(StateSyncService).start();
    container.resolve(FACADE_GATEWAY).connect();
    await flush();
    await flush();
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    container.resolve(StateSyncService).stop();
    container.resolve(SessionService).stop();
    container.resolve(FACADE_GATEWAY).close();
    container.resolve(CLIENT_GATEWAY).close();
    container.resolve(HTTP_SERVER).close();
    await td.close();
  });

  it('wires the offline graph: synced interactive state on /health', async () => {
    const response = await fetch(`${url}/health`);
    const body = (await response.json()) as HealthReport;
    assert.equal(body.ok, true);
    assert.equal(body.version, 'test');
    assert.equal(body.clients, 0);
    assert.deepEqual(body.ccs, {
      mode: 'offline',
      connected: true,
      projectUID: 'offline-project',
    });
    assert.equal(body.state.synced, true);
    assert.equal(body.state.screen, 'interactive');
    assert.deepEqual(body.sessions, { active: null, waiting: 0 });
    assert.deepEqual(body.facade, { connected: true, dropped: 0 });
  });

  it('hands out container-scoped singletons', () => {
    assert.equal(
      container.resolve(ZagAppState),
      container.resolve(ZagAppState),
    );
    assert.equal(
      container.resolve(StateSyncService),
      container.resolve(StateSyncService),
    );
    assert.equal(
      container.resolve(HealthService).report().state.screen,
      container.resolve(ZagAppState).publicState.screen,
    );
  });

  it('runs the session queue end to end over Socket.IO', async () => {
    const c1 = await connectClient(url, 'user-0000000001');
    const c2 = await connectClient(url, 'user-0000000002');
    const c3 = await connectClient(url, 'user-0000000003');

    // c1's turn starts at once: the fade countdown (`queue:update` with
    // position 0) follows the ack, `session:start` after the fade.
    const fade1 = once<QueuePlace>(c1, 'queue:update');
    const start1 = once<SessionInfo>(c1, 'session:start');
    const t1 = (await c1.emitWithAck('session:request', {
      mode: 'comet',
      params: { head: '#FF4848', tail: '#FF9F3F' },
    })) as SessionRequestResult;
    assert.ok(t1.success && t1.position === 0 && t1.durationMs === 150);
    assert.ok(t1.waitMs > 0 && t1.waitMs <= 30, `countdown ${t1.waitMs}`);
    assert.deepEqual(await fade1, { waitMs: 30, position: 0 });
    assert.equal((await start1).mode, 'comet');
    c1.emit('touch:event', {
      x: 0.25,
      y: 0.75,
      touch: 1,
    });
    const dup = await c1.emitWithAck('session:request', {
      mode: 'comet',
      params: {},
    });
    assert.deepEqual(dup, { success: false, code: 'EQUEUED' });

    // A reloaded page asks over HTTP: c1 draws, c2 has no turn, a bad id
    // is rejected.
    const turn = (userId: string) => fetch(`${url}/session/${userId}`);
    const active = (await (
      await turn('user-0000000001')
    ).json()) as SessionSnapshot;
    assert.ok(active.step === 'active' && active.sessionId === t1.sessionId);
    assert.ok(active.remainingMs > 0 && active.remainingMs <= 150);
    assert.equal((await turn('user-0000000002')).status, 404);
    assert.equal((await turn('x')).status, 400);

    // c2 waits at position 1; a short disconnect keeps the place.
    const t2 = (await c2.emitWithAck('session:request', {
      mode: 'palette',
      params: { palette: 2 },
    })) as SessionRequestResult;
    assert.ok(t2.success && t2.position === 1 && t2.waitMs > 0);
    const waiting = (await (
      await turn('user-0000000002')
    ).json()) as SessionSnapshot;
    assert.ok(waiting.step === 'waiting' && waiting.place.position === 1);
    assert.equal(waiting.request.mode, 'palette');
    const health = async () =>
      (await (await fetch(`${url}/health`)).json()) as HealthReport;
    assert.equal((await health()).sessions.waiting, 1);
    c2.disconnect();
    await sleep(30);
    c2.connect();
    await once(c2, 'connect');
    await sleep(80);
    assert.equal((await health()).sessions.waiting, 1, 'kept within grace');

    // c1 completes, c2's fade and then session follow.
    const end1 = await once<SessionEnd>(c1, 'session:end');
    assert.equal(end1.reason, 'completed');
    const start2 = await once<SessionInfo>(c2, 'session:start');
    assert.equal(start2.mode, 'palette');

    // Tech pause from CCS: everyone gets the state, sessions end skipped.
    const t3 = (await c3.emitWithAck('session:request', {
      mode: 'milky-way',
      params: {},
    })) as SessionRequestResult;
    assert.ok(t3.success && t3.position === 1);
    const ended = Promise.all([
      once<SessionEnd>(c2, 'session:end'),
      once<SessionEnd>(c3, 'session:end'),
      once<PublicState>(c1, 'state:update'),
    ]);
    const cloud = container.resolve(CLOUD_GATEWAY) as FakeCloudClient;
    cloud.setProgramState(config.state.programs.techPause, 1);
    const [end2, end3, state] = await ended;
    assert.equal(end2.reason, 'skipped');
    assert.equal(end3.reason, 'skipped');
    assert.equal(state.screen, 'maintenance');
    assert.deepEqual((await health()).sessions, { active: null, waiting: 0 });
    const denied = await c3.emitWithAck('session:request', {
      mode: 'comet',
      params: {},
    });
    assert.deepEqual(denied, { success: false, code: 'ENOTALLOWED' });

    // Back to interactive; a user who leaves for longer than grace is gone.
    cloud.setProgramState(config.state.programs.techPause, 0);
    await once(c3, 'state:update');
    const t4 = (await c3.emitWithAck('session:request', {
      mode: 'comet',
      params: {},
    })) as SessionRequestResult;
    assert.ok(t4.success);
    c3.disconnect();
    await sleep(120);
    assert.deepEqual((await health()).sessions, { active: null, waiting: 0 });

    for (const socket of [c1, c2]) socket.close();

    // TouchDesigner saw only the stream: c1's single touch opened a
    // stroke (commands reach TD through CCS, below); y is bottom-left.
    await sleep(20);
    assert.deepEqual(td.received, [
      {
        request: 'stream',
        payload: { type: 'stroke:begin', point: { x: 0.25, y: 0.75 } },
      },
    ]);
    assert.equal((await health()).facade.dropped, 0);

    // The CCS «Public app controls» buttons mirror the facade commands.
    const { programs } = config.controls;
    const button = Object.fromEntries(
      Object.entries(programs).map(([name, id]) => [id, name]),
    );
    const buttons = cloud.commands.map((command) => {
      const name = button[command.programID];
      const json = command.params?.[0];
      if (typeof json !== 'string') return name;
      return `${name} ${(JSON.parse(json) as { mode: string }).mode}`;
    });
    assert.deepEqual(buttons, [
      'fade comet',
      'sessionStart comet',
      'sessionEnd',
      'fade palette',
      'sessionStart palette',
      'sessionEnd',
      'idle',
      'fade comet',
      'sessionStart comet',
      'sessionEnd',
      'idle',
    ]);
    assert.ok(
      cloud.commands.every(
        (command) =>
          command.groupID === 'offline:controls' &&
          command.projectUID === 'offline-project',
      ),
    );
  });
});

describe('Application container overrides', () => {
  it('a port re-registered with a fake reaches every use case', async () => {
    const config = ConfigLoader.load(ENV);
    const container = Application.createContainer(config, logger, 'test');
    const clients = new FakeClients();
    container.register(CLIENT_GATEWAY, { useValue: clients });

    container.resolve(StateSyncService).start();
    await flush();
    await flush();

    assert.equal(container.resolve(HealthService).report().clients, 7);
    assert.equal(clients.broadcasts.at(-1)?.screen, 'interactive');
    container.resolve(CLOUD_GATEWAY).close();
  });
});
