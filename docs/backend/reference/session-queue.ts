import { EventEmitter } from 'node:events';

export interface QueueTask<T> {
  id: string;
  userId: string;
  durationMs: number;
  payload: T;
}

export interface QueuePlace {
  waitMs: number;
  position: number;
}

export interface QueueWait<T> extends QueuePlace {
  task: QueueTask<T>;
}

export type FinishReason = 'completed' | 'skipped';

export interface SessionQueueEvents<T> {
  start: [task: QueueTask<T>, endsAt: number];
  finish: [task: QueueTask<T>, reason: FinishReason];
  update: [waits: QueueWait<T>[]];
  drain: [];
}

export interface SessionQueueOptions {
  gapMs?: number;
}

export class QueueError extends Error {
  constructor(readonly code: 'EQUEUED') {
    super(code);
    this.name = 'QueueError';
  }
}

export class SessionQueue<T> extends EventEmitter<SessionQueueEvents<T>> {
  private waiting: QueueTask<T>[] = [];
  private current: QueueTask<T> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private headStartsAt = 0;
  private readonly gapMs: number;

  constructor(options: SessionQueueOptions = {}) {
    super();
    this.gapMs = options.gapMs ?? 0;
  }

  get length(): number {
    return this.waiting.length;
  }

  get currentTask(): QueueTask<T> | null {
    return this.current;
  }

  get isIdle(): boolean {
    return this.current === null && this.timer === null;
  }

  isCurrentUser(userId: string): boolean {
    return this.current !== null && this.current.userId === userId;
  }

  hasUser(userId: string): boolean {
    if (this.isCurrentUser(userId)) return true;
    return this.waiting.some((task) => task.userId === userId);
  }

  enqueue(task: QueueTask<T>): QueuePlace {
    if (this.hasUser(task.userId)) throw new QueueError('EQUEUED');
    if (this.isIdle) {
      this.run(task);
      return { waitMs: 0, position: 0 };
    }
    this.waiting.push(task);
    return this.placeOf(this.waiting.length - 1);
  }

  remove(userId: string): boolean {
    if (this.isCurrentUser(userId)) {
      this.skipCurrent();
      return true;
    }
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((task) => task.userId !== userId);
    const removed = this.waiting.length !== before;
    if (removed) this.emitUpdate();
    return removed;
  }

  skipCurrent(): void {
    if (!this.current || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.finish('skipped');
  }

  waits(): QueueWait<T>[] {
    return this.waiting.map((task, index) => ({
      task,
      ...this.placeOf(index),
    }));
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.waiting = [];
    this.headStartsAt = 0;
  }

  private placeOf(index: number): QueuePlace {
    let waitMs = Math.max(0, this.headStartsAt - Date.now());
    for (let i = 0; i < index; i++) {
      waitMs += this.waiting[i].durationMs + this.gapMs;
    }
    return { waitMs, position: index + 1 };
  }

  private run(task: QueueTask<T>): void {
    const now = Date.now();
    const endsAt = now + task.durationMs;
    this.current = task;
    this.headStartsAt = endsAt + this.gapMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.finish('completed');
    }, task.durationMs);
    queueMicrotask(() => this.emit('start', task, endsAt));
  }

  private finish(reason: FinishReason): void {
    const task = this.current as QueueTask<T>;
    this.current = null;
    queueMicrotask(() => this.emit('finish', task, reason));
    if (this.waiting.length === 0) {
      this.headStartsAt = 0;
      queueMicrotask(() => this.emit('drain'));
      return;
    }
    const gapMs = reason === 'skipped' ? this.gapMs : this.gapRemainingMs();
    this.headStartsAt = Date.now() + gapMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.waiting.shift() as QueueTask<T>;
      this.run(next);
      this.emitUpdate();
    }, gapMs);
    this.emitUpdate();
  }

  private gapRemainingMs(): number {
    return Math.max(0, this.headStartsAt - Date.now());
  }

  private emitUpdate(): void {
    if (this.waiting.length === 0) return;
    queueMicrotask(() => this.emit('update', this.waits()));
  }
}
