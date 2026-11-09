import type { FacadeGateway } from '../../app/ports/facade-gateway';
import type { Logger } from '../../app/ports/logger';
import { OfflineFacade } from './offline-facade';
import { TouchDesignerClient } from './touch-designer-client';

export interface FacadeConfig {
  /** `TD_WS_URL`; `null` disables the renderer. */
  url: string | null;
  pingIntervalMs: number;
}

/** Picks the facade gateway: TouchDesigner when a URL is set, else offline. */
export class FacadeGatewayFactory {
  static create(config: FacadeConfig, logger: Logger): FacadeGateway {
    const { url, pingIntervalMs } = config;
    if (!url) return new OfflineFacade(logger);
    return new TouchDesignerClient({ url, pingIntervalMs, logger });
  }
}
