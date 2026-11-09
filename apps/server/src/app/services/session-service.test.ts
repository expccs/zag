import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  PublicState,
  QueuePlace,
  SessionEnd,
  SessionInfo,
  TouchEvent,
  ZagFlag,
} from '@zag/protocol';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger';
import { ZagAppState } from '../domain/app-state';
import type { ClientGateway } from '../ports/client-gateway';
import type {
  FacadeCommand,
  FacadeGateway,
  FacadeTouch,
} from '../ports/facade-gateway';
import { SessionService } from './session-service';

const PROGRAMS: Record<ZagFlag, string> = {
  techPause: 'p1',
  interactive: 'p2',
  locationRestriction: 'p3',
  schedule: 'p4',
};
const INTERACTIVE: Record<ZagFlag, boolean> = {
  techPause: false,
  interactive: true,
  locationRestriction: false,
  schedule: false,
};

class FakeClients implements ClientGateway {
  readonly events: string[] = [];
  readonly broadcasts: PublicState[] = [];
  clientsCount = 0;

  broadcastState(state: PublicState): void {
    this.broadcasts.push(state);
  }

  notifyQueue(userId: string, place: QueuePlace): void {
    this.events.push(`${userId}:queue:${place.position}`);
  }

  notifySessionStart(userId: string, info: SessionInfo): void {
    this.events.push(`${userId}:start:${info.mode}`);
  }

  notifySessionEnd(userId: string, end: SessionEnd): void {
    this.events.push(`${userId}:end:${end.reason}`);
  }

  close(): void {
    this.clientsCount = 0;
  }
}

class FakeFacade implements FacadeGateway {
  readonly commands: string[] = [];
  readonly touches: FacadeTouch[] = [];
  isConnected = true;
  droppedCount = 0;

  connect(): void {
    this.isConnected = true;
  }

  // `type:id4[:reason][:mode]`, e.g. `fade:1a2b:comet`, `drain`.
  command(command: FacadeCommand): void {
    const parts: string[] = [command.type];
    if (command.type !== 'drain') parts.push(command.sessionId.slice(0, 4));
    if ('reason' in command) parts.push(command.reason);
    if ('mode' in command) parts.push(command.mode);
    this.commands.push(parts.join(':'));
  }

  stream(touch: FacadeTouch): boolean {
    this.touches.push(touch);
    return true;
  }

