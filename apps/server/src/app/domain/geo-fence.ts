import type { GeoCheckResult, GeoSample } from '@zag/protocol';
import type { CloudGateway, GeoCoordinates } from '../ports/cloud-gateway';

export interface GeoFenceOptions {
  radiusM: number;
  accuracyToleranceM?: number;
  /** A fixed centre; it also locks out the CCS login coordinates. */
  center?: GeoCoordinates | null;
}

const EARTH_RADIUS_M = 6_371_008.8;
const UNKNOWN_DISTANCE = -1;

/**
 * Distance check against the facade (shared-modules.md § 1.3). The
 * centre comes from the CCS login (`bind`) unless fixed by the options;
 * the GPS `accuracy` of a sample widens the radius, capped by
 * `accuracyToleranceM`, so a phone standing at the edge of the zone with
 * a 20 m fix still passes.
 */
export class GeoFence {
  private center: GeoCoordinates | null;
  private readonly centerLocked: boolean;
  private readonly radiusM: number;
  private readonly accuracyToleranceM: number;

  constructor(options: GeoFenceOptions) {
    this.center = options.center ?? null;
    this.centerLocked = this.center !== null;
    this.radiusM = options.radiusM;
    this.accuracyToleranceM = options.accuracyToleranceM ?? 0;
  }

  get hasCenter(): boolean {
    return this.center !== null;
  }

  static isValidCoordinates(point: GeoCoordinates): boolean {
    return (
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180
    );
  }

  /** Great-circle distance (haversine); within 0.3 % of `geopoint`. */
  static haversineDistanceM(from: GeoCoordinates, to: GeoCoordinates): number {
    const dLat = GeoFence.toRadians(to.latitude - from.latitude);
    const dLon = GeoFence.toRadians(to.longitude - from.longitude);
    const lat1 = GeoFence.toRadians(from.latitude);
    const lat2 = GeoFence.toRadians(to.latitude);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h =
      sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  private static toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /** Ignored while the centre is locked by the options. */
  setCenter(point: GeoCoordinates): void {
    if (this.centerLocked) return;
    if (!GeoFence.isValidCoordinates(point)) {
      throw new Error('GeoFence center has invalid coordinates');
    }
    this.center = { latitude: point.latitude, longitude: point.longitude };
  }

  /** Takes the centre from the CCS login, past or future. */
  bind(cloud: CloudGateway): this {
    if (cloud.location && GeoFence.isValidCoordinates(cloud.location)) {
      this.setCenter(cloud.location);
    }
    cloud.on('login', (data) => {
      this.setCenter(data);
    });
    return this;
  }

  check(sample: GeoSample): GeoCheckResult {
    if (!GeoFence.isValidCoordinates(sample)) {
      return { allowed: false, distanceM: UNKNOWN_DISTANCE, reason: 'invalid' };
    }
    if (!this.center) {
      return {
        allowed: false,
        distanceM: UNKNOWN_DISTANCE,
        reason: 'no-center',
      };
    }
    const distanceM = Math.round(
      GeoFence.haversineDistanceM(this.center, sample),
    );
    const accuracy = sample.accuracy ?? 0;
    const tolerance = Math.min(Math.max(accuracy, 0), this.accuracyToleranceM);
    const allowed = distanceM <= this.radiusM + tolerance;
    return { allowed, distanceM, reason: allowed ? 'ok' : 'too-far' };
  }
}
