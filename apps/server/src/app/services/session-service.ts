import { randomUUID } from 'node:crypto';
import {
  INTERACTIVE_MODES,
  type SessionEndReason,
  type SessionRequest,
  type SessionTicket,
  type TouchEvent,
} from '@zag/protocol';
import { inject, injectable } from 'tsyringe';
import { ZagAppState } from '../domain/app-state';
import { SessionQueue, type QueueTask } from '../domain/session-queue';
import { CLIENT_GATEWAY, type ClientGateway } from '../ports/client-gateway';
import {
  FACADE_GATEWAY,
  type FacadeGateway,
  type StrokePhase,
} from '../ports/facade-gateway';
import { LOGGER, type Logger } from '../ports/logger';
import { SessionError, type SessionApi } from '../ports/session-api';
import { SESSION_CONFIG, type SessionConfig } from '../ports/session-config';

export type SessionStep = 'fade' | 'session';

/** Payload of a queue task: which step of the user's turn it is. */
export interface SessionTurnStep {
  step: SessionStep;
  request: SessionRequest;
}

export interface SessionSummary {
  /** `sessionId` of the running turn (fade or session), if any. */
  active: string | null;
  waiting: number;
}

type Task = QueueTask<SessionTurnStep>;

/**
 * Use case: the drawing sessions (shared-modules.md § 4). Every request
 * puts a two-step turn in the queue: `fade` (`fadeMs`; the facade animates
 * into the interactive, the user sees the countdown as `queue:update`
 * with `position: 0`) and then the `session` itself. Queue events become
 * per-user `queue:update` / `session:start` / `session:end` and facade
 * commands `fade` / `session:start` / `session:end` / `drain`; touches of
 * the running session are streamed to the facade. A disconnected user
 * keeps the place for `disconnectGraceMs`; leaving `interactive` aborts
 * everything.
 */
@injectable()
export class SessionService implements SessionApi {
  private readonly queue: SessionQueue<SessionTurnStep>;
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private readonly logger: Logger;
  /** A finger is down in the running session (stroke `begin` sent). */
  private strokeOpen = false;
  /** Ticks while anyone waits: every phone gets its place again. */
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(
    @inject(SESSION_CONFIG) private readonly config: SessionConfig,
    @inject(ZagAppState) private readonly state: ZagAppState,
    @inject(CLIENT_GATEWAY) private readonly clients: ClientGateway,
    @inject(FACADE_GATEWAY) private readonly facade: FacadeGateway,
    @inject(LOGGER) logger: Logger,
  ) {
    this.logger = logger.child({ module: 'session' });
    this.queue = new SessionQueue<SessionTurnStep>();
    this.wire();
  }

  get summary(): SessionSummary {
    const current = this.queue.currentTask;
    return {
      active: current ? current.id : null,
      waiting: this.queue.length,
    };
  }

  request(userId: string, request: SessionRequest): SessionTicket {
    if (this.state.publicState.screen !== 'interactive') {
      throw new SessionError('ENOTALLOWED');
    }
    if (!INTERACTIVE_MODES.includes(request.mode)) {
      throw new SessionError('EBADMODE');
    }
    if (this.queue.hasUser(userId)) throw new SessionError('EQUEUED');
    const { fadeMs, sessionMs } = this.config;
    const sessionId = randomUUID();
    const copy = { mode: request.mode, params: { ...request.params } };
    const turn: Task[] = [
      SessionService.task(sessionId, userId, fadeMs, 'fade', copy),
      SessionService.task(sessionId, userId, sessionMs, 'session', copy),
    ];
    const place = this.queue.enqueue(turn);
    this.logger.info('session requested', {
      userId,
      sessionId,
      mode: request.mode,
      ...place,
    });
    return { ...place, sessionId, durationMs: sessionMs };
  }

  cancel(userId: string): boolean {
    const removed = this.queue.remove(userId);
    if (removed) this.logger.info('session cancelled', { userId });
    return removed;
  }

  /**
   * Only the running `session` step accepts touches; the fade does not.
   * The stroke phase is derived here (shared-modules.md § 5): the first
   * `touch: 1` opens a stroke, further ones move it, `touch: 0` ends it; a
   * release without an open stroke is dropped.
   */
  handleTouch(userId: string, event: TouchEvent): boolean {
    const current = this.queue.currentTask;
    if (!current || current.userId !== userId) return false;
    if (current.payload.step !== 'session') return false;
    const phase = this.strokePhase(event);
    if (!phase) return false;
    this.facade.stream({
      type: 'touch:event',
      sessionId: current.id,
      phase,
      ...event,
    });
    return true;
  }

