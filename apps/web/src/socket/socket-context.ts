import { createContext } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  PublicState,
  ServerToClientEvents,
} from '@zag/protocol';
import type { GeoStore } from './geo-store';
import type { SessionStore } from './session-store';

export type ZagSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'offline';

export interface SocketContextValue {
  socket: ZagSocket;
  status: ConnectionStatus;
  /** Last connect_error message (e.g. 'EAUTH'); null once connected. */
  error: string | null;
  /** Latest `state:update` from the server; null until the first one. */
  state: PublicState | null;
  /** The user's turn in the queue; read it with `useSession`. */
  session: SessionStore;
  /** The location verdict; read it with `useGeo`. */
  geoStore: GeoStore;
  /** Stable callbacks: safe as effect dependencies. */
  connect: () => void;
  disconnect: () => void;
}

export const SocketContext = createContext<SocketContextValue | null>(null);
