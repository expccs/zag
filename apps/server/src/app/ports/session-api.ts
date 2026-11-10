import type {
  SessionErrorCode,
  SessionRequest,
  SessionSnapshot,
  SessionTicket,
  TouchEvent,
} from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';

/** Thrown by `SessionApi.request`; the socket adapter answers `{ code }`. */
export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode) {
    super(code);
    this.name = 'SessionError';
    this.code = code;
  }
}

/**
 * Driving port: what a client transport (Socket.IO today) may ask of the
 * session queue. Implemented by `app/services/session-service.ts`.
 */
export interface SessionApi {
  /** Enqueues or starts a session; throws `SessionError`. */
  request(userId: string, request: SessionRequest): SessionTicket;
  /** Drops the user's place; `true` when there was one. */
  cancel(userId: string): boolean;
  /** The user's turn for a phone that reloaded; `null` when none. */
  snapshot(userId: string): SessionSnapshot | null;
  /** `true` when the touch belongs to the running session's user. */
  handleTouch(userId: string, event: TouchEvent): boolean;
  /** The user has at least one live connection again: stop the grace timer. */
  userConnected(userId: string): void;
  /** The user's last connection dropped: hold the place for the grace. */
  userDisconnected(userId: string): void;
}

export const SESSION_API: InjectionToken<SessionApi> = Symbol('SessionApi');
