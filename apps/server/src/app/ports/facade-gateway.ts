import type {
  InteractiveMode,
  SessionEndReason,
  SessionRequest,
  TouchEvent,
} from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';

/** The facade prepares for `sessionId`: `durationMs` until the session. */
export interface FadeCommand {
  type: 'fade';
  sessionId: string;
  mode: InteractiveMode;
  params: SessionRequest['params'];
  durationMs: number;
}

export interface SessionStartCommand {
  type: 'session:start';
  sessionId: string;
  mode: InteractiveMode;
  params: SessionRequest['params'];
  durationMs: number;
}

/** Also sent when a fade is skipped (cancel / tech pause) without a session. */
export interface SessionEndCommand {
  type: 'session:end';
  sessionId: string;
  reason: SessionEndReason;
}

/** The queue is empty: back to the idle show. */
export interface DrainCommand {
  type: 'drain';
}

export type FacadeCommand =
  FadeCommand | SessionStartCommand | SessionEndCommand | DrainCommand;

/** Unit coordinates of the protocol: origin bottom-left, `y` grows upwards. */
export interface FacadeTouch extends TouchEvent {
  type: 'touch:event';
  sessionId: string;
}

/**
 * Driven port: the facade renderer (TouchDesigner, shared-modules.md § 5).
 * Commands are buffered until the renderer is reachable and stamped with
 * `timestamp`; the touch stream is fire-and-forget. Implemented by
 * `infrastructure/touch-designer`; an offline adapter only logs.
 */
export interface FacadeGateway {
  readonly isConnected: boolean;
  /** Touch events dropped because the renderer was not connected. */
  readonly droppedCount: number;
  connect(): void;
  command(command: FacadeCommand): void;
  /** `false` when dropped. */
  stream(touch: FacadeTouch): boolean;
  close(): void;
}

export const FACADE_GATEWAY: InjectionToken<FacadeGateway> =
  Symbol('FacadeGateway');
