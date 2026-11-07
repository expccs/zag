import { EventEmitter } from 'node:events';
import { io, type Socket } from 'socket.io-client';
import { CCS_PROJECT_ID } from './ccs-ids';
import type { Logger } from './logger';

export const CCS_DEFAULT_URL = 'https://admin.expolightcontrols.net';

export type CloudMode = 'live' | 'dry-run' | 'offline';

export const CLOUD_MODES: readonly CloudMode[] = ['live', 'dry-run', 'offline'];

export interface CloudCredentials {
  login: string;
  password: string;
}

export interface LoginData {
  accessToken: string;
  projectUID: string;
  latitude: number;
  longitude: number;
  timezone: string;
  accessLevel: number;
}

export interface ProgramReference {
  projectUID: string;
  groupID: string;
  programID: string;
  params?: number[];
}

export interface CommandProgram {
  _id: string;
  name: string;
  type: 'COMMAND' | 'WITH_PARAMS' | 'SWITCH' | string;
  /** null for stateless buttons (e.g. "Session start" / "Session end"). */
  state: { value: number } | null;
}

export interface ProgramGroup {
  _id: string;
  name: string;
  projectID: string;
  main: boolean;
  programs: CommandProgram[];
}

export interface ProgramStateChange {
  programID: string;
  value: number;
  /** Sent by CCS in `programStateChange`; absent in synthetic changes. */
  groupID?: string;
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface CloudEvents {
  login: [data: LoginData];
  connect: [];
  disconnect: [reason: string];
  reconnect: [attempt: number];
  stateChange: [change: ProgramStateChange];
}

export type CloudLogger = Pick<Logger, 'info' | 'warn'>;

export interface CloudGateway extends EventEmitter<CloudEvents> {
  readonly projectUID: string | null;
  readonly location: GeoCoordinates | null;
  readonly isConnected: boolean;
  connect(): Promise<void>;
  getPrograms(): Promise<ProgramGroup[]>;
  execCommand(reference: ProgramReference): Promise<unknown>;
  close(): void;
}

export interface CloudClientOptions {
  credentials: CloudCredentials;
  logger: CloudLogger;
  serverUrl?: string;
  execEnabled?: boolean;
  connectTimeoutMs?: number;
  loginRetryBaseMs?: number;
  loginRetryMaxMs?: number;
  reconnectDelayMs?: number;
  reconnectDelayMaxMs?: number;
}

export interface CloudConfig {
  mode: CloudMode;
  url: string;
  login: string;
  password: string;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_LOGIN_RETRY_BASE_MS = 1_000;
const DEFAULT_LOGIN_RETRY_MAX_MS = 30_000;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_RECONNECT_DELAY_MAX_MS = 5_000;
const SOCKET_TIMEOUT_MS = 20_000;
const SERVER_DISCONNECT = 'io server disconnect';

export class CloudProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudProjectError';
  }
}

export class CloudClient extends EventEmitter<CloudEvents> {
  projectUID: string | null = null;
  location: GeoCoordinates | null = null;
  timezone: string | null = null;

  private socket: Socket | null = null;
  private refreshing: Promise<void> | null = null;
  private closed = false;

  private readonly serverUrl: string;
  private readonly credentials: CloudCredentials;
  private readonly project: string;
  private readonly execEnabled: boolean;
  private readonly connectTimeoutMs: number;
  private readonly loginRetryBaseMs: number;
  private readonly loginRetryMaxMs: number;
  private readonly reconnectDelayMs: number;
  private readonly reconnectDelayMaxMs: number;
  private readonly logger: CloudLogger;

  constructor(options: CloudClientOptions) {
    super();
    this.credentials = options.credentials;
    this.project = CCS_PROJECT_ID;
    this.logger = options.logger;
    this.serverUrl = options.serverUrl ?? CCS_DEFAULT_URL;
    this.execEnabled = options.execEnabled ?? true;
    this.connectTimeoutMs =
      options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.loginRetryBaseMs =
      options.loginRetryBaseMs ?? DEFAULT_LOGIN_RETRY_BASE_MS;
    this.loginRetryMaxMs =
      options.loginRetryMaxMs ?? DEFAULT_LOGIN_RETRY_MAX_MS;
    this.reconnectDelayMs =
      options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.reconnectDelayMaxMs =
      options.reconnectDelayMaxMs ?? DEFAULT_RECONNECT_DELAY_MAX_MS;
  }

  get isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  async connect(): Promise<void> {
    if (this.socket) throw new Error('CloudClient is already connected');
    this.closed = false;
    const login = await this.loginWithRetry();
    const socket = this.createSocket(login.accessToken);
    this.socket = socket;
    await this.waitForConnect(socket);
  }

  async getPrograms(): Promise<ProgramGroup[]> {
    const socket = this.requireSocket();
    const query = { projectUID: this.project };
    const response = await socket.emitWithAck('getPrograms', query);
    return (response as { data: ProgramGroup[] }).data;
  }

  async execCommand(reference: ProgramReference): Promise<unknown> {
    if (!this.execEnabled) {
      this.logger.info('ccs dry-run execCommand', { reference });
      return null;
    }
    const socket = this.requireSocket();
    return socket.emitWithAck('runProgram', reference);
  }

