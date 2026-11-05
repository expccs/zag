import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { io } from 'socket.io-client';
import { createConnectionStore } from './connection-store';
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
  const store = createConnectionStore(socket);
  return { socket, store };
};

export const SocketProvider = ({
  url = import.meta.env.VITE_SOCKET_URL ?? '',
  autoConnect = false,
  children,
}: SocketProviderProps) => {
  const [{ socket, store }] = useState(() => createConnection(url));
  const { status, error } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  useEffect(() => {
    if (autoConnect) {
      socket.connect();
      store.refresh();
    }
    return () => {
      if (autoConnect) socket.disconnect();
    };
  }, [socket, store, autoConnect]);

  const value = useMemo<SocketContextValue>(
    () => ({
      socket,
      status,
      error,
      connect: () => {
        socket.connect();
        store.refresh();
      },
      disconnect: () => {
        socket.disconnect();
        store.refresh();
      },
    }),
    [socket, store, status, error],
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};
