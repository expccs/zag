import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SessionQueue, type QueueTask } from './session-queue';

type Step = 'fade' | 'session';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const task = (
  id: string,
  userId: string,
  durationMs: number,
  payload: Step,
): QueueTask<Step> => ({ id, userId, durationMs, payload });

// A user's turn: the fade and then the session, same id.
const turn = (
  id: string,
  userId: string,
  fadeMs = 30,
  sessionMs = 100,
): QueueTask<Step>[] => [
  task(id, userId, fadeMs, 'fade'),
  task(id, userId, sessionMs, 'session'),
];

const near = (value: number, max: number, slackMs = 20): boolean =>
  value > max - slackMs && value <= max;

describe('SessionQueue', () => {
  it('runs turns step by step without a gap, reports places and events', async () => {
    const queue = new SessionQueue<Step>();
    const current = () =>
      queue.currentTask
        ? `${queue.currentTask.id}:${queue.currentTask.payload}`
        : null;
    const log: string[] = [];
    const updates: string[] = [];
    queue.on('start', (t) => log.push(`start:${t.id}:${t.payload}`));
    queue.on('finish', (t, reason) => {
      log.push(`finish:${t.id}:${t.payload}:${reason}`);
    });
    queue.on('drain', () => log.push('drain'));
    queue.on('update', (waits) => {
      updates.push(waits.map((w) => `${w.userId}@${w.position}`).join(','));
    });

    const a = queue.enqueue(turn('a', 'u1'));
    assert.equal(a.position, 0, 'the fade of a runs at once');
    assert.ok(near(a.waitMs, 30), `a session starts in ${a.waitMs}`);
    assert.equal(current(), 'a:fade');
    const b = queue.enqueue(turn('b', 'u2'));
    assert.equal(b.position, 1);
    assert.ok(near(b.waitMs, 160), `b waits ${b.waitMs}`);
    const c = queue.enqueue(turn('c', 'u3'));
    assert.equal(c.position, 2);
    assert.ok(near(c.waitMs, 290), `c waits ${c.waitMs}`);
    assert.throws(() => queue.enqueue(turn('x', 'u2')), { code: 'EQUEUED' });
    assert.equal(queue.length, 2);
    assert.equal(queue.remove('u3'), true);
    assert.equal(queue.length, 1);

    await sleep(45); // a: fade done, session running
    assert.equal(current(), 'a:session');
    assert.equal(queue.isCurrentUser('u1'), true);
    await sleep(105); // a: session done at 130, b fade running
    assert.equal(current(), 'b:fade');
    assert.equal(queue.isIdle, false);
    queue.remove('u2'); // skips the fade and drops the session of b
    await flush();

    assert.deepEqual(log, [
      'start:a:fade',
      'finish:a:fade:completed',
      'start:a:session',
      'finish:a:session:completed',
      'start:b:fade',
      'finish:b:fade:skipped',
      'drain',
    ]);
    assert.ok(updates.includes('u2@1'), JSON.stringify(updates));
    assert.equal(queue.isIdle, true);
    assert.equal(queue.hasUser('u2'), false);
  });

  it('emits start after the enqueue call returns (ack first)', async () => {
    const queue = new SessionQueue<Step>();
    const order: string[] = [];
    queue.on('start', () => order.push('start'));
    queue.enqueue([task('a', 'u1', 20, 'session')]);
    order.push('ack');
    await Promise.resolve();
    assert.deepEqual(order, ['ack', 'start']);
    queue.clear();
    assert.equal(queue.isIdle, true);
  });

  it('does not count the running user ahead of the waiting ones', () => {
    const queue = new SessionQueue<Step>();
    queue.enqueue(turn('a', 'u1', 50, 100));
    const b = queue.enqueue(turn('b', 'u2', 50, 100));
    assert.equal(b.position, 1);
    assert.ok(near(b.waitMs, 200), `b waits ${b.waitMs}`);
    assert.deepEqual(
      queue.waits().map((w) => [w.userId, w.position]),
      [['u2', 1]],
    );
    queue.clear();
  });

  it('removing a waiting user updates the others, a stranger is a no-op', async () => {
    const queue = new SessionQueue<Step>();
    const updates: string[][] = [];
    queue.on('update', (waits) => updates.push(waits.map((w) => w.userId)));
    queue.enqueue(turn('a', 'u1'));
    queue.enqueue(turn('b', 'u2'));
    queue.enqueue(turn('c', 'u3'));
    assert.equal(queue.remove('nobody'), false);
    assert.equal(queue.remove('u2'), true);
    await Promise.resolve();
    assert.deepEqual(updates.at(-1), ['u3']);
    assert.equal(queue.waits()[0].position, 1);
    queue.clear();
  });

  it('abort drops the waiting turns silently and skips the running task', async () => {
    const queue = new SessionQueue<Step>();
    const log: string[] = [];
    queue.on('finish', (t, reason) =>
      log.push(`${t.id}:${t.payload}:${reason}`),
    );
    queue.on('update', () => log.push('update'));
    queue.on('drain', () => log.push('drain'));
    queue.enqueue(turn('a', 'u1'));
    queue.enqueue(turn('b', 'u2'));
    queue.enqueue(turn('c', 'u3'));
    assert.deepEqual(queue.abort(), ['u2', 'u3']);
    await flush();
    assert.deepEqual(log, ['a:fade:skipped', 'drain']);
    assert.equal(queue.isIdle, true);
    assert.deepEqual(queue.abort(), []);
  });

  it('rejects an empty or mixed turn as a programming error', () => {
    const queue = new SessionQueue<Step>();
    assert.throws(() => queue.enqueue([]), TypeError);
    assert.throws(
      () =>
        queue.enqueue([
          task('a', 'u1', 10, 'fade'),
          task('a', 'u2', 10, 'session'),
        ]),
      TypeError,
    );
    assert.equal(queue.isIdle, true);
  });
});
