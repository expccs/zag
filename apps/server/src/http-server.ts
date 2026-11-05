import { createServer, type Server as HttpServer } from 'node:http';

export interface HealthReport {
  ok: boolean;
  version: string;
  uptimeS: number;
  clients: number;
}

export interface HttpServerOptions {
  health: () => HealthReport;
}

export const createHttpServer = (options: HttpServerOptions): HttpServer =>
  createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(options.health()));
      return;
    }
    response.writeHead(404).end();
  });
