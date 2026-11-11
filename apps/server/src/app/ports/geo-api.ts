import type { GeoCheckResult, GeoSample } from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';

/**
 * Driving port: the location restriction as a client transport sees it.
 * Implemented by `app/services/geo-service.ts`.
 */
export interface GeoApi {
  /** Judges a position of the user and remembers the verdict. */
  check(userId: string, sample: GeoSample): GeoCheckResult;
  /** `true` when the restriction is off or the user's last check passed. */
  isAllowed(userId: string): boolean;
  /** First live connection of the user: the sample timer starts. */
  userConnected(userId: string): void;
  /** Last connection dropped: timer and verdict are forgotten. */
  userDisconnected(userId: string): void;
}

export const GEO_API: InjectionToken<GeoApi> = Symbol('GeoApi');