  close(): void {
    this.closed = true;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private static describeError(error: unknown): string {
    return error instanceof Error ? error.message : `${error}`;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`CCS ${url} responded ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private requireSocket(): Socket {
    if (!this.socket || !this.socket.connected) {
      throw new Error('CCS socket is not connected');
    }
    return this.socket;
  }

  // The ZAG project id is a constant (ccs-ids.ts); it is still verified
  // against the account's project list so a wrong account fails loudly
  // instead of retrying forever.
  private async resolveProject(): Promise<string> {
    const projects = await this.postJson<Array<{ projectUID: string }>>(
      '/api/user/projects',
      this.credentials,
    );
    if (projects.length === 0) {
      throw new CloudProjectError('CCS account has no projects');
    }
    const found = projects.some((item) => item.projectUID === this.project);
    if (!found) {
      const available = projects.map((item) => item.projectUID).join(', ');
      throw new CloudProjectError(
        `CCS project "${this.project}" not found; available: ${available}`,
      );
    }
    return this.project;
  }

  private async login(): Promise<LoginData> {
    const project = await this.resolveProject();
    const { login, password } = this.credentials;
    const body = { login, password, project };
    const data = await this.postJson<LoginData>('/api/user/app/auth', body);
    this.projectUID = project;
    this.timezone = data.timezone;
    this.location = { latitude: data.latitude, longitude: data.longitude };
    this.emit('login', data);
    return data;
  }

  private async loginWithRetry(): Promise<LoginData> {
    let delayMs = this.loginRetryBaseMs;
    for (;;) {
      try {
        return await this.login();
      } catch (error) {
        if (this.closed || error instanceof CloudProjectError) throw error;
        this.logger.warn('ccs login failed', {
          error: CloudClient.describeError(error),
          retryInMs: delayMs,
        });
        await CloudClient.sleep(delayMs);
        delayMs = Math.min(delayMs * 2, this.loginRetryMaxMs);
      }
    }
  }

  private createSocket(token: string): Socket {
    const socket = io(`${this.serverUrl}/users`, {
      path: '/socket',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelayMs,
      reconnectionDelayMax: this.reconnectDelayMaxMs,
      reconnectionAttempts: Infinity,
      timeout: SOCKET_TIMEOUT_MS,
      auth: { token },
    });

    socket.on('connect', () => {
      socket.emit('joinRoom', { room: this.project });
      this.emit('connect');
    });
    socket.on('disconnect', (reason) => {
      this.emit('disconnect', reason);
      // socket.io never reconnects by itself after a server-side disconnect
      // (CCS drops sockets whose token expired), so log in again by hand.
      if (reason === SERVER_DISCONNECT) this.recover();
    });
    socket.on('connect_error', (error) => {
      this.logger.warn('ccs connect_error', { error: error.message });
      // active === false: a middleware denied the stale token and the client
      // gave up; network errors keep active === true and retry on their own.
      if (!socket.active) this.recover();
    });
    socket.on('programStateChange', (change: ProgramStateChange) => {
      this.emit('stateChange', change);
    });
    socket.io.on('reconnect', (attempt) => {
      this.emit('reconnect', attempt);
    });
    return socket;
  }

  private recover(): void {
    if (this.closed || this.refreshing) return;
    this.refreshing = this.refreshToken().finally(() => {
      this.refreshing = null;
    });
  }

  private async refreshToken(): Promise<void> {
    const login = await this.loginWithRetry();
    const socket = this.socket;
    if (!socket || this.closed) return;
    socket.auth = { token: login.accessToken };
    if (!socket.active) socket.connect();
  }

  private waitForConnect(socket: Socket): Promise<void> {
    if (socket.connected) return Promise.resolve();
    const { connectTimeoutMs } = this;
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;
      const onConnect = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(() => {
        socket.off('connect', onConnect);
        const message = `CCS socket did not connect in ${connectTimeoutMs}ms`;
        reject(new Error(message));
      }, connectTimeoutMs);
      socket.once('connect', onConnect);
    });
  }
}

export interface FakeCloudOptions {
  logger: CloudLogger;
  projectUID?: string;
  location?: GeoCoordinates;
  groups?: ProgramGroup[];
}

export class FakeCloudClient extends EventEmitter<CloudEvents> {
  readonly projectUID: string;
  readonly location: GeoCoordinates;
  readonly commands: ProgramReference[] = [];

  private connected = false;
  private readonly groups: ProgramGroup[];
  private readonly logger: CloudLogger;

  constructor(options: FakeCloudOptions) {
    super();
    this.logger = options.logger;
    this.projectUID = options.projectUID ?? 'offline-project';
    this.location = options.location ?? { latitude: 0, longitude: 0 };
    this.groups = options.groups ?? [];
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.emit('login', {
      accessToken: 'offline',
      projectUID: this.projectUID,
      latitude: this.location.latitude,
      longitude: this.location.longitude,
      timezone: 'UTC',
      accessLevel: 0,
    });
    this.emit('connect');
  }

  async getPrograms(): Promise<ProgramGroup[]> {
    return this.groups;
  }

  async execCommand(reference: ProgramReference): Promise<unknown> {
    this.commands.push(reference);
    this.logger.info('ccs offline execCommand', { reference });
    return { success: true };
  }

  setProgramState(programID: string, value: number): void {
    for (const group of this.groups) {
      for (const program of group.programs) {
        if (program._id === programID) program.state = { value };
      }
    }
    this.emit('stateChange', { programID, value });
  }

  close(): void {
    if (!this.connected) return;
    this.connected = false;
    this.emit('disconnect', 'io client disconnect');
  }
}

/** Picks the gateway for `CCS_MODE`: fake for offline, real otherwise. */
export class CloudGatewayFactory {
  static create(
    config: CloudConfig,
    logger: CloudLogger,
    offlineGroups: ProgramGroup[] = [],
  ): CloudGateway {
    if (config.mode === 'offline') {
      return new FakeCloudClient({ logger, groups: offlineGroups });
    }
    const { login, password } = config;
    return new CloudClient({
      credentials: { login, password },
      serverUrl: config.url,
      execEnabled: config.mode === 'live',
      logger,
    });
  }
}
