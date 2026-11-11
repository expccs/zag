import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PublicState, ZagFlag } from '@zag/protocol';
import { FakeCloudClient } from '../../infrastructure/ccs/fake-cloud-client';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger';
import { ZagAppState } from '../domain/app-state';
import type { ClientGateway } from '../ports/client-gateway';
import type { ProgramGroup } from '../ports/cloud-gateway';
import { StateSyncService } from './state-sync-service';

const PROGRAMS: Record<ZagFlag, string> = {
  techPause: 'p1',
  interactive: 'p2',
  locationRestriction: 'p3',
  schedule: 'p4',
};
const SAFE: Record<ZagFlag, boolean> = {
  techPause: true,
  interactive: false,
  locationRestriction: true,
  schedule: false,
};
const LIVE: Record<ZagFlag, number> = {
  techPause: 0,
  interactive: 1,
  locationRestriction: 0,
  schedule: 0,
};

class FakeClients implements ClientGateway {
  readonly broadcasts: PublicState[] = [];
  readonly notified: string[] = [];
  clientsCount = 0;
  closed = false;

  broadcastState(state: PublicState): void {
    this.broadcasts.push(state);
  }

  notifyQueue(userId: string): void {
    this.notified.push(userId);
  }

  notifyGeo(userId: string): void {
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

const ccsGroup = (values: Record<ZagFlag, number>): ProgramGroup => ({
  _id: 'g',
  name: 'state',
  projectID: 'proj',
  main: false,
  programs: (Object.keys(values) as ZagFlag[]).map((flag) => ({
    _id: PROGRAMS[flag],
    name: flag,
    type: 'SWITCH',
    state: { value: values[flag] },
  })),
});

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const createService = (groups: ProgramGroup[]) => {
  const lines: string[] = [];
  const logger = new StructuredLogger({ write: (line) => lines.push(line) });
  const cloud = new FakeCloudClient({ logger, groups });
  const state = new ZagAppState({
    groupID: 'g',
    programs: PROGRAMS,
    initial: SAFE,
    logger,
  });
  const clients = new FakeClients();
  const service = new StateSyncService(cloud, state, clients, logger);
  return { service, cloud, state, clients, lines };
};

describe('StateSyncService', () => {
  it('connects, syncs from CCS and broadcasts the synced state', async () => {
    const { service, state, clients } = createService([ccsGroup(LIVE)]);
    assert.equal(state.publicState.screen, 'maintenance');

    service.start();
    await flush();
    await flush();

    assert.equal(state.isSynced, true);
    assert.equal(state.publicState.screen, 'interactive');
    // `change` (flags flipped by the sync) then `synced`.
    assert.equal(clients.broadcasts.length, 2);
    assert.deepEqual(clients.broadcasts.at(-1), state.publicState);
    assert.throws(() => service.start(), /already started/);
  });

  it('pushes every CCS switch flip to the clients as it happens', async () => {
    const { service, cloud, clients } = createService([ccsGroup(LIVE)]);
    service.start();
    await flush();
    await flush();
    const before = clients.broadcasts.length;

    cloud.setProgramState(PROGRAMS.schedule, 1);
    assert.equal(clients.broadcasts.length, before + 1);
    assert.equal(clients.broadcasts.at(-1)?.screen, 'schedule');

    cloud.setProgramState(PROGRAMS.schedule, 1);
    assert.equal(clients.broadcasts.length, before + 1, 'no-op flip is silent');

    service.stop();
    assert.equal(cloud.isConnected, false);
  });

  it('re-reads the state group on every connect, not only the first', async () => {
    const group = ccsGroup(LIVE);
    const { service, cloud, state, clients } = createService([group]);
    service.start();
    await flush();
    await flush();
    assert.equal(state.publicState.screen, 'interactive');
    const before = clients.broadcasts.length;

    // CCS flipped Maintenance while we were disconnected: no event was
    // delivered, only the group content differs on the next read.
    const { techPause } = PROGRAMS;
    const maintenance = group.programs.find((p) => p._id === techPause);
    maintenance!.state = { value: 1 };
    cloud.emit('connect');
    await flush();
    await flush();

    assert.equal(state.publicState.screen, 'maintenance');
    // One broadcast for the real change; the repeated `synced` is silent.
    assert.equal(clients.broadcasts.length, before + 1);
    assert.equal(clients.broadcasts.at(-1)?.screen, 'maintenance');
  });

  it('logs and keeps serving when the state group is missing', async () => {
    const { service, state, clients, lines } = createService([]);
    service.start();
    await flush();
    await flush();
    assert.equal(state.isSynced, false);
    assert.equal(clients.broadcasts.length, 0);
    assert.ok(lines.some((line) => line.includes('state group not found')));
  });
});
