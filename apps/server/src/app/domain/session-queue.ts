import { EventEmitter } from 'node:events';
import type { QueuePlace, SessionEndReason } from '@zag/protocol';

export interface QueueTask<T> {
  id: string;
  userId: string;
  durationMs: number;
  payload: T;
}

export interface QueueWait extends QueuePlace {
  userId: string;
}

export interface SessionQueueEvents<T> {
  start: [task: QueueTask<T>, endsAt: number];
  finish: [task: QueueTask<T>, reason: SessionEndReason];
  update: [waits: QueueWait[]];
  drain: [];
}

export class QueueError extends Error {
  readonly code = 'EQUEUED';

  constructor() {
    super('EQUEUED');
    this.name = 'QueueError';
  }
}

/**
 * Single-lane queue of user turns (shared-modules.md § 1.5). A turn is the
 * chain of tasks of one user (the facade fade, then the session) that run
 * back to back: one task runs for its `durationMs`, the next one starts
 * the moment it ends, so there is no idle gap between users. A user holds
 * at most one turn. `start` / `finish` / `update` / `drain` fire through
 * `queueMicrotask` so the ack of the request that caused them reaches the
 * client first.
 */
export class SessionQueue<T> extends EventEmitter<SessionQueueEvents<T>> {
  private waiting: QueueTask<T>[] = [];
  private current: QueueTask<T> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private currentEndsAt = 0;

  /** Users whose turn has not started yet. */
  get length(): number {
    return this.waits().length;
  }

  get currentTask(): QueueTask<T> | null {
    return this.current;
  }

  get isIdle(): boolean {
    return this.current === null;
  }

  isCurrentUser(userId: string): boolean {
    return this.current !== null && this.current.userId === userId;
  }

  hasUser(userId: string): boolean {
    if (this.isCurrentUser(userId)) return true;
    return this.waiting.some((task) => task.userId === userId);
  }

  /** The user's running task, else the first waiting one; `null` if none. */
  taskOf(userId: string): QueueTask<T> | null {
    if (this.current && this.current.userId === userId) return this.current;
    return this.waiting.find((task) => task.userId === userId) ?? null;
  }

  /**
   * Appends the user's turn; its first task starts now when the queue is
   * idle. Returns the place: `position: 0` means the turn is running and
   * `waitMs` is the time until its last task (the session) starts.
   */
  enqueue(turn: QueueTask<T>[]): QueuePlace {
    const [first, ...rest] = turn;
    if (!first) throw new TypeError('Empty turn');
    const { userId } = first;
    if (rest.some((task) => task.userId !== userId)) {
      throw new TypeError('A turn belongs to one user');
    }
    if (this.hasUser(userId)) throw new QueueError();
    if (this.isIdle) {
      this.run(first);
      this.waiting.push(...rest);
    } else {
      this.waiting.push(...turn);
    }
    return this.placeOf(userId);
  }

  /** Drops the user's turn: waiting silently, the running task skipped. */
  remove(userId: string): boolean {
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((task) => task.userId !== userId);
    if (this.isCurrentUser(userId)) {
      this.skipCurrent();
      return true;
    }
    if (this.waiting.length === before) return false;
    this.emitUpdate();
    return true;
  }

  /** Ends the running task as `skipped`; the next waiting task starts. */
  skipCurrent(): void {
    if (!this.current) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.finish('skipped');
  }

  /**
   * Drops every waiting turn without events and skips the running task
   * (which emits `finish` and `drain`). Returns the users dropped silently
   * so the caller can tell them.
   */
  abort(): string[] {
    const dropped = this.waits().map((wait) => wait.userId);
    this.waiting = [];
    this.skipCurrent();
    return dropped;
  }

  /**
   * Every user who still waits for a task to start: the waiting users in
   * order and, first, the running user while an earlier task of the turn
   * (the fade) is on (`position: 0`). For periodic resyncs of the phones.
   */
  places(): QueueWait[] {
    const current = this.current;
    const places = this.waits();
    if (current && this.lastIndexOf(current.userId) !== -1) {
      places.unshift({
        userId: current.userId,
        ...this.placeOf(current.userId),
      });
    }
    return places;
  }

  /** One entry per waiting user, in order; the running user is not listed. */
  waits(): QueueWait[] {
    const seen = new Set<string>();
    const waits: QueueWait[] = [];
    for (const { userId } of this.waiting) {
      if (seen.has(userId) || this.isCurrentUser(userId)) continue;
      seen.add(userId);
      waits.push({ userId, ...this.placeOf(userId) });
    }
    return waits;
  }

  /** Forgets everything without events (shutdown). */
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.waiting = [];
    this.currentEndsAt = 0;
  }

  // Time until the user's last task starts: the rest of the running task
  // plus every waiting task ahead of it. Position counts the other users
  // ahead; the running user (whose fade is on) is 0.
  private placeOf(userId: string): QueuePlace {
    const last = this.lastIndexOf(userId);
    if (last === -1) return { waitMs: 0, position: 0 };
    let waitMs = this.currentRemainingMs();
    const ahead = new Set<string>();
    for (const task of this.waiting.slice(0, last)) {
      waitMs += task.durationMs;
      const isOther = task.userId !== userId;
      if (isOther && !this.isCurrentUser(task.userId)) ahead.add(task.userId);
    }
    const position = this.isCurrentUser(userId) ? 0 : ahead.size + 1;
    return { waitMs, position };
  }

  private lastIndexOf(userId: string): number {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      if (this.waiting[i].userId === userId) return i;
    }
    return -1;
  }

  /** Milliseconds until the running task ends; 0 when idle. */
  currentRemainingMs(): number {
    if (!this.current) return 0;
    return Math.max(0, this.currentEndsAt - Date.now());
  }

  private run(task: QueueTask<T>): void {
    const endsAt = Date.now() + task.durationMs;
    this.current = task;
    this.currentEndsAt = endsAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.finish('completed');
    }, task.durationMs);
    queueMicrotask(() => this.emit('start', task, endsAt));
  }

  private finish(reason: SessionEndReason): void {
    const task = this.current as QueueTask<T>;
    this.current = null;
    this.currentEndsAt = 0;
    queueMicrotask(() => this.emit('finish', task, reason));
    const next = this.waiting.shift();
    if (!next) {
      queueMicrotask(() => this.emit('drain'));
      return;
    }
    this.run(next);
    this.emitUpdate();
  }

  private emitUpdate(): void {
    const waits = this.waits();
    if (waits.length === 0) return;
    queueMicrotask(() => this.emit('update', waits));
  }
}
