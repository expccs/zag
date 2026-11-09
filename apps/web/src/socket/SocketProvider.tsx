import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { io } from 'socket.io-client';
import { createConnectionStore } from './connection-store';
import { createServerStateStore } from './server-state-store';
import { createSessionStore } from './session-store';
import { getUserId } from './user-id';
import { SocketContext, type SocketContextValue } from './socket-context';

export interface SocketProviderProps {
  /** Server origin; empty string means the page's own origin. */
  url?: string;
  /** Connect on mount. Screens that need no server keep this false. */
  autoConnect?: boolean;
  children: ReactNode;
}

const createSocket = (url: string) =>
  io(url || undefined, {
    transports: ['websocket'],
    autoConnect: false,
    auth: { userId: getUserId() },
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });

const createConnection = (url: string) => {
  const socket = createSocket(url);
  const connection = createConnectionStore(socket);
  const serverState = createServerStateStore(socket);
  const session = createSessionStore(socket);
  return { socket, connection, serverState, session };
};

/**
 * One socket for the whole app. Nothing connects by itself: the screen
 * that needs the server (Touch & Create and the interactive flow,
 * shared-modules.md § 6) calls `connect()` on mount and `disconnect()`
 * on unmount; Home and Mission never touch it.
 */
export const SocketProvider = ({
  url = import.meta.env.VITE_SOCKET_URL ?? '',
  autoConnect = false,
  children,
}: SocketProviderProps) => {
  const [{ socket, connection, serverState, session }] = useState(() =>
    createConnection(url),
  );
  const { status, error } = useSyncExternalStore(
    connection.subscribe,
    connection.getSnapshot,
  );
  const state = useSyncExternalStore(
    serverState.subscribe,
    serverState.getSnapshot,
  );

  const connect = useCallback(() => {
    socket.connect();
    connection.refresh();
  }, [socket, connection]);

  const disconnect = useCallback(() => {
    socket.disconnect();
    connection.refresh();
  }, [socket, connection]);

  useEffect(() => {
    if (autoConnect) connect();
    return autoConnect ? disconnect : undefined;
  }, [autoConnect, connect, disconnect]);

  const value = useMemo<SocketContextValue>(
    () => ({ socket, status, error, state, session, connect, disconnect }),
    [socket, status, error, state, session, connect, disconnect],
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
