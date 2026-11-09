import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { PublicState } from '@zag/protocol';
import { ZagAppState } from './app/domain/app-state';
import { CLIENT_GATEWAY, type ClientGateway } from './app/ports/client-gateway';
import { CLOUD_GATEWAY } from './app/ports/cloud-gateway';
import { HTTP_SERVER } from './infrastructure/http/health-http-server';
import {
  HealthService,
  type HealthReport,
} from './app/services/health-service';
import { StateSyncService } from './app/services/state-sync-service';
import { Application } from './bootstrap';
import { ConfigLoader } from './infrastructure/config/config';
import { StructuredLogger } from './infrastructure/logging/structured-logger';

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

class FakeClients implements ClientGateway {
  readonly broadcasts: PublicState[] = [];
  clientsCount = 7;
  closed = false;

  broadcastState(state: PublicState): void {
    this.broadcasts.push(state);
  }

  close(): void {
    this.closed = true;
  }
}

const logger = new StructuredLogger({ write: () => {} });
const config = ConfigLoader.load({ CCS_MODE: 'offline', PORT: '0' });

describe('Application (composition root)', () => {
  const container = Application.createContainer(config, logger, 'test');
  let url = '';

  before(async () => {
    const app = new Application(container);
    const httpServer = app.httpServer;
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    container.resolve(StateSyncService).start();
    await flush();
    await flush();
    const { port } = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${port}`;
  });

  after(() => {
    container.resolve(StateSyncService).stop();
    container.resolve(CLIENT_GATEWAY).close();
    container.resolve(HTTP_SERVER).close();
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
});

describe('Application container overrides', () => {
  it('a port re-registered with a fake reaches every use case', async () => {
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
