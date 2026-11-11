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

/**
 * Verdict of the geo-fence (shared-modules.md § 1.3). `disabled`: the
 * `locationRestriction` flag is off, every position passes. `missing`:
 * the phone sent no `geo:check` within `GEO_SAMPLE_TIMEOUT_MS` of its
 * connection while the restriction is on; pushed by the server as
 * `geo:update`, cleared by the next sample.
 */
export type GeoReason =
  'ok' | 'too-far' | 'no-center' | 'invalid' | 'disabled' | 'missing';

export interface GeoCheckResult {
  allowed: boolean;
  /** Metres to the facade; `-1` when unknown. */
  distanceM: number;
  reason: GeoReason;
}

export interface SessionRequest {
  mode: InteractiveMode;
  params: Record<string, string | number>;
}

/**
 * `ELOCATION`: the restriction is on and the phone has not passed a
 * `geo:check` on this connection (or its last one failed).
 */
export type SessionErrorCode =
  'ENOTALLOWED' | 'ELOCATION' | 'EBADMODE' | 'EQUEUED' | 'EINTERNAL';

/**
 * Place in the queue. `position: 0` means the user's turn is on: the
 * facade is fading in and the session starts in `waitMs` (the countdown).
 * Otherwise `position` counts the users ahead and `waitMs` includes their
 * fades and sessions. Sent on every change of the queue, every
 * `QUEUE_SYNC_MS` while the user waits, and on reconnect: the phone
 * always restarts its countdown from the latest value.
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
  /**
   * Milliseconds the session still runs from now: the full length on the
   * first `session:start`, the remainder when the server re-sends it to a
   * reconnected phone.
   */
  durationMs: number;
  /** Server clock; phones count from their own `now + durationMs`. */
  endsAt: number;
}

export type SessionEndReason = 'completed' | 'skipped';

/** HTTP route of `SessionSnapshot`: `GET ${SESSION_PATH}/:userId`. */
export const SESSION_PATH = '/session';

/**
 * The user's turn as the server holds it, over HTTP (`GET
 * /session/:userId`, shared-modules.md § 4): a phone that reloaded the
 * page restores the queue screen from it before the socket is up. `404`
 * when the user has no turn. `waiting`: the place as `queue:update` would
 * give it (`position: 0` = the fade is on); `active`: the session runs
 * for `remainingMs` more.
 */
export type SessionSnapshot =
  | {
      step: 'waiting';
      sessionId: string;
      request: SessionRequest;
      durationMs: number;
      place: QueuePlace;
    }
  | {
      step: 'active';
      sessionId: string;
      request: SessionRequest;
      durationMs: number;
      remainingMs: number;
    };

export interface SessionEnd {
  reason: SessionEndReason;
}

export interface TouchEvent {
  /**
   * Normalised to [0, 1] within the drawing area, origin in the
   * bottom-left corner (TouchDesigner UV): `x` grows to the right, `y`
   * grows upwards.
   */
  x: number;
  y: number;
  /** 1 while the finger is down (touch, then moves), 0 on release. */
  touch: 0 | 1;
}

export const EVENTS = {
  stateUpdate: 'state:update',
  stateGet: 'state:get',
  geoCheck: 'geo:check',
  geoUpdate: 'geo:update',
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
  /** The server's verdict changed without a sample: timeout, flag flip. */
  'geo:update': (result: GeoCheckResult) => void;
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
