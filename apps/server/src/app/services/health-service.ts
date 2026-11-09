import type { PublicState } from '@zag/protocol';
import { inject, injectable } from 'tsyringe';
import { ZagAppState } from '../domain/app-state';
import { SessionService, type SessionSummary } from './session-service';
import { APP_INFO, type AppInfo } from '../ports/app-info';
import { CLIENT_GATEWAY, type ClientGateway } from '../ports/client-gateway';
import { CLOUD_GATEWAY, type CloudGateway } from '../ports/cloud-gateway';
import { FACADE_GATEWAY, type FacadeGateway } from '../ports/facade-gateway';

export interface CloudHealth {
  mode: string;
  connected: boolean;
  projectUID: string | null;
}

export interface FacadeHealth {
  connected: boolean;
  /** Touch events dropped while the renderer was unreachable. */
  dropped: number;
}

export interface HealthReport {
  ok: boolean;
  version: string;
  uptimeS: number;
  clients: number;
  ccs: CloudHealth;
  state: PublicState;
  sessions: SessionSummary;
  facade: FacadeHealth;
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
    @inject(SessionService) private readonly sessions: SessionService,
    @inject(FACADE_GATEWAY) private readonly facade: FacadeGateway,
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
      sessions: this.sessions.summary,
      facade: {
        connected: this.facade.isConnected,
        dropped: this.facade.droppedCount,
      },
    };
  }
}
