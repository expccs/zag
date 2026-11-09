import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { WebSocketServer } from 'ws';
import { StructuredLogger } from '../logging/structured-logger';
import { FacadeGatewayFactory } from './facade-gateway-factory';
import { OfflineFacade } from './offline-facade';
import { TouchDesignerClient } from './touch-designer-client';

interface Received {
  type: string;
  timestamp?: string;
  x?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const once = (emitter: TouchDesignerClient, event: 'open' | 'close') =>
  new Promise<void>((resolve) => {
    emitter.once(event, () => resolve());
  });

class FakeTouchDesigner {
  readonly received: Received[] = [];
  private readonly server: WebSocketServer;

  constructor() {
    this.server = new WebSocketServer({ port: 0 });
    this.server.on('connection', (socket) => {
      socket.on('message', (raw) => {
        this.received.push(JSON.parse(raw.toString()) as Received);
      });
    });
  }

  get url(): string {
    const { port } = this.server.address() as AddressInfo;
    return `ws://127.0.0.1:${port}`;
  }

  listening(): Promise<void> {
    return new Promise((resolve) => {
      this.server.once('listening', () => resolve());
    });
  }

  close(): Promise<void> {
    for (const client of this.server.clients) client.terminate();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

const logger = new StructuredLogger({ write: () => {} });

const TOUCH = {
  type: 'touch:event' as const,
  sessionId: 's1',
  x: 0.5,
  y: 0.5,
  touch: 1 as const,
  swipe: 0 as const,
  direction: 'none' as const,
};

describe('TouchDesignerClient', () => {
  it('buffers commands until open, drops the stream, reconnects', async () => {
    const td = new FakeTouchDesigner();
    await td.listening();
    const client = new TouchDesignerClient({
      url: td.url,
      logger,
      reconnectBaseMs: 30,
      reconnectMaxMs: 120,
      pingIntervalMs: 50,
    });
    client.command({ type: 'drain' });
    assert.equal(client.stream(TOUCH), false);
    assert.equal(client.droppedCount, 1);
    assert.equal(client.isConnected, false);

    client.connect();
    await once(client, 'open');
    assert.equal(client.isConnected, true);
    assert.equal(client.stream(TOUCH), true);
    await sleep(30);
    assert.deepEqual(
      td.received.map((message) => message.type),
      ['drain', 'touch:event'],
    );
    assert.ok(td.received[0].timestamp, 'commands carry a timestamp');
    assert.equal(td.received[1].timestamp, undefined, 'stream does not');

    await td.close();
    await once(client, 'close');
    assert.equal(client.isConnected, false);
    client.command({ type: 'drain' });
    assert.equal(client.stream(TOUCH), false);
    assert.equal(client.droppedCount, 2);
    client.close();
  });

  it('factory: offline facade without a URL, logging each command', () => {
    const lines: string[] = [];
    const quiet = new StructuredLogger({ write: (line) => lines.push(line) });
    const offline = FacadeGatewayFactory.create(
      { url: null, pingIntervalMs: 1000 },
      quiet,
    );
    assert.ok(offline instanceof OfflineFacade);
    assert.equal(offline.isConnected, true);
    offline.command({ type: 'drain' });
    assert.equal(offline.stream(TOUCH), true);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /"type":"drain"/);

    const td = FacadeGatewayFactory.create(
      { url: 'ws://127.0.0.1:1', pingIntervalMs: 1000 },
      quiet,
    );
    assert.ok(td instanceof TouchDesignerClient);
    td.close();
  });
});
