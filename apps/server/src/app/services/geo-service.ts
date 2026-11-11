import type { GeoCheckResult, GeoSample } from '@zag/protocol';
import { inject, injectable } from 'tsyringe';
import { ZagAppState } from '../domain/app-state';
import { GeoFence } from '../domain/geo-fence';
import { CLIENT_GATEWAY, type ClientGateway } from '../ports/client-gateway';
import { CLOUD_GATEWAY, type CloudGateway } from '../ports/cloud-gateway';
import type { GeoApi } from '../ports/geo-api';
import { GEO_CONFIG, type GeoConfig } from '../ports/geo-config';
import { LOGGER, type Logger } from '../ports/logger';

export interface GeoSummary {
  /** The `locationRestriction` flag. */
  restricted: boolean;
  /** A centre is known (CCS login or `GEO_CENTER`). */
  hasCenter: boolean;
  radiusM: number;
}

const DISABLED: GeoCheckResult = {
  allowed: true,
  distanceM: -1,
  reason: 'disabled',
};

const MISSING: GeoCheckResult = {
  allowed: false,
  distanceM: -1,
  reason: 'missing',
};

/**
 * Use case: the location restriction (shared-modules.md § 1.3). While
 * the `locationRestriction` flag is on, every connected user has to pass
 * a `geo:check`; the verdict of the last sample gates `session:request`.
 * A user who sends nothing within `sampleTimeoutMs` of connecting (or
 * of the flag turning on) is told `missing` through `geo:update` and
 * stays blocked until a sample arrives. With the flag off nothing is
 * checked and every user is allowed.
 */
@injectable()
export class GeoService implements GeoApi {
  private readonly fence: GeoFence;
  private readonly logger: Logger;
  private readonly connected = new Set<string>();
  private readonly verdicts = new Map<string, GeoCheckResult>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @inject(GEO_CONFIG) private readonly config: GeoConfig,
    @inject(ZagAppState) private readonly state: ZagAppState,
    @inject(CLIENT_GATEWAY) private readonly clients: ClientGateway,
    @inject(CLOUD_GATEWAY) cloud: CloudGateway,
    @inject(LOGGER) logger: Logger,
  ) {
    this.logger = logger.child({ module: 'geo' });
    this.fence = new GeoFence(config).bind(cloud);
    this.state.on('change', (_flags, changed) => {
      if (changed.includes('locationRestriction')) this.restrictionChanged();
    });
  }

  get restricted(): boolean {
    return this.state.get('locationRestriction');
  }

  get summary(): GeoSummary {
    return {
      restricted: this.restricted,
      hasCenter: this.fence.hasCenter,
      radiusM: this.config.radiusM,
    };
  }

  check(userId: string, sample: GeoSample): GeoCheckResult {
    if (!this.restricted) return DISABLED;
    this.clearTimer(userId);
    const result = this.fence.check(sample);
    const previous = this.verdicts.get(userId);
    this.verdicts.set(userId, result);
    if (!previous || previous.reason !== result.reason) {
      this.logger.info('geo verdict', { userId, ...result });
    }
    return result;
  }

  isAllowed(userId: string): boolean {
    if (!this.restricted) return true;
    return this.verdicts.get(userId)?.allowed === true;
  }

  userConnected(userId: string): void {
    this.connected.add(userId);
    if (this.restricted && !this.verdicts.has(userId)) this.startTimer(userId);
  }

  userDisconnected(userId: string): void {
    this.connected.delete(userId);
    this.clearTimer(userId);
    this.verdicts.delete(userId);
  }

  /** Drops the timers (shutdown). */
  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // The flag turned on: everyone connected has to send a sample now. Off:
  // nothing is pending any more and the verdicts stop mattering.
  private restrictionChanged(): void {
    const { restricted } = this;
    this.logger.info('location restriction', { restricted });
    this.stop();
    this.verdicts.clear();
    if (!restricted) return;
    for (const userId of this.connected) this.startTimer(userId);
  }

  private startTimer(userId: string): void {
    if (this.timers.has(userId)) return;
    const { sampleTimeoutMs } = this.config;
    const timer = setTimeout(() => {
      this.timers.delete(userId);
      if (!this.restricted || this.verdicts.has(userId)) return;
      this.verdicts.set(userId, MISSING);
      this.logger.info('geo sample missing', { userId, sampleTimeoutMs });
      this.clients.notifyGeo(userId, MISSING);
    }, sampleTimeoutMs);
    this.timers.set(userId, timer);
  }

  private clearTimer(userId: string): void {
    const timer = this.timers.get(userId);
    if (!timer) return;
    clearTimeout(timer);
    this.timers.delete(userId);
  }
}
