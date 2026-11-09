import type { ZagFlag } from '@zag/protocol';
import { inject, injectable } from 'tsyringe';
import { ZagAppState } from '../domain/app-state';
import { CLIENT_GATEWAY, type ClientGateway } from '../ports/client-gateway';
import { CLOUD_GATEWAY, type CloudGateway } from '../ports/cloud-gateway';
import { LOGGER, type Logger } from '../ports/logger';

/**
 * Use case: keep the app state in step with CCS and the clients in step
 * with the app state. CCS is joined in the background with login retries,
 * so a CCS outage never blocks serving clients; every (re)connect does a
 * full `getPrograms` resync because `programStateChange` events missed
 * while offline are not replayed.
 */
@injectable()
export class StateSyncService {
  private readonly cloudLogger: Logger;
  private readonly stateLogger: Logger;
  private started = false;

  constructor(
    @inject(CLOUD_GATEWAY) private readonly cloud: CloudGateway,
    @inject(ZagAppState) private readonly state: ZagAppState,
    @inject(CLIENT_GATEWAY) private readonly clients: ClientGateway,
    @inject(LOGGER) logger: Logger,
  ) {
    this.cloudLogger = logger.child({ module: 'ccs' });
    this.stateLogger = logger.child({ module: 'state' });
  }

  start(): void {
    if (this.started) throw new Error('StateSyncService already started');
    this.started = true;
    this.wire();
    this.cloud
      .connect()
      .then(() => this.sync())
      .catch((error: Error) => {
        this.cloudLogger.error('ccs connect failed', { error });
      });
  }

  stop(): void {
    this.cloud.close();
  }

  /** Pulls the program groups from CCS and applies them to the state. */
  sync(): Promise<void> {
    return this.cloud
      .getPrograms()
      .then((groups) => this.state.sync(groups))
      .catch((error: Error) => {
        this.stateLogger.error('state sync failed', { error });
      });
  }

  private wire(): void {
    const { cloud, cloudLogger, state } = this;
    state.bind(cloud);
    cloud.on('login', (data) => {
      cloudLogger.info('ccs login', {
        projectUID: data.projectUID,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
      });
    });
    cloud.on('connect', () => cloudLogger.info('ccs connected'));
    cloud.on('disconnect', (reason) => {
      cloudLogger.warn('ccs disconnected', { reason });
    });
    cloud.on('reconnect', (attempt) => {
      cloudLogger.info('ccs reconnected', { attempt });
      this.sync();
    });
    cloud.on('stateChange', (change) => {
      cloudLogger.info('ccs program state', {
        programID: change.programID,
        value: change.value,
      });
    });

    state.on('synced', () => this.publish('synced', []));
    state.on('change', (_flags, changed) => this.publish('change', changed));
  }

  private publish(reason: string, changed: ZagFlag[]): void {
    const state = this.state.publicState;
    this.stateLogger.info('state update', { reason, changed, ...state });
    this.clients.broadcastState(state);
  }
}
