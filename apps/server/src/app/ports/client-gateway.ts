import type { PublicState } from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';

/**
 * Driven port: the connected PWA clients as one audience. Implemented by
 * `infrastructure/socket` (`ZagSocketServer`); tests use an in-memory
 * fake.
 */
export interface ClientGateway {
  readonly clientsCount: number;
  broadcastState(state: PublicState): void;
  close(): void;
}

export const CLIENT_GATEWAY: InjectionToken<ClientGateway> =
  Symbol('ClientGateway');
