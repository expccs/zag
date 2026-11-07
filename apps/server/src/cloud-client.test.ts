import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, describe, it } from 'node:test';
import { Server } from 'socket.io';
import { CCS_PROJECT_ID } from './ccs-ids';
import {
  CloudClient,
  CloudGatewayFactory,
  CloudProjectError,
  FakeCloudClient,
  type CloudClientOptions,
  type CloudGateway,
  type LoginData,
  type ProgramGroup,
  type ProgramReference,
  type ProgramStateChange,
} from './cloud-client';
import { StructuredLogger, type LogFields } from './logger';

interface LogRecord extends LogFields {
  level: string;
  message: string;
}

const PROJECT = CCS_PROJECT_ID;
const GROUPS: ProgramGroup[] = [
  {
    _id: 'group-1',
    name: 'App state',
    projectID: PROJECT,
    main: false,
    programs: [
      {
        _id: 'prog-1',
        name: 'techPause',
        type: 'COMMAND',
        state: { value: 0 },
      },
    ],
  },
];
const CREDENTIALS = { login: 'zag', password: 'secret' };
const FAST = {
  loginRetryBaseMs: 10,
  loginRetryMaxMs: 40,
  reconnectDelayMs: 20,
  reconnectDelayMaxMs: 40,
  connectTimeoutMs: 2_000,
};

const waitEvent = (
  cloud: CloudGateway,
  name: 'login' | 'connect' | 'disconnect' | 'reconnect',
): Promise<void> =>
  new Promise((resolve) => {
    cloud.once(name, () => resolve());
  });

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitFor = <T>(
  check: () => T | undefined,
  timeoutMs = 2_000,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      const value = check();
      if (value !== undefined) {
        resolve(value);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('waitFor: timeout'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });

/** In-process CCS: login REST + `/users` socket namespace with token auth. */
class FakeCcsServer {
  url = '';
  authCalls = 0;
  authFailuresLeft = 0;
  projectCalls = 0;
  projects: string[] = [PROJECT, 'proj-2'];
  readonly tokens = new Set<string>();
  readonly rooms: string[] = [];
  readonly runs: ProgramReference[] = [];
  readonly http: HttpServer;
  readonly io: Server;

  constructor() {
    this.http = createServer((request, response) => {
      void this.handleHttp(request, response);
    });
    this.io = new Server(this.http, {
      path: '/socket',
      transports: ['websocket'],
    });
    const users = this.io.of('/users');
    users.use((socket, next) => {
      const { token } = socket.handshake.auth;
      if (this.tokens.has(token)) next();
      else next(new Error('unauthorized'));
    });
    users.on('connection', (socket) => {
      socket.on('joinRoom', (payload: { room: string }) => {
        this.rooms.push(payload.room);
        socket.join(payload.room);
      });
      socket.on('getPrograms', (_query, ack) => ack({ data: GROUPS }));
      socket.on('runProgram', (reference: ProgramReference, ack) => {
        this.runs.push(reference);
        ack({ success: true });
      });
    });
  }

  get connectedSockets(): number {
    return this.io.of('/users').sockets.size;
  }

  listen(): Promise<void> {
    return new Promise((resolve) => {
      this.http.listen(0, () => {
        const { port } = this.http.address() as AddressInfo;
        this.url = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  }

  reset(): void {
    this.tokens.clear();
    this.rooms.length = 0;
    this.runs.length = 0;
    this.authFailuresLeft = 0;
    this.projects = [PROJECT, 'proj-2'];
  }

  close(): Promise<void> {
    return this.io.close();
  }

  private static readJson(request: NodeJS.ReadableStream): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      });
    });
  }

  private async handleHttp(
    request: Parameters<Parameters<typeof createServer>[1] & object>[0],
    response: Parameters<Parameters<typeof createServer>[1] & object>[1],
  ): Promise<void> {
    const body = (await FakeCcsServer.readJson(request)) as Record<
      string,
      string
    >;
    const reply = (status: number, payload: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    };
    if (request.url === '/api/user/projects') {
      this.projectCalls++;
      reply(
        200,
        this.projects.map((projectUID) => ({ projectUID })),
      );
      return;
    }
    if (request.url === '/api/user/app/auth') {
      this.authCalls++;
      if (this.authFailuresLeft > 0) {
        this.authFailuresLeft--;
        reply(500, { error: 'flaky' });
        return;
      }
      const token = `token-${this.authCalls}`;
      this.tokens.add(token);
      const login: LoginData = {
        accessToken: token,
        projectUID: body.project,
        latitude: 50.45,
        longitude: 30.52,
        timezone: 'Europe/Kyiv',
        accessLevel: 1,
      };
      reply(200, login);
      return;
    }
    reply(404, {});
  }
}

