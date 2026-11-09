import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { WebSocketServer } from 'ws';
import { StructuredLogger } from '../logging/structured-logger';
import { FacadeGatewayFactory } from './facade-gateway-factory';
import { OfflineFacade } from './offline-facade';
import { TouchDesignerClient } from './touch-designer-client';

interface Received {
  request: string;
  payload: { type: string; point: { x: number; y: number } };
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
  phase: 'begin' as const,
  x: 0.5,
  y: 0.25,
  touch: 1 as const,
};

describe('TouchDesignerClient', () => {
  it('streams points as TD messages, drops them offline, reconnects', async () => {
    const td = new FakeTouchDesigner();
    await td.listening();
    const client = new TouchDesignerClient({
      url: td.url,
      logger,
      reconnectMs: 30,
      pingIntervalMs: 50,
    });
    client.command({ type: 'drain' });
    assert.equal(client.stream(TOUCH), false);
    assert.equal(client.droppedCount, 1);
    assert.equal(client.isConnected, false);

    client.connect();
    await once(client, 'open');
    assert.equal(client.isConnected, true);
    client.command({ type: 'drain' });
    assert.equal(client.stream(TOUCH), true);
    assert.equal(client.stream({ ...TOUCH, phase: 'move', x: 0.6 }), true);
    assert.equal(
      client.stream({ ...TOUCH, phase: 'end', x: 0.7, touch: 0 }),
      true,
    );
    await sleep(30);
    const point = (x: number) => ({ x, y: 0.25 });
    assert.deepEqual(td.received, [
      {
        request: 'stream',
        payload: { type: 'stroke:begin', point: point(0.5) },
      },
      {
        request: 'stream',
        payload: { type: 'stroke:move', point: point(0.6) },
      },
      { request: 'stream', payload: { type: 'stroke:end', point: point(0.7) } },
    ]);

    await td.close();
    await once(client, 'close');
    assert.equal(client.isConnected, false);
    client.command({ type: 'drain' });
    assert.equal(client.stream(TOUCH), false);
    assert.equal(client.droppedCount, 2);
    client.close();
  });

  it('keeps retrying every interval until TD appears, warning once', async () => {
    const lines: string[] = [];
    const quiet = new StructuredLogger({ write: (line) => lines.push(line) });
    const probe = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      probe.once('listening', () => resolve());
    });
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((resolve) => {
      probe.close(() => resolve());
    });

    const client = new TouchDesignerClient({
      url: `ws://127.0.0.1:${port}`,
      logger: quiet,
      reconnectMs: 40,
    });
    client.connect();
    await sleep(150); // three or four failed attempts
    assert.equal(client.isConnected, false);
    const warnings = lines.filter((line) => line.includes('unreachable'));
    assert.equal(warnings.length, 1, 'one warning per outage');

    const td = new WebSocketServer({ port });
    await once(client, 'open');
    assert.equal(client.isConnected, true);
    client.close();
    await new Promise<void>((resolve) => {
      td.close(() => resolve());
    });
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
