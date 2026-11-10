import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';
import {
  AUTH_ERROR,
  SESSION_PATH,
  isValidUserId,
  type SessionSnapshot,
} from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';
import type { HealthReport } from '../../app/services/health-service';

export const HTTP_SERVER: InjectionToken<HttpServer> = Symbol('HttpServer');

export interface HttpServerOptions {
  health: () => HealthReport;
  /** The user's turn as the queue holds it; `null` when there is none. */
  session: (userId: string) => SessionSnapshot | null;
  /** Origins that may read the API from another host (dev server). */
  allowedOrigins: string[];
}

/**
 * Plain `node:http` server, also the host of Socket.IO. Two routes:
 * `GET /health` (monitoring) and `GET /session/:userId` (shared-modules.md
 * § 4): a phone that reloaded the page asks whether its turn is still in
 * the queue before the socket is up. Everything else is 404.
 */
export class HttpApiServer {
  static create(options: HttpServerOptions): HttpServer {
    return createServer((request, response) => {
      HttpApiServer.handle(options, request, response);
    });
  }

  private static handle(
    options: HttpServerOptions,
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    HttpApiServer.allowOrigin(options.allowedOrigins, request, response);
    const path = (request.url ?? '/').split('?')[0];
    if (request.method !== 'GET') {
      response.writeHead(405).end();
      return;
    }
    if (path === '/health') {
      HttpApiServer.json(response, 200, options.health());
      return;
    }
    if (path.startsWith(`${SESSION_PATH}/`)) {
      const userId = decodeURIComponent(path.slice(SESSION_PATH.length + 1));
      if (!isValidUserId(userId)) {
        HttpApiServer.json(response, 400, { error: AUTH_ERROR });
        return;
      }
      const turn = options.session(userId);
      if (!turn) {
        HttpApiServer.json(response, 404, { error: 'ENOTFOUND' });
        return;
      }
      HttpApiServer.json(response, 200, turn);
      return;
    }
    response.writeHead(404).end();
  }

  private static json(
    response: ServerResponse,
    status: number,
    body: unknown,
  ): void {
    response.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
  }

  // Same list as Socket.IO's `cors.origin`: the Vite dev server on another
  // port reads the API cross-origin; in production nginx serves both.
  private static allowOrigin(
    allowed: string[],
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    const { origin } = request.headers;
    if (!origin || !allowed.includes(origin)) return;
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('vary', 'origin');
  }
}
