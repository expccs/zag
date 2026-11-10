import {
  EVENTS,
  type QueuePlace,
  type SessionEnd,
  type SessionEndReason,
  type SessionInfo,
  type SessionRequest,
  type SessionRequestResult,
  type SessionSnapshot,
  type TouchEvent,
} from '@zag/protocol';
import type { ZagSocket } from './socket-context';

/**
 * The user's turn as the client sees it (shared-modules.md § 4). Timestamps
 * are local `Date.now()` values computed when the event arrived, never the
 * server clock.
 */
export type SessionPhase =
  /** Page just loaded: `restore` is asking whether a turn survived. */
  | { phase: 'restoring' }
  | { phase: 'idle' }
  /** Setup done; the request waits for the phone to turn to landscape. */
  | { phase: 'pending'; request: SessionRequest }
  /** `session:request` sent, ack not yet in. */
  | { phase: 'requesting'; request: SessionRequest }
  | {
      phase: 'queued';
      sessionId: string;
      request: SessionRequest;
      durationMs: number;
      position: number;
      /** When the session itself starts (the fade ends). */
      turnAt: number;
    }
  | {
      phase: 'fade';
      sessionId: string;
      request: SessionRequest;
      durationMs: number;
      startsAt: number;
    }
  | {
      phase: 'active';
      sessionId: string;
      request: SessionRequest;
      durationMs: number;
      endsAt: number;
    }
  | { phase: 'ended'; request: SessionRequest; reason: SessionEndReason };

export interface SessionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SessionPhase;
  /**
   * Asks the server (HTTP) for the turn this phone may still hold after a
   * reload and resumes it; resolves `true` when there was one.
   */
  restore: () => Promise<boolean>;
  /** Remembers the chosen mode; nothing is sent until `start`. */
  prepare: (request: SessionRequest) => void;
  /** Sends the prepared `session:request`; the phase follows the ack. */
  start: () => Promise<SessionRequestResult>;
  /** Leaves the queue (or the running turn) and goes idle. */
  cancel: () => void;
  /** Forgets the turn without telling the server (final screen, leaving). */
  reset: () => void;
  /** Streams a touch of the running session; dropped when not active. */
  sendTouch: (event: TouchEvent) => void;
}

export interface SessionStoreOptions {
  /** `GET /session/:userId` for this phone; `null` when there is no turn. */
  fetchTurn: () => Promise<SessionSnapshot | null>;
}

const ACK_TIMEOUT_MS = 5_000;
const RESTORING: SessionPhase = { phase: 'restoring' };
const IDLE: SessionPhase = { phase: 'idle' };

type LivePhase = Extract<SessionPhase, { phase: 'queued' | 'fade' | 'active' }>;

const isLive = (phase: SessionPhase): phase is LivePhase =>
  phase.phase === 'queued' ||
  phase.phase === 'fade' ||
  phase.phase === 'active';

export const createSessionStore = (
  socket: ZagSocket,
  { fetchTurn }: SessionStoreOptions,
): SessionStore => {
  const listeners = new Set<() => void>();
  let snapshot: SessionPhase = RESTORING;

  const set = (next: SessionPhase) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  // A place handed out by the server: `position: 0` means the fade is on.
  const applyPlace = (
    place: QueuePlace,
    sessionId: string,
    request: SessionRequest,
    durationMs: number,
  ) => {
    const now = Date.now();
    if (place.position === 0) {
      set({
        phase: 'fade',
        sessionId,
        request,
        durationMs,
        startsAt: now + place.waitMs,
      });
      return;
    }
    set({
      phase: 'queued',
      sessionId,
      request,
      durationMs,
      position: place.position,
      turnAt: now + place.waitMs,
    });
  };

  // The server's snapshot of the turn, as the events would have built it.
  const applyTurn = (turn: SessionSnapshot) => {
    const { sessionId, request, durationMs } = turn;
    if (turn.step === 'waiting') {
      applyPlace(turn.place, sessionId, request, durationMs);
      return;
    }
    set({
      phase: 'active',
      sessionId,
      request,
      durationMs,
      endsAt: Date.now() + turn.remainingMs,
    });
  };

  const restore = async (): Promise<boolean> => {
    const turn = await fetchTurn();
    if (turn) {
      applyTurn(turn);
      return true;
    }
    if (snapshot.phase === 'restoring') set(IDLE);
    return false;
  };

  const emitRequest = async (
    request: SessionRequest,
  ): Promise<SessionRequestResult> => {
    try {
      return await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck(EVENTS.sessionRequest, request);
    } catch {
      return { success: false, code: 'EINTERNAL' };
    }
  };

  const start = async (): Promise<SessionRequestResult> => {
    const current = snapshot;
    if (current.phase !== 'pending') {
      return { success: false, code: 'EINTERNAL' };
    }
    const body = current.request;
    set({ phase: 'requesting', request: body });
    const result = await emitRequest(body);
    if (result.success) {
      applyPlace(result, result.sessionId, body, result.durationMs);
    } else if (result.code === 'EQUEUED') {
      // The server still holds a turn of this phone (reload within the
      // grace period, or another tab): resume it instead of asking again.
      const turn = await fetchTurn();
      if (turn) applyTurn(turn);
      else set(IDLE);
    } else if (snapshot.phase === 'requesting') {
      set({ phase: 'pending', request: body });
    }
    return result;
  };

  // The socket came back after a drop. The server kept the place for its
  // grace period; asking again tells which: `EQUEUED` keeps the local turn,
  // a fresh ticket re-queues, anything else means the turn is gone.
  const reconcile = async () => {
    const current = snapshot;
    if (!isLive(current)) return;
    const result = await emitRequest(current.request);
    if (result.success) {
      applyPlace(result, result.sessionId, current.request, result.durationMs);
      return;
    }
    if (result.code !== 'EQUEUED') set(IDLE);
  };

  socket.on(EVENTS.queueUpdate, (place: QueuePlace) => {
    const current = snapshot;
    if (!isLive(current)) return;
    applyPlace(place, current.sessionId, current.request, current.durationMs);
  });
  socket.on(EVENTS.sessionStart, (info: SessionInfo) => {
    const current = snapshot;
    if (!isLive(current)) return;
    set({
      phase: 'active',
      sessionId: info.sessionId,
      request: current.request,
      durationMs: info.durationMs,
      endsAt: Date.now() + info.durationMs,
    });
  });
  socket.on(EVENTS.sessionEnd, (end: SessionEnd) => {
    const current = snapshot;
    if (!isLive(current)) return;
    set({ phase: 'ended', request: current.request, reason: end.reason });
  });
  socket.on('connect', () => {
    void reconcile();
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    restore,
    prepare: (body) => {
      set({ phase: 'pending', request: body });
    },
    start,
    cancel: () => {
      if (isLive(snapshot)) socket.emit(EVENTS.sessionCancel, () => {});
      set(IDLE);
    },
    reset: () => {
      set(IDLE);
    },
    sendTouch: (event) => {
      if (snapshot.phase !== 'active') return;
      socket.volatile.emit(EVENTS.touchEvent, event);
    },
  };
};