  /**
   * A socket of the user is (back) online: the grace timer stops and the
   * phone gets its current place or session again, so a countdown that
   * drifted or missed events while offline snaps back to the server.
   */
  userConnected(userId: string): void {
    const timer = this.graceTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(userId);
      this.logger.info('session grace cleared', { userId });
    }
    this.resync(userId);
  }

  userDisconnected(userId: string): void {
    if (!this.queue.hasUser(userId) || this.graceTimers.has(userId)) return;
    const { disconnectGraceMs } = this.config;
    const timer = setTimeout(() => {
      this.graceTimers.delete(userId);
      this.logger.info('session grace expired', { userId });
      this.cancel(userId);
    }, disconnectGraceMs);
    this.graceTimers.set(userId, timer);
    this.logger.info('session grace started', { userId, disconnectGraceMs });
  }

  /** Drops timers and the queue without notifying anyone (shutdown). */
  stop(): void {
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    this.graceTimers.clear();
    this.stopSync();
    this.queue.clear();
  }

  /** Sends every waiting phone (and the one in its fade) its place now. */
  syncPlaces(): void {
    for (const { userId, waitMs, position } of this.queue.places()) {
      this.clients.notifyQueue(userId, { waitMs, position });
    }
  }

  private strokePhase(event: TouchEvent): StrokePhase | null {
    if (event.touch === 1) {
      const phase: StrokePhase = this.strokeOpen ? 'move' : 'begin';
      this.strokeOpen = true;
      return phase;
    }
    if (!this.strokeOpen) return null;
    this.strokeOpen = false;
    return 'end';
  }

  private static task(
    id: string,
    userId: string,
    durationMs: number,
    step: SessionStep,
    request: SessionRequest,
  ): Task {
    return { id, userId, durationMs, payload: { step, request } };
  }

  private wire(): void {
    const { queue, clients, facade, logger } = this;
    queue.on('start', (task, endsAt) => {
      if (task.payload.step === 'fade') this.startFade(task);
      else this.startSession(task, endsAt);
    });
    queue.on('finish', (task, reason) => this.finishTask(task, reason));
    queue.on('update', (waits) => {
      for (const { userId, waitMs, position } of waits) {
        clients.notifyQueue(userId, { waitMs, position });
      }
    });
    queue.on('drain', () => {
      logger.info('queue drained');
      this.stopSync();
      facade.command({ type: 'drain' });
    });
    this.state.on('change', () => {
      if (this.state.publicState.screen !== 'interactive') this.abort();
    });
  }

  // Periodic resync: phones throttle timers in the background and miss
  // events while reconnecting; the server's clock wins every `syncMs`.
  private startSync(): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => this.syncPlaces(), this.config.syncMs);
    this.syncTimer.unref();
  }

  private stopSync(): void {
    if (!this.syncTimer) return;
    clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  // The user's own view of the queue, as the events would have told it.
  private resync(userId: string): void {
    const current = this.queue.currentTask;
    if (
      current &&
      current.userId === userId &&
      current.payload.step === 'session'
    ) {
      const { mode } = current.payload.request;
      const remainingMs = this.queue.currentRemainingMs();
      this.clients.notifySessionStart(userId, {
        sessionId: current.id,
        mode,
        durationMs: remainingMs,
        endsAt: Date.now() + remainingMs,
      });
      return;
    }
    const place = this.queue.places().find((item) => item.userId === userId);
    if (!place) return;
    const { waitMs, position } = place;
    this.clients.notifyQueue(userId, { waitMs, position });
  }

  private startFade(task: Task): void {
    this.startSync();
    const { id: sessionId, userId, durationMs } = task;
    const { mode, params } = task.payload.request;
    this.logger.info('fade started', { userId, sessionId, mode, durationMs });
    this.facade.command({ type: 'fade', sessionId, mode, params, durationMs });
    this.clients.notifyQueue(userId, { waitMs: durationMs, position: 0 });
  }

  private startSession(task: Task, endsAt: number): void {
    this.strokeOpen = false;
    const { id: sessionId, userId, durationMs } = task;
    const { mode, params } = task.payload.request;
    this.logger.info('session started', {
      userId,
      sessionId,
      mode,
      durationMs,
    });
    this.facade.command({
      type: 'session:start',
      sessionId,
      mode,
      params,
      durationMs,
    });
    this.clients.notifySessionStart(userId, {
      sessionId,
      mode,
      durationMs,
      endsAt,
    });
  }

  // A completed fade just hands over to the session; a skipped one (cancel,
  // tech pause) ends the turn like a session would.
  private finishTask(task: Task, reason: SessionEndReason): void {
    const { step } = task.payload;
    if (step === 'fade' && reason === 'completed') return;
    this.strokeOpen = false;
    const { id: sessionId, userId } = task;
    this.logger.info('session ended', { userId, sessionId, step, reason });
    this.facade.command({ type: 'session:end', sessionId, reason });
    this.clients.notifySessionEnd(userId, { reason });
  }

  // Screen left `interactive` (tech pause, schedule, disabled): the running
  // task is skipped through the queue, the waiting users are told here.
  private abort(): void {
    const dropped = this.queue.abort();
    const reason: SessionEndReason = 'skipped';
    for (const userId of dropped) {
      this.clients.notifySessionEnd(userId, { reason });
    }
    if (dropped.length > 0) {
      this.logger.info('queue aborted', { waiting: dropped.length });
    }
  }
}
