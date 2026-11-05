import { loadConfig } from './config';
import { createHttpServer } from './http-server';
import { createLogger } from './logger';
import { createSocketServer, type ZagServer } from './socket-server';

const SHUTDOWN_TIMEOUT_MS = 5_000;

const main = (): void => {
  const config = loadConfig();
  const logger = createLogger({
    pretty: process.env.NODE_ENV !== 'production',
  });
  const version = process.env.APP_VERSION ?? 'dev';
  const startedAt = Date.now();

  let io: ZagServer | null = null;
  const httpServer = createHttpServer({
    health: () => ({
      ok: true,
      version,
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      clients: io?.engine.clientsCount ?? 0,
    }),
  });
  io = createSocketServer(httpServer, {
    allowedOrigins: config.allowedOrigins,
    trustProxy: config.trustProxy,
    logger,
  });

  httpServer.listen(config.port, () => {
    logger.info('listening', {
      port: config.port,
      version,
      allowedOrigins: config.allowedOrigins,
    });
  });

  const shutdown = (signal: string) => {
    logger.info('shutting down', { signal });
    io?.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { reason });
  });
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error });
    process.exit(1);
  });
};

main();
