import type { CloudGateway, GeoCoordinates } from './cloud-client';

export interface GeoSample extends GeoCoordinates {
  accuracy?: number;
}

export type GeoReason = 'ok' | 'too-far' | 'no-center' | 'invalid';

export interface GeoCheck {
  allowed: boolean;
  distanceM: number;
  reason: GeoReason;
}

export interface GeoFenceOptions {
  radiusM: number;
  accuracyToleranceM?: number;
  center?: GeoCoordinates;
}

const EARTH_RADIUS_M = 6_371_008.8;
const UNKNOWN_DISTANCE = -1;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const isValidCoordinates = (point: GeoCoordinates): boolean =>
  Number.isFinite(point.latitude) &&
  Number.isFinite(point.longitude) &&
  Math.abs(point.latitude) <= 90 &&
  Math.abs(point.longitude) <= 180;

export const haversineDistanceM = (
  from: GeoCoordinates,
  to: GeoCoordinates,
): number => {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

export class GeoFence {
  private center: GeoCoordinates | null;
  private readonly centerLocked: boolean;
  private readonly radiusM: number;
  private readonly accuracyToleranceM: number;

  constructor(options: GeoFenceOptions) {
    this.center = options.center ?? null;
    this.centerLocked = options.center !== undefined;
    this.radiusM = options.radiusM;
    this.accuracyToleranceM = options.accuracyToleranceM ?? 0;
  }

  get hasCenter(): boolean {
    return this.center !== null;
  }

  setCenter(point: GeoCoordinates): void {
    if (this.centerLocked) return;
    if (!isValidCoordinates(point)) {
      throw new Error('GeoFence center has invalid coordinates');
    }
    this.center = { latitude: point.latitude, longitude: point.longitude };
  }

  bind(cloud: CloudGateway): this {
    cloud.on('login', (data) => {
      this.setCenter(data);
    });
    return this;
  }

  check(sample: GeoSample): GeoCheck {
    if (!isValidCoordinates(sample)) {
      return { allowed: false, distanceM: UNKNOWN_DISTANCE, reason: 'invalid' };
    }
    if (!this.center) {
      return {
        allowed: false,
        distanceM: UNKNOWN_DISTANCE,
        reason: 'no-center',
      };
    }
    const distanceM = Math.round(haversineDistanceM(this.center, sample));
    const accuracy = sample.accuracy ?? 0;
    const tolerance = Math.min(Math.max(accuracy, 0), this.accuracyToleranceM);
    const allowed = distanceM <= this.radiusM + tolerance;
    return { allowed, distanceM, reason: allowed ? 'ok' : 'too-far' };
  }
}
