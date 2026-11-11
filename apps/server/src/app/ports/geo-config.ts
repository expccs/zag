import type { InjectionToken } from 'tsyringe';
import type { GeoCoordinates } from './cloud-gateway';

/** Geo-fence settings: `GEO_RADIUS_M`, `GEO_ACCURACY_TOLERANCE_M`, … */
export interface GeoConfig {
  /** Radius of the zone around the facade. */
  radiusM: number;
  /** Most the GPS `accuracy` may widen the zone by. */
  accuracyToleranceM: number;
  /** `GEO_CENTER`: fixes the centre; `null` takes it from the CCS login. */
  center: GeoCoordinates | null;
  /**
   * A phone that sends no `geo:check` this long after connecting (while
   * the restriction is on) is told `missing`.
   */
  sampleTimeoutMs: number;
}

export const GEO_CONFIG: InjectionToken<GeoConfig> = Symbol('GeoConfig');
