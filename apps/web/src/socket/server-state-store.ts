import { EVENTS, ZAG_FLAGS, type PublicState } from '@zag/protocol';
import type { ZagSocket } from './socket-context';

export interface ServerStateStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PublicState | null;
}

const isSameState = (a: PublicState | null, b: PublicState): boolean =>
  a !== null &&
  a.screen === b.screen &&
  a.synced === b.synced &&
  ZAG_FLAGS.every((flag) => a.flags[flag] === b.flags[flag]);

/**
 * Latest `PublicState` of the server for useSyncExternalStore.
 * The server pushes `state:update` right after the handshake and on every
 * change (shared-modules.md § 4); on each (re)connect the client also asks
 * `state:get`, so a push lost during a reconnect cannot leave a stale
 * screen. The last state survives a disconnect: the UI shows «Зв'язок
 * втрачено» from the connection status, not from here.
 */
export const createServerStateStore = (socket: ZagSocket): ServerStateStore => {
  const listeners = new Set<() => void>();
  let snapshot: PublicState | null = null;

  const update = (state: PublicState) => {
    if (isSameState(snapshot, state)) return;
    snapshot = state;
    for (const listener of listeners) listener();
  };

  socket.on(EVENTS.stateUpdate, update);
  socket.on('connect', () => {
    socket.emit(EVENTS.stateGet, update);
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
};
