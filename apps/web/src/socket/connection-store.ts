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

/**
 * External store over socket.io-client flags for useSyncExternalStore.
 * Status rules: connected → 'connected'; reconnecting after a successful
 * connection → 'offline' («Зв'язок втрачено»); first attempt in progress
 * → 'connecting'; nothing in flight → 'idle'.
 */
export const createConnectionStore = (socket: ZagSocket): ConnectionStore => {
  const listeners = new Set<() => void>();
  let everConnected = false;
  let error: string | null = null;
  let snapshot: ConnectionSnapshot = { status: 'idle', error };

  const computeStatus = (): ConnectionStatus => {
    if (socket.connected) return 'connected';
    if (!socket.active) return 'idle';
    return everConnected ? 'offline' : 'connecting';
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
  socket.on('disconnect', refresh);
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
