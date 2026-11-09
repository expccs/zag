import {
  EVENTS,
  type QueuePlace,
  type SessionEnd,
  type SessionEndReason,
  type SessionInfo,
  type SessionRequest,
  type SessionRequestResult,
  type TouchEvent,
} from '@zag/protocol';
import type { ZagSocket } from './socket-context';

/**
 * The user's turn as the client sees it (shared-modules.md § 4). Timestamps
 * are local `Date.now()` values computed when the event arrived, never the
 * server clock.
 */
export type SessionPhase =
  | { phase: 'idle' }
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
  /** `session:request`; the phase follows the ack. */
  request: (request: SessionRequest) => Promise<SessionRequestResult>;
  /** Leaves the queue (or the running turn) and goes idle. */
  cancel: () => void;
  /** Forgets the turn without telling the server (final screen, leaving). */
  reset: () => void;
  /** Streams a touch of the running session; dropped when not active. */
  sendTouch: (event: TouchEvent) => void;
}

const ACK_TIMEOUT_MS = 5_000;
const IDLE: SessionPhase = { phase: 'idle' };

type LivePhase = Extract<SessionPhase, { phase: 'queued' | 'fade' | 'active' }>;

const isLive = (phase: SessionPhase): phase is LivePhase =>
  phase.phase === 'queued' ||
  phase.phase === 'fade' ||
  phase.phase === 'active';

export const createSessionStore = (socket: ZagSocket): SessionStore => {
  const listeners = new Set<() => void>();
  let snapshot: SessionPhase = IDLE;

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

  const request = async (
    body: SessionRequest,
  ): Promise<SessionRequestResult> => {
    const result = await emitRequest(body);
    if (result.success) {
      applyPlace(result, result.sessionId, body, result.durationMs);
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
    request,
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