describe('cloud client', () => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({
    write: (line) => records.push(JSON.parse(line) as LogRecord),
  });
  const clients: CloudClient[] = [];
  const ccs = new FakeCcsServer();

  const createClient = (extra: Partial<CloudClientOptions> = {}) => {
    const client = new CloudClient({
      credentials: CREDENTIALS,
      serverUrl: ccs.url,
      logger,
      ...FAST,
      ...extra,
    });
    clients.push(client);
    return client;
  };

  before(() => ccs.listen());

  afterEach(() => {
    for (const client of clients) client.close();
    clients.length = 0;
    records.length = 0;
    ccs.reset();
  });

  after(() => ccs.close());

  it('logs in, resolves the project and joins its room', async () => {
    const client = createClient();
    const logins: LoginData[] = [];
    client.on('login', (data) => logins.push(data));
    const connected = waitEvent(client, 'connect');

    await client.connect();
    await connected;

    assert.equal(client.isConnected, true);
    assert.equal(client.projectUID, PROJECT);
    assert.deepEqual(client.location, { latitude: 50.45, longitude: 30.52 });
    assert.equal(client.timezone, 'Europe/Kyiv');
    assert.equal(logins.length, 1);
    assert.equal(logins[0].projectUID, PROJECT);
    await waitFor(() => (ccs.rooms.includes(PROJECT) ? true : undefined));
  });

  it('verifies the configured project against the account list', async () => {
    const before = ccs.projectCalls;
    const client = createClient();
    await client.connect();
    assert.equal(ccs.projectCalls - before, 1);
    assert.equal(client.projectUID, PROJECT);
  });

  it('fails without retrying when the account lacks the project', async () => {
    ccs.projects = ['proj-a', 'proj-b'];
    const authBefore = ccs.authCalls;
    const client = createClient();

    await assert.rejects(
      () => client.connect(),
      (error: unknown) =>
        error instanceof CloudProjectError &&
        error.message ===
          `CCS project "${PROJECT}" not found; available: proj-a, proj-b`,
    );
    assert.equal(ccs.authCalls, authBefore);
    assert.equal(client.isConnected, false);
    assert.equal(
      records.some((r) => r.message === 'ccs login failed'),
      false,
    );
  });

  it('fails when the account has no projects', async () => {
    ccs.projects = [];
    const client = createClient();
    await assert.rejects(() => client.connect(), {
      name: 'CloudProjectError',
      message: 'CCS account has no projects',
    });
  });

  it('reads programs and runs commands through the socket', async () => {
    const client = createClient();
    await client.connect();
    const reference: ProgramReference = {
      projectUID: PROJECT,
      groupID: 'group-1',
      programID: 'prog-1',
      params: [1],
    };

    const groups = await client.getPrograms();
    const result = await client.execCommand(reference);

    assert.deepEqual(groups, GROUPS);
    assert.deepEqual(result, { success: true });
    assert.deepEqual(ccs.runs, [reference]);
  });

  it('only logs commands in dry-run', async () => {
    const client = createClient({ execEnabled: false });
    await client.connect();
    const reference: ProgramReference = {
      projectUID: PROJECT,
      groupID: 'group-1',
      programID: 'prog-1',
    };

    const result = await client.execCommand(reference);

    assert.equal(result, null);
    assert.equal(ccs.runs.length, 0);
    const record = records.find((r) => r.message === 'ccs dry-run execCommand');
    assert.ok(record);
    assert.deepEqual(record.reference, reference);
  });

  it('forwards programStateChange as stateChange', async () => {
    const client = createClient();
    await client.connect();
    await waitFor(() => (ccs.rooms.includes(PROJECT) ? true : undefined));
    const changes: ProgramStateChange[] = [];
    client.on('stateChange', (change) => changes.push(change));

    ccs.io
      .of('/users')
      .to(PROJECT)
      .emit('programStateChange', { programID: 'prog-1', value: 1 });

    await waitFor(() => (changes.length > 0 ? true : undefined));
    assert.deepEqual(changes, [{ programID: 'prog-1', value: 1 }]);
  });

  it('retries login with backoff until CCS answers', async () => {
    ccs.authFailuresLeft = 2;
    const before = ccs.authCalls;
    const client = createClient();

    await client.connect();

    assert.equal(client.isConnected, true);
    assert.equal(ccs.authCalls - before, 3);
    const warnings = records.filter((r) => r.message === 'ccs login failed');
    assert.equal(warnings.length, 2);
    assert.deepEqual(
      warnings.map((r) => r.retryInMs),
      [10, 20],
    );
  });

  it('re-logins and reconnects after a server-side disconnect', async () => {
    const client = createClient();
    await client.connect();
    await waitFor(() => (ccs.connectedSockets === 1 ? true : undefined));
    const authCallsBefore = ccs.authCalls;
    const reconnected = waitEvent(client, 'connect');

    // CCS drops the session: socket.io does not reconnect on its own here.
    ccs.tokens.clear();
    ccs.io.of('/users').disconnectSockets(true);

    await reconnected;
    assert.equal(ccs.authCalls - authCallsBefore, 1);
    assert.equal(client.isConnected, true);
    await waitFor(() => (ccs.connectedSockets === 1 ? true : undefined));
  });

  it('re-logins when the stale token is rejected on reconnect', async () => {
    const client = createClient();
    await client.connect();
    await waitFor(() => (ccs.connectedSockets === 1 ? true : undefined));
    const authCallsBefore = ccs.authCalls;
    const reconnected = waitEvent(client, 'connect');

    // Transport drop (no server disconnect): the automatic reconnect hits
    // the middleware with a token CCS no longer accepts.
    ccs.tokens.clear();
    for (const socket of ccs.io.of('/users').sockets.values()) {
      socket.conn.close();
    }

    await reconnected;
    const warning = records.find((r) => r.message === 'ccs connect_error');
    assert.ok(warning);
    assert.equal(warning.error, 'unauthorized');
    assert.equal(ccs.authCalls - authCallsBefore, 1);
    assert.equal(client.isConnected, true);
    await waitFor(() => (ccs.connectedSockets === 1 ? true : undefined));
  });

  it('close stops the socket and silences further events', async () => {
    const client = createClient();
    await client.connect();
    await waitFor(() => (ccs.connectedSockets === 1 ? true : undefined));
    let events = 0;
    client.on('disconnect', () => events++);
    client.on('stateChange', () => events++);

    client.close();

    assert.equal(client.isConnected, false);
    await waitFor(() => (ccs.connectedSockets === 0 ? true : undefined));
    ccs.io
      .of('/users')
      .emit('programStateChange', { programID: 'prog-1', value: 1 });
    await sleep(50);
    assert.equal(events, 0);
    await assert.rejects(() => client.getPrograms(), /not connected/);
  });
});

