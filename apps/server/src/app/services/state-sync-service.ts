import type { PublicState, ZagFlag } from '@zag/protocol';
import { inject, injectable } from 'tsyringe';
import { ZagAppState } from '../domain/app-state';
import { CLIENT_GATEWAY, type ClientGateway } from '../ports/client-gateway';
import { CLOUD_GATEWAY, type CloudGateway } from '../ports/cloud-gateway';
import { LOGGER, type Logger } from '../ports/logger';

/**
 * Use case: keep the app state in step with CCS and the clients in step
 * with the app state. CCS is joined in the background with login retries,
 * so a CCS outage never blocks serving clients. On **every** `connect`
 * event (first login, socket.io auto-reconnect, manual re-login after a
 * server-side disconnect or a rejected token) the «App state» group is
 * read with `getPrograms` and applied, because `programStateChange`
 * events missed while offline are not replayed.
 */
@injectable()
export class StateSyncService {
  private readonly cloudLogger: Logger;
  private readonly stateLogger: Logger;
  private started = false;
  private published: PublicState | null = null;

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
    void this.connect();
  }

  stop(): void {
    this.cloud.close();
  }

  /** Reads the program groups from CCS and applies the state group. */
  async sync(): Promise<void> {
    this.stateLogger.info('state sync', { groupID: this.state.groupID });
    try {
      const groups = await this.cloud.getPrograms();
      this.state.sync(groups);
    } catch (error) {
      this.stateLogger.error('state sync failed', { error });
    }
  }

  private async connect(): Promise<void> {
    try {
      await this.cloud.connect();
    } catch (error) {
      this.cloudLogger.error('ccs connect failed', { error });
    }
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
    cloud.on('connect', () => {
      cloudLogger.info('ccs connected');
      void this.sync();
    });
    cloud.on('disconnect', (reason) => {
      cloudLogger.warn('ccs disconnected', { reason });
    });
    // Manager-level event; the socket `connect` that follows does the sync.
    cloud.on('reconnect', (attempt) => {
      cloudLogger.info('ccs reconnected', { attempt });
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

  // A resync that found nothing new emits `synced` again; clients only
  // hear about actual differences.
  private publish(reason: string, changed: ZagFlag[]): void {
    const state = this.state.publicState;
    if (StateSyncService.isSame(this.published, state)) return;
    this.published = state;
    this.stateLogger.info('state update', { reason, changed, ...state });
    this.clients.broadcastState(state);
  }

  private static isSame(a: PublicState | null, b: PublicState): boolean {
    if (a === null) return false;
    if (a.screen !== b.screen || a.synced !== b.synced) return false;
    const flags = Object.keys(b.flags) as ZagFlag[];
    return flags.every((flag) => a.flags[flag] === b.flags[flag]);
  }
}
