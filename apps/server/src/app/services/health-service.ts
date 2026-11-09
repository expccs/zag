import type { PublicState } from '@zag/protocol';
import { inject, injectable } from 'tsyringe';
import { ZagAppState } from '../domain/app-state';
import { APP_INFO, type AppInfo } from '../ports/app-info';
import { CLIENT_GATEWAY, type ClientGateway } from '../ports/client-gateway';
import { CLOUD_GATEWAY, type CloudGateway } from '../ports/cloud-gateway';

export interface CloudHealth {
  mode: string;
  connected: boolean;
  projectUID: string | null;
}

export interface HealthReport {
  ok: boolean;
  version: string;
  uptimeS: number;
  clients: number;
  ccs: CloudHealth;
  state: PublicState;
}

/** Use case: the `/health` report for Docker and the deploy smoke check. */
@injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    @inject(APP_INFO) private readonly info: AppInfo,
    @inject(CLOUD_GATEWAY) private readonly cloud: CloudGateway,
    @inject(CLIENT_GATEWAY) private readonly clients: ClientGateway,
    @inject(ZagAppState) private readonly state: ZagAppState,
  ) {}

  report(): HealthReport {
    const { cloud, info } = this;
    return {
      ok: true,
      version: info.version,
      uptimeS: Math.round((Date.now() - this.startedAt) / 1000),
      clients: this.clients.clientsCount,
      ccs: {
        mode: info.ccsMode,
        connected: cloud.isConnected,
        projectUID: cloud.projectUID,
      },
      state: this.state.publicState,
    };
  }
}
