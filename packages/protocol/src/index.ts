/**
 * Socket.IO protocol between the ZAG PWA (@zag/web) and the server
 * (@zag/server). Source of truth: docs/backend/shared-modules.md § 4.
 *
 * Only event names, payload shapes and shared constants live here.
 * Behaviour belongs to the apps.
 */

export const USER_ID_MIN_LENGTH = 8;
export const USER_ID_MAX_LENGTH = 64;

export const isValidUserId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= USER_ID_MIN_LENGTH &&
  value.length <= USER_ID_MAX_LENGTH;

/** Sent by the client in the handshake: io(url, { auth }). */
export interface HandshakeAuth {
  userId: string;
}

/** connect_error message when HandshakeAuth is missing or malformed. */
export const AUTH_ERROR = 'EAUTH';

export type ZagFlag =
  'techPause' | 'interactive' | 'locationRestriction' | 'schedule';

export const ZAG_FLAGS: readonly ZagFlag[] = [
  'techPause',
  'interactive',
  'locationRestriction',
  'schedule',
];

export type FlagMap = Readonly<Record<ZagFlag, boolean>>;

export type Screen = 'maintenance' | 'disabled' | 'schedule' | 'interactive';

export interface PublicState {
  flags: FlagMap;
  screen: Screen;
  synced: boolean;
}

export type InteractiveMode = 'comet' | 'milky-way' | 'palette';

export const INTERACTIVE_MODES: readonly InteractiveMode[] = [
  'comet',
  'milky-way',
  'palette',
];

export interface GeoSample {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type GeoReason = 'ok' | 'too-far' | 'no-center' | 'invalid' | 'disabled';

export interface GeoCheckResult {
  allowed: boolean;
  distanceM: number;
  reason: GeoReason;
}

export interface SessionRequest {
  mode: InteractiveMode;
  params: Record<string, string | number>;
}

export type SessionErrorCode =
  'ENOTALLOWED' | 'EBADMODE' | 'EQUEUED' | 'EINTERNAL';

/**
 * Place in the queue. `position: 0` means the user's turn is on: the
 * facade is fading in and the session starts in `waitMs` (the countdown).
 * Otherwise `position` counts the users ahead and `waitMs` includes their
 * fades and sessions.
 */
export interface QueuePlace {
  waitMs: number;
  position: number;
}

export interface SessionTicket extends QueuePlace {
  sessionId: string;
  /** Length of the drawing session itself (after the fade). */
  durationMs: number;
}

export type SessionRequestResult =
  | ({ success: true } & SessionTicket)
  | { success: false; code: SessionErrorCode };

export interface SessionCancelResult {
  success: true;
  removed: boolean;
}

export interface SessionInfo {
  sessionId: string;
  mode: InteractiveMode;
  durationMs: number;
  endsAt: number;
}

export type SessionEndReason = 'completed' | 'skipped';

export interface SessionEnd {
  reason: SessionEndReason;
}

export type SwipeDirection = 'left' | 'right' | 'none';

export interface TouchEvent {
  /**
   * Normalised to [0, 1] within the drawing area, origin in the
   * bottom-left corner (TouchDesigner UV): `x` grows to the right, `y`
   * grows upwards.
   */
  x: number;
  y: number;
  touch: 0 | 1;
  swipe: 0 | 1;
  direction: SwipeDirection;
}

export const EVENTS = {
  stateUpdate: 'state:update',
  stateGet: 'state:get',
  geoCheck: 'geo:check',
  sessionRequest: 'session:request',
  sessionCancel: 'session:cancel',
  queueUpdate: 'queue:update',
  sessionStart: 'session:start',
  sessionEnd: 'session:end',
  touchEvent: 'touch:event',
} as const;

/** Events emitted by the server, received by the client. */
export interface ServerToClientEvents {
  'state:update': (state: PublicState) => void;
  'queue:update': (place: QueuePlace) => void;
  'session:start': (info: SessionInfo) => void;
  'session:end': (end: SessionEnd) => void;
}

/** Events emitted by the client, received by the server. */
export interface ClientToServerEvents {
  'state:get': (ack: (state: PublicState) => void) => void;
  'geo:check': (
    sample: GeoSample,
    ack: (result: GeoCheckResult) => void,
  ) => void;
  'session:request': (
    request: SessionRequest,
    ack: (result: SessionRequestResult) => void,
  ) => void;
  'session:cancel': (ack: (result: SessionCancelResult) => void) => void;
  'touch:event': (event: TouchEvent) => void;
}

/** Per-socket data the server keeps after a successful handshake. */
export interface SocketData {
  userId: string;
}
