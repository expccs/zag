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

/** Where a touch sits in its stroke: finger down, dragging, lifted. */
export type StrokePhase = 'begin' | 'move' | 'end';

/** Unit coordinates of the protocol: origin bottom-left, `y` grows upwards. */
export interface FacadeTouch extends TouchEvent {
  type: 'touch:event';
  sessionId: string;
  phase: StrokePhase;
}

/**
 * Driven port: the facade (TouchDesigner, shared-modules.md § 5). Commands
 * are the stages of a turn; the touch stream is fire-and-forget. The
 * renderer adapter (`infrastructure/touch-designer`) streams the points,
 * the CCS adapter (`infrastructure/ccs/cloud-controls.ts`) presses the
 * command buttons; `CompositeFacade` joins them. An offline adapter only
 * logs.
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