  close(): void {
    this.isConnected = false;
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const FAST = { sessionMs: 60, fadeMs: 20, disconnectGraceMs: 30, syncMs: 25 };

const createService = (
  overrides: Partial<Record<ZagFlag, boolean>> = {},
  config = FAST,
) => {
  const logger = new StructuredLogger({ write: () => {} });
  const state = new ZagAppState({
    groupID: 'g',
    programs: PROGRAMS,
    initial: INTERACTIVE,
    overrides,
    logger,
  });
  const clients = new FakeClients();
  const facade = new FakeFacade();
  const service = new SessionService(config, state, clients, facade, logger);
  return { service, state, clients, facade };
};

const COMET = { mode: 'comet' as const, params: { color: '#ff4848' } };
const TOUCH: TouchEvent = {
  x: 0.5,
  y: 0.5,
  touch: 1,
};

describe('SessionService', () => {
  it('opens every turn with a fade, then runs the session', async () => {
    const { service, clients, facade } = createService();
    const first = service.request('u1', COMET);
    assert.equal(first.position, 0, 'the fade of u1 is on');
    assert.ok(
      first.waitMs > 0 && first.waitMs <= 20,
      `countdown ${first.waitMs}`,
    );
    assert.equal(first.durationMs, 60);
    const second = service.request('u2', { mode: 'palette', params: {} });
    assert.equal(second.position, 1);
    assert.ok(second.waitMs > 60, `u2 waits ${second.waitMs}`);
    assert.deepEqual(service.summary, {
      active: first.sessionId,
      waiting: 1,
    });
    await flush();
    assert.deepEqual(clients.events, ['u1:queue:0']);
    const id = first.sessionId.slice(0, 4);
    assert.deepEqual(facade.commands, [`fade:${id}:comet`]);
    assert.equal(service.handleTouch('u1', TOUCH), false, 'no touch in fade');

    await sleep(25);
    assert.ok(clients.events.includes('u1:start:comet'));
    assert.ok(clients.events.includes('u2:queue:1'));
    assert.equal(facade.commands.at(-1), `session:start:${id}:comet`);
    assert.equal(service.handleTouch('u1', { ...TOUCH, touch: 0 }), false);
    assert.equal(service.handleTouch('u1', TOUCH), true);
    assert.equal(service.handleTouch('u2', TOUCH), false);
    assert.equal(service.handleTouch('u1', TOUCH), true);
    assert.equal(service.handleTouch('u1', { ...TOUCH, touch: 0 }), true);
    assert.equal(service.handleTouch('u1', TOUCH), true);
    assert.deepEqual(
      facade.touches.map((touch) => touch.phase),
      ['begin', 'move', 'end', 'begin'],
    );
    assert.equal(facade.touches[0].sessionId, first.sessionId);
    assert.equal(facade.touches[0].type, 'touch:event');

    await sleep(60 + 20 + 15);
    const id2 = second.sessionId.slice(0, 4);
    assert.ok(clients.events.includes('u1:end:completed'));
    assert.ok(clients.events.includes('u2:queue:0'));
    assert.ok(clients.events.includes('u2:start:palette'));
    assert.deepEqual(facade.commands.slice(1), [
      `session:start:${id}:comet`,
      `session:end:${id}:completed`,
      `fade:${id2}:palette`,
      `session:start:${id2}:palette`,
    ]);
    service.stop();
  });

  it('rejects by code: wrong screen, bad mode, already queued', () => {
    const paused = createService({ techPause: true });
    assert.throws(() => paused.service.request('u1', COMET), {
      code: 'ENOTALLOWED',
    });
    const { service } = createService();
    assert.throws(
      () => service.request('u1', { mode: 'laser' as never, params: {} }),
      { code: 'EBADMODE' },
    );
    service.request('u1', COMET);
    assert.throws(() => service.request('u1', COMET), { code: 'EQUEUED' });
    service.stop();
  });

  it('a cancelled fade ends the turn for the client and the facade', async () => {
    const { service, clients, facade } = createService();
    const ticket = service.request('u1', COMET);
    service.request('u2', COMET);
    await flush();
    assert.equal(service.cancel('u1'), true);
    await flush();
    const id = ticket.sessionId.slice(0, 4);
    assert.deepEqual(clients.events, [
      'u1:queue:0',
      'u1:end:skipped',
      'u2:queue:0',
    ]);
    assert.equal(facade.commands[1], `session:end:${id}:skipped`);
    assert.equal(facade.commands[2]?.startsWith('fade:'), true);
    assert.equal(service.summary.waiting, 0);
    service.stop();
  });

  it('keeps a disconnected user for the grace period only', async () => {
    const long = { ...FAST, sessionMs: 500 };
    const { service, clients } = createService({}, long);
    service.request('u1', COMET);
    service.request('u2', COMET);
    service.userDisconnected('u2');
    service.userConnected('u2');
    await sleep(40);
    assert.equal(service.summary.waiting, 1, 'returned within grace');

    service.userDisconnected('u2');
    await sleep(40);
    assert.equal(service.summary.waiting, 0, 'grace expired');
    assert.equal(service.cancel('u2'), false);
    assert.equal(service.cancel('u1'), true);
    await flush();
    assert.ok(clients.events.includes('u1:end:skipped'));
    service.stop();
  });

  it('resends places periodically and to a phone that reconnects', async () => {
    const { service, clients } = createService({}, { ...FAST, sessionMs: 200 });
    const first = service.request('u1', COMET);
    service.request('u2', COMET);
    service.request('u3', COMET);
    await flush();
    const queueEvents = () =>
      clients.events.filter((event) => event.includes(':queue:'));
    try {
      // Only the fade start of u1 so far; ticks (and u1's fade ending) then
      // repeat the places of u2 and u3 over and over.
      assert.deepEqual(queueEvents(), ['u1:queue:0']);
      await sleep(30);
      const early = queueEvents();
      assert.ok(early.includes('u2:queue:1') && early.includes('u3:queue:2'));
      await sleep(60);
      const later = queueEvents();
      assert.ok(later.length >= early.length + 2, 'ticks keep coming');
      // u1 runs its session: it is not part of the sync any more.
      assert.deepEqual(later.slice(-2), ['u2:queue:1', 'u3:queue:2']);

      // u3 comes back from a connection drop: its place; u1 its session.
      const before = clients.events.length;
      service.userConnected('u3');
      service.userConnected('u1');
      service.userConnected('stranger');
      assert.deepEqual(clients.events.slice(before), [
        'u3:queue:2',
        'u1:start:comet',
      ]);
      assert.equal(service.summary.active, first.sessionId);
    } finally {
      service.stop();
    }
  });

  it('aborts every turn when the screen leaves interactive', async () => {
    const { service, state, clients, facade } = createService();
    const ticket = service.request('u1', COMET);
    service.request('u2', COMET);
    service.request('u3', COMET);
    await flush();
    state.apply([{ programID: PROGRAMS.techPause, value: 1 }]);
    await flush();
    assert.deepEqual(clients.events.slice(1), [
      'u2:end:skipped',
      'u3:end:skipped',
      'u1:end:skipped',
    ]);
    const id = ticket.sessionId.slice(0, 4);
    assert.deepEqual(facade.commands, [
      `fade:${id}:comet`,
      `session:end:${id}:skipped`,
      'drain',
    ]);
    assert.deepEqual(service.summary, { active: null, waiting: 0 });
    assert.throws(() => service.request('u4', COMET), { code: 'ENOTALLOWED' });
    service.stop();
  });
});
