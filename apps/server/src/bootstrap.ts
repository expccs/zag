import 'reflect-metadata';
import type { Server as HttpServer } from 'node:http';
import {
  Lifecycle,
  container as rootContainer,
  instanceCachingFactory,
  type DependencyContainer,
} from 'tsyringe';
import { ZagAppState } from './app/domain/app-state';
import { APP_INFO } from './app/ports/app-info';
import { CLIENT_GATEWAY } from './app/ports/client-gateway';
import { CLOUD_GATEWAY } from './app/ports/cloud-gateway';
import { LOGGER, type Logger } from './app/ports/logger';
import { HealthService } from './app/services/health-service';
import { StateSyncService } from './app/services/state-sync-service';
import { CloudGatewayFactory } from './infrastructure/ccs/cloud-gateway-factory';
import {
  ConfigLoader,
  SERVER_CONFIG,
  type ServerConfig,
} from './infrastructure/config/config';
import {
  HTTP_SERVER,
  HealthHttpServer,
} from './infrastructure/http/health-http-server';
import { StructuredLogger } from './infrastructure/logging/structured-logger';
import { ZagSocketServer } from './infrastructure/socket/socket-server';

const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Composition root. Builds the dependency graph in a tsyringe child
 * container and drives the lifecycle. Nothing else in the server knows
 * about concrete adapters: `app/` sees only its ports (and the tsyringe
 * decorators), `infrastructure/` implements them, and this file joins
 * the two. Every injected parameter carries an explicit `@inject(token)`,
 * so no `emitDecoratorMetadata` is needed (tsx / esbuild do not emit it).
 */
export class Application {
  private readonly container: DependencyContainer;
  private readonly logger: Logger;

  constructor(container: DependencyContainer) {
    this.container = container;
    this.logger = container.resolve(LOGGER);
  }

  get httpServer(): HttpServer {
    return this.container.resolve(HTTP_SERVER);
  }

  start(): void {
    const { container } = this;
    const config = container.resolve(SERVER_CONFIG);
    const { version } = container.resolve(APP_INFO);
    this.httpServer.listen(config.port, () => {
      this.logger.info('listening', {
        port: config.port,
        version,
        allowedOrigins: config.allowedOrigins,
        ccsMode: config.cloud.mode,
      });
    });
    container.resolve(StateSyncService).start();
  }

  stop(signal: string): void {
    const { container } = this;
    this.logger.info('shutting down', { signal });
    container.resolve(StateSyncService).stop();
    container.resolve(CLIENT_GATEWAY).close();
    this.httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  }

  /**
   * The production graph in a fresh child container (one per process or
   * per test). Everything is a lazy singleton of that container; a test
   * re-registers a token with a fake before the first `resolve`.
   */
  static createContainer(
    config: ServerConfig,
    logger: Logger,
    version: string,
  ): DependencyContainer {
    const scoped = { lifecycle: Lifecycle.ContainerScoped };
    const container = rootContainer.createChildContainer();
    container.register(SERVER_CONFIG, { useValue: config });
    container.register(LOGGER, { useValue: logger });
    container.register(APP_INFO, {
      useValue: { version, ccsMode: config.cloud.mode },
    });
    container.register(CLOUD_GATEWAY, {
      useFactory: instanceCachingFactory(Application.provideCloud),
    });
    container.register(ZagAppState, {
      useFactory: instanceCachingFactory(Application.provideState),
    });
    container.register(HTTP_SERVER, {
      useFactory: instanceCachingFactory(Application.provideHttpServer),
    });
    container.register(CLIENT_GATEWAY, {
      useFactory: instanceCachingFactory(Application.provideClients),
    });
    container.register(HealthService, { useClass: HealthService }, scoped);
    container.register(
      StateSyncService,
      { useClass: StateSyncService },
      scoped,
    );
    return container;
  }

  static main(): void {
    const config = ConfigLoader.load();
    const logger = new StructuredLogger({
      pretty: process.env.NODE_ENV !== 'production',
    });
    const version = process.env.APP_VERSION ?? 'dev';
    const container = Application.createContainer(config, logger, version);
    const app = new Application(container);
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

  private static provideCloud(container: DependencyContainer) {
    const config = container.resolve(SERVER_CONFIG);
    const logger = container.resolve(LOGGER).child({ module: 'ccs' });
    const offline = CloudGatewayFactory.createOfflineGroup(config.state);
    return CloudGatewayFactory.create(config.cloud, logger, [offline]);
  }

  private static provideState(container: DependencyContainer) {
    const config = container.resolve(SERVER_CONFIG);
    const logger = container.resolve(LOGGER);
    return new ZagAppState({
      ...config.state,
      logger: logger.child({ module: 'state' }),
    });
  }

  // `/health` resolves the report lazily per request: the health service
  // needs the socket server, which needs this http server.
  private static provideHttpServer(container: DependencyContainer) {
    return HealthHttpServer.create({
      health: () => container.resolve(HealthService).report(),
    });
  }

  private static provideClients(container: DependencyContainer) {
    const config = container.resolve(SERVER_CONFIG);
    const state = container.resolve(ZagAppState);
    return new ZagSocketServer(container.resolve(HTTP_SERVER), {
      allowedOrigins: config.allowedOrigins,
      trustProxy: config.trustProxy,
      logger: container.resolve(LOGGER),
      state: () => state.publicState,
    });
  }
}

if (require.main === module) Application.main();
