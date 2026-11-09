import type { InjectionToken } from 'tsyringe';

/**
 * Queue timing: `SESSION_MS`, `FADE_MS`, `DISCONNECT_GRACE_MS`,
 * `QUEUE_SYNC_MS`.
 */
export interface SessionConfig {
  /** Length of one drawing session. */
  sessionMs: number;
  /**
   * The fade task that opens every turn: the facade animates into the
   * interactive while the user watches the countdown.
   */
  fadeMs: number;
  /** How long a disconnected user keeps the place in the queue. */
  disconnectGraceMs: number;
  /** How often every waiting phone gets its place again (clock resync). */
  syncMs: number;
}

export const SESSION_CONFIG: InjectionToken<SessionConfig> =
  Symbol('SessionConfig');
