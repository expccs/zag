import type {
  GeoCheckResult,
  PublicState,
  QueuePlace,
  SessionEnd,
  SessionInfo,
} from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';

/**
 * Driven port: the connected PWA clients. `broadcastState` goes to every
 * socket; the `notify*` calls reach all sockets of one `userId` (a user
 * may have several tabs). Implemented by `infrastructure/socket`
 * (`ZagSocketServer`); tests use an in-memory fake.
 */
export interface ClientGateway {
  readonly clientsCount: number;
  broadcastState(state: PublicState): void;
  notifyQueue(userId: string, place: QueuePlace): void;
  notifySessionStart(userId: string, info: SessionInfo): void;
  notifySessionEnd(userId: string, end: SessionEnd): void;
  /** A verdict the user did not ask for: sample timeout (`missing`). */
  notifyGeo(userId: string, result: GeoCheckResult): void;
  close(): void;
}

export const CLIENT_GATEWAY: InjectionToken<ClientGateway> =
  Symbol('ClientGateway');
