import { EVENTS, type GeoCheckResult, type GeoSample } from '@zag/protocol';
import type { ZagSocket } from './socket-context';

/**
 * Why the phone may not use the interactive (shared-modules.md § 6):
 * `denied` — the user refused the location permission;
 * `unavailable` — no Geolocation API, or the phone cannot get a fix;
 * `far` — the server put the phone outside the zone (`too-far`,
 * `no-center`, `invalid`); `missing` — the server waited for a sample in
 * vain (`geo:update`).
 */
export type GeoBlock = 'denied' | 'unavailable' | 'far' | 'missing';

export type GeoStatus =
  /** Not watching: the restriction is off, or the watch has not started. */
  | { status: 'idle' }
  /** Watching, no verdict yet (permission prompt, first fix). */
  | { status: 'checking' }
  | { status: 'allowed'; distanceM: number }
  | { status: 'blocked'; block: GeoBlock; distanceM: number };

export interface GeoStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => GeoStatus;
  /** Starts `watchPosition`; every fix goes to the server. */
  start: () => void;
  /** Stops the watch and forgets the verdict. */
  stop: () => void;
}

const IDLE: GeoStatus = { status: 'idle' };
const CHECKING: GeoStatus = { status: 'checking' };
const ACK_TIMEOUT_MS = 5_000;
const PERMISSION_DENIED = 1;

const blockOf = (result: GeoCheckResult): GeoBlock =>
  result.reason === 'missing' ? 'missing' : 'far';

/**
 * The location restriction as the phone sees it. Nothing happens until
 * `start()`: Touch & Create calls it only while the server's
 * `locationRestriction` flag is on, so with the flag off the browser
 * never asks for the permission. A reconnect re-sends the last fix: the
 * server forgets verdicts with the connection and would otherwise report
 * `missing` after its timeout.
 */
export const createGeoStore = (socket: ZagSocket): GeoStore => {
  const listeners = new Set<() => void>();
  let snapshot: GeoStatus = IDLE;
  let watchId: number | null = null;
  let lastSample: GeoSample | null = null;

  const set = (next: GeoStatus) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const apply = (result: GeoCheckResult) => {
    if (watchId === null) return;
    if (result.allowed) {
      set({ status: 'allowed', distanceM: result.distanceM });
      return;
    }
    set({
      status: 'blocked',
      block: blockOf(result),
      distanceM: result.distanceM,
    });
  };

  const send = async (sample: GeoSample) => {
    lastSample = sample;
    if (!socket.connected) return;
    try {
      const result = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck(EVENTS.geoCheck, sample);
      apply(result);
    } catch {
      // No ack: the connection store shows the outage; the next fix retries.
    }
  };

  const onPosition = (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    void send({ latitude, longitude, accuracy });
  };

  const onError = (error: GeolocationPositionError) => {
    if (watchId === null) return;
    const block: GeoBlock =
      error.code === PERMISSION_DENIED ? 'denied' : 'unavailable';
    set({ status: 'blocked', block, distanceM: -1 });
  };

  const start = () => {
    if (watchId !== null) return;
    if (!('geolocation' in navigator)) {
      watchId = -1;
      set({ status: 'blocked', block: 'unavailable', distanceM: -1 });
      return;
    }
    set(CHECKING);
    watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
    });
  };

  const stop = () => {
    if (watchId === null) return;
    if (watchId >= 0) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    lastSample = null;
    set(IDLE);
  };

  // A verdict the phone did not ask for: the server's sample timeout. A
  // local error (permission, no fix) is the more useful message and stays.
  socket.on(EVENTS.geoUpdate, (result: GeoCheckResult) => {
    const current = snapshot;
    const local =
      current.status === 'blocked' &&
      (current.block === 'denied' || current.block === 'unavailable');
    if (local && !result.allowed) return;
    apply(result);
  });
  socket.on('connect', () => {
    if (lastSample) void send(lastSample);
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    start,
    stop,
  };
};
