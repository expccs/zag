import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Application } from './application';
import { loadConfig } from './config';
import { attachSocketApi } from './socket-api';

const main = (): void => {
  const config = loadConfig();
  const app = new Application(config);
  const httpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, state: app.publicState }));
      return;
    }
    response.writeHead(404).end();
  });
  const io = new Server(httpServer, {
    transports: ['websocket'],
    cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [] },
  });

  attachSocketApi(io, app, {
    disconnectGraceMs: config.queue.disconnectGraceMs,
  });
  app.start();
  httpServer.listen(config.port, () => {
    console.log(`[zag] listening on :${config.port}, ccs=${config.cloud.mode}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[zag] ${signal}, shutting down`);
    io.close();
    httpServer.close();
    app.stop().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[zag] unhandled rejection', reason);
  });
  process.on('uncaughtException', (error) => {
    console.error('[zag] uncaught exception', error);
    process.exit(1);
  });
};

main();
