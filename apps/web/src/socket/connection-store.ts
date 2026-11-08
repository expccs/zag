import type { ConnectionStatus, ZagSocket } from './socket-context';

export interface ConnectionSnapshot {
  status: ConnectionStatus;
  error: string | null;
}

export interface ConnectionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ConnectionSnapshot;
  /** Re-read socket flags after connect() / disconnect() calls. */
  refresh: () => void;
}

/** socket.io-client does not reconnect by itself after this reason. */
const SERVER_DISCONNECT = 'io server disconnect';
const CLIENT_DISCONNECT = 'io client disconnect';
const RECONNECT_AFTER_KICK_MS = 1_000;

/**
 * External store over socket.io-client flags for useSyncExternalStore.
 * Status rules: connected → 'connected'; dropped after a successful
 * connection (reconnecting, or kicked by the server and about to retry)
 * → 'offline' («Зв'язок втрачено»); first attempt in progress →
 * 'connecting'; nothing in flight or closed by `disconnect()` → 'idle'.
 */
export const createConnectionStore = (socket: ZagSocket): ConnectionStore => {
  const listeners = new Set<() => void>();
  let everConnected = false;
  let error: string | null = null;
  let lastReason: string | null = null;
  let snapshot: ConnectionSnapshot = { status: 'idle', error };

  const computeStatus = (): ConnectionStatus => {
    if (socket.connected) return 'connected';
    if (!everConnected) return socket.active ? 'connecting' : 'idle';
    return lastReason === CLIENT_DISCONNECT ? 'idle' : 'offline';
  };

  const refresh = () => {
    const status = computeStatus();
    if (status === snapshot.status && error === snapshot.error) return;
    snapshot = { status, error };
    for (const listener of listeners) listener();
  };

  socket.on('connect', () => {
    everConnected = true;
    error = null;
    refresh();
  });
  socket.on('disconnect', (reason: string) => {
    lastReason = reason;
    refresh();
    // A server restart (`io.close()`) ends with this reason; retry so the
    // screen recovers without a reload. `disconnect()` from the app has
    // its own reason and stays closed.
    if (reason === SERVER_DISCONNECT) {
      setTimeout(() => {
        if (lastReason === SERVER_DISCONNECT && !socket.active) {
          socket.connect();
          refresh();
        }
      }, RECONNECT_AFTER_KICK_MS);
    }
  });
  socket.on('connect_error', (connectError: Error) => {
    error = connectError.message;
    refresh();
  });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    refresh,
  };
};