describe('fake cloud client', () => {
  it('mirrors the gateway contract without network', async () => {
    const records: LogRecord[] = [];
    const logger = new StructuredLogger({
      write: (line) => records.push(JSON.parse(line) as LogRecord),
    });
    const cloud = new FakeCloudClient({ logger, groups: GROUPS });
    const seen: string[] = [];
    cloud.on('login', () => seen.push('login'));
    cloud.on('connect', () => seen.push('connect'));
    cloud.on('disconnect', () => seen.push('disconnect'));
    const changes: ProgramStateChange[] = [];
    cloud.on('stateChange', (change) => changes.push(change));

    await cloud.connect();
    const reference: ProgramReference = {
      projectUID: cloud.projectUID,
      groupID: 'group-1',
      programID: 'prog-1',
    };
    const result = await cloud.execCommand(reference);
    cloud.setProgramState('prog-1', 1);
    cloud.close();

    assert.equal(cloud.isConnected, false);
    assert.deepEqual(seen, ['login', 'connect', 'disconnect']);
    assert.deepEqual(result, { success: true });
    assert.deepEqual(cloud.commands, [reference]);
    assert.deepEqual(changes, [{ programID: 'prog-1', value: 1 }]);
    assert.deepEqual(GROUPS[0].programs[0].state, { value: 1 });
    assert.deepEqual(await cloud.getPrograms(), GROUPS);
  });
});

describe('CloudGatewayFactory', () => {
  const logger = new StructuredLogger({ write: () => {} });
  const base = { url: 'http://ccs', login: 'l', password: 'p' };

  it('creates the fake gateway for offline with the given groups', () => {
    const config = { ...base, mode: 'offline' as const };
    const cloud = CloudGatewayFactory.create(config, logger, GROUPS);
    assert.ok(cloud instanceof FakeCloudClient);
  });

  it('creates the real client for live and dry-run', () => {
    const live = CloudGatewayFactory.create({ ...base, mode: 'live' }, logger);
    const dry = CloudGatewayFactory.create(
      { ...base, mode: 'dry-run' },
      logger,
    );
    assert.ok(live instanceof CloudClient);
    assert.ok(dry instanceof CloudClient);
  });
});
