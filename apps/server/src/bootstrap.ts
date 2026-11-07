import type { Server as HttpServer } from 'node:http';
import { ZAG_FLAGS, type PublicState, type ZagFlag } from '@zag/protocol';
import { ZagAppState } from './app-state';
import {
  CloudGatewayFactory,
  type CloudGateway,
  type ProgramGroup,
} from './cloud-client';
import { ConfigLoader, type ServerConfig, type StateConfig } from './config';
import { HealthHttpServer, type HealthReport } from './http-server';
import { StructuredLogger, type Logger } from './logger';
import { ZagSocketServer } from './socket-server';

const SHUTDOWN_TIMEOUT_MS = 5_000;

/** Composition root: wires config, CCS, app state, http and Socket.IO. */
export class Application {
  private readonly config: ServerConfig;
  private readonly logger: Logger;
  private readonly cloudLogger: Logger;
  private readonly stateLogger: Logger;
  private readonly cloud: CloudGateway;
  private readonly state: ZagAppState;
  private readonly httpServer: HttpServer;
  private readonly sockets: ZagSocketServer;
  private readonly version: string;
  private readonly startedAt = Date.now();

  constructor(config: ServerConfig, logger: Logger, version: string) {
    this.config = config;
    this.logger = logger;
    this.version = version;
    this.cloudLogger = logger.child({ module: 'ccs' });
    this.stateLogger = logger.child({ module: 'state' });

    const offlineGroups = [Application.offlineStateGroup(config.state)];
    this.cloud = CloudGatewayFactory.create(
      config.cloud,
      this.cloudLogger,
      offlineGroups,
    );
    this.state = new ZagAppState({
      ...config.state,
      logger: this.stateLogger,
    }).bind(this.cloud);
    this.httpServer = HealthHttpServer.create({ health: () => this.health() });
    this.sockets = new ZagSocketServer(this.httpServer, {
      allowedOrigins: config.allowedOrigins,
      trustProxy: config.trustProxy,
      logger,
      state: () => this.publicState,
    });
    this.wire();
  }

  get publicState(): PublicState {
    return this.state.publicState;
  }

  start(): void {
    const { config } = this;
    this.httpServer.listen(config.port, () => {
      this.logger.info('listening', {
        port: config.port,
        version: this.version,
        allowedOrigins: config.allowedOrigins,
        ccsMode: config.cloud.mode,
      });
    });
    // The server serves clients right away; CCS is joined in the background
    // with login retries, so a CCS outage never blocks startup.
    this.cloud
      .connect()
      .then(() => this.syncState())
      .catch((error: Error) => {
        this.cloudLogger.error('ccs connect failed', { error });
      });
  }

  stop(signal: string): void {
    this.logger.info('shutting down', { signal });
    this.cloud.close();
    this.sockets.close();
    this.httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  }

  static main(): void {
    const config = ConfigLoader.load();
    const logger = new StructuredLogger({
      pretty: process.env.NODE_ENV !== 'production',
    });
    const version = process.env.APP_VERSION ?? 'dev';
    const app = new Application(config, logger, version);
    app.start();

    process.on('SIGINT', () => app.stop('SIGINT'));
    process.on('SIGTERM', () => app.stop('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
      logger.error('unhandled rejection', { reason });
    });
    process.on('uncaughtException', (error) => {
      logger.error('uncaught exception', { error });
      process.exit(1);
    });
  }

  // Offline: the fake CCS owns a state group built from the config so that
  // sync works and the app is "synced" with the OFFLINE_INITIAL flags.
  private static offlineStateGroup(state: StateConfig): ProgramGroup {
    return {
      _id: state.groupID,
      name: 'offline app state',
      projectID: 'offline-project',
      main: false,
      programs: ZAG_FLAGS.map((flag) => ({
        _id: state.programs[flag],
        name: flag,
        type: 'SWITCH',
        state: { value: state.initial[flag] ? 1 : 0 },
      })),
    };
  }

  private wire(): void {
    const { cloud, cloudLogger } = this;
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
      // Missed `programStateChange` events are recovered by a full resync.
      this.syncState();
    });
    cloud.on('stateChange', (change) => {
      cloudLogger.info('ccs program state', {
        programID: change.programID,
        value: change.value,
      });
    });

    this.state.on('synced', () => this.publishState('synced', []));
    this.state.on('change', (_flags, changed) => {
      this.publishState('change', changed);
    });
  }

  private health(): HealthReport {
    const { cloud, config } = this;
    return {
      ok: true,
      version: this.version,
      uptimeS: Math.round((Date.now() - this.startedAt) / 1000),
      clients: this.sockets.clientsCount,
      ccs: {
        mode: config.cloud.mode,
        connected: cloud.isConnected,
        projectUID: cloud.projectUID,
      },
      state: this.publicState,
    };
  }

  private publishState(reason: string, changed: ZagFlag[]): void {
    const state = this.publicState;
    this.stateLogger.info('state update', { reason, changed, ...state });
    this.sockets.broadcastState(state);
  }

  private syncState(): void {
    this.cloud
      .getPrograms()
      .then((groups) => this.state.sync(groups))
      .catch((error: Error) => {
        this.stateLogger.error('state sync failed', { error });
      });
  }
}

Application.main();
