import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  GeoCheckResult,
  PublicState,
  QueuePlace,
  SessionEnd,
  SessionInfo,
  ZagFlag,
} from '@zag/protocol';
import { FakeCloudClient } from '../../infrastructure/ccs/fake-cloud-client';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger';
import { ZagAppState } from '../domain/app-state';
import type { ClientGateway } from '../ports/client-gateway';
import { GeoService } from './geo-service';

const PROGRAMS: Record<ZagFlag, string> = {
  techPause: 'p1',
  interactive: 'p2',
  locationRestriction: 'p3',
  schedule: 'p4',
};
const RESTRICTED: Record<ZagFlag, boolean> = {
  techPause: false,
  interactive: true,
  locationRestriction: true,
  schedule: false,
};

const CENTER = { latitude: 49.8397, longitude: 24.0297 };
const EAST_111M = { latitude: 49.8397, longitude: 24.03124 };

class FakeClients implements ClientGateway {
  readonly geo: string[] = [];
  readonly other: string[] = [];
  clientsCount = 0;

  broadcastState(state: PublicState): void {
    this.other.push(`state:${state.screen}`);
  }

  notifyQueue(userId: string, place: QueuePlace): void {
    this.other.push(`${userId}:queue:${place.position}`);
  }

  notifySessionStart(userId: string, info: SessionInfo): void {
    this.other.push(`${userId}:start:${info.mode}`);
  }

  notifySessionEnd(userId: string, end: SessionEnd): void {
    this.other.push(`${userId}:end:${end.reason}`);
  }

  notifyGeo(userId: string, result: GeoCheckResult): void {
    this.geo.push(`${userId}:${result.reason}`);
  }

  close(): void {
    this.clientsCount = 0;
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createService = (
  overrides: Partial<Record<ZagFlag, boolean>> = {},
  center: typeof CENTER | null = CENTER,
) => {
  const logger = new StructuredLogger({ write: () => {} });
  const state = new ZagAppState({
    groupID: 'g',
    programs: PROGRAMS,
    initial: RESTRICTED,
    overrides,
    logger,
  });
  const clients = new FakeClients();
  const cloud = new FakeCloudClient({ logger, location: CENTER });
  const service = new GeoService(
    { radiusM: 100, accuracyToleranceM: 30, center, sampleTimeoutMs: 40 },
    state,
    clients,
    cloud,
    logger,
  );
  return { service, state, clients, cloud };
};

describe('GeoService', () => {
  it('allows everyone and checks nothing while the restriction is off', async () => {
    const { service, clients } = createService({ locationRestriction: false });
    service.userConnected('u1');
    assert.equal(service.isAllowed('u1'), true);
    assert.deepEqual(service.check('u1', { latitude: 0, longitude: 0 }), {
      allowed: true,
      distanceM: -1,
      reason: 'disabled',
    });
    await sleep(60);
    assert.deepEqual(clients.geo, []);
    assert.equal(service.summary.restricted, false);
  });

  it('gates by the last verdict and takes the centre from the CCS login', () => {
    const { service } = createService({}, null);
    service.userConnected('u1');
    assert.equal(service.isAllowed('u1'), false);
    assert.equal(service.summary.hasCenter, true, 'centre of the fake CCS');
    assert.equal(service.check('u1', EAST_111M).reason, 'too-far');
    assert.equal(service.isAllowed('u1'), false);
    assert.equal(service.check('u1', CENTER).reason, 'ok');
    assert.equal(service.isAllowed('u1'), true);
    service.userDisconnected('u1');
    assert.equal(service.isAllowed('u1'), false, 'verdict forgotten');
    service.stop();
  });

  it('tells a silent phone `missing` after the sample timeout', async () => {
    const { service, clients } = createService();
    service.userConnected('silent');
    service.userConnected('quick');
    service.check('quick', CENTER);
    service.userConnected('gone');
    service.userDisconnected('gone');
    await sleep(70);
    assert.deepEqual(clients.geo, ['silent:missing']);
    assert.equal(service.isAllowed('silent'), false);
    assert.equal(service.isAllowed('quick'), true);
    // The next sample lifts the block; no second timer runs.
    assert.equal(service.check('silent', CENTER).allowed, true);
    assert.equal(service.isAllowed('silent'), true);
    await sleep(60);
    assert.deepEqual(clients.geo, ['silent:missing']);
    service.stop();
  });

  it('restarts the timers for every connected user when the flag turns on', async () => {
    const { service, state, clients } = createService();
    service.userConnected('u1');
    service.check('u1', CENTER);
    state.apply([{ programID: 'p3', value: 0 }]);
    assert.equal(service.isAllowed('u1'), true);
    service.userConnected('u2');
    await sleep(60);
    assert.deepEqual(clients.geo, [], 'nothing pending while off');
    state.apply([{ programID: 'p3', value: 1 }]);
    assert.equal(service.isAllowed('u1'), false, 'old verdicts dropped');
    await sleep(60);
    assert.deepEqual(clients.geo.sort(), ['u1:missing', 'u2:missing']);
    service.stop();
  });
});
