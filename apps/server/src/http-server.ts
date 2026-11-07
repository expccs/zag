import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import type { PublicState } from '@zag/protocol';

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

export interface HttpServerOptions {
  health: () => HealthReport;
}

/** Plain `node:http` server: `/health` only, everything else is 404. */
export class HealthHttpServer {
  static create(options: HttpServerOptions): HttpServer {
    return createServer((request, response) => {
      HealthHttpServer.handle(options, request, response);
    });
  }

  private static handle(
    options: HttpServerOptions,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(options.health()));
      return;
    }
    response.writeHead(404).end();
  }
}
