import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { AppState, type FlagMap } from './app-state';
import {
  CloudClient,
  FakeCloudClient,
  type CloudGateway,
  type Logger,
} from './cloud-client';
import type { BackendConfig, ZagFlag } from './config';
import { GeoFence, type GeoReason, type GeoSample } from './geo-fence';
import {
  SessionQueue,
  type FinishReason,
  type QueuePlace,
  type QueueTask,
} from './session-queue';
import { TouchDesignerClient } from './touch-designer-client';

export type InteractiveMode = 'comet' | 'milky-way' | 'palette';

export const INTERACTIVE_MODES: readonly InteractiveMode[] = [
  'comet',
  'milky-way',
  'palette',
];

export type Screen = 'maintenance' | 'disabled' | 'schedule' | 'interactive';

export interface SessionRequest {
  mode: InteractiveMode;
  params: Record<string, string | number>;
}

export interface SessionTicket extends QueuePlace {
  sessionId: string;
  durationMs: number;
}

export interface SessionInfo {
  sessionId: string;
  mode: InteractiveMode;
  durationMs: number;
  endsAt: number;
}

export interface TouchEvent {
  x: number;
  y: number;
  touch: 0 | 1;
  swipe: 0 | 1;
  direction: 'left' | 'right' | 'none';
}

export interface PublicState {
  flags: FlagMap<ZagFlag>;
  screen: Screen;
  synced: boolean;
}

export interface LocationCheck {
  allowed: boolean;
  distanceM: number;
  reason: GeoReason | 'disabled';
}

export interface ApplicationEvents {
  state: [state: PublicState];
  queue: [userId: string, place: QueuePlace];
  sessionStart: [userId: string, info: SessionInfo];
  sessionEnd: [userId: string, reason: FinishReason];
}

export type AppErrorCode = 'ENOTALLOWED' | 'EBADMODE' | 'EQUEUED';

export class AppError extends Error {
  constructor(readonly code: AppErrorCode) {
    super(code);
    this.name = 'AppError';
  }
}

export const resolveScreen = (flags: FlagMap<ZagFlag>): Screen => {
  if (flags.techPause) return 'maintenance';
  if (!flags.interactive) return 'disabled';
  if (flags.schedule) return 'schedule';
  return 'interactive';
};

const createCloud = (config: BackendConfig, logger: Logger): CloudGateway => {
  const { cloud } = config;
  if (cloud.mode === 'offline') {
    return new FakeCloudClient({ location: config.geo.center, logger });
  }
  return new CloudClient({
    credentials: {
      login: cloud.login,
      password: cloud.password,
      project: cloud.project,
    },
    serverUrl: cloud.url,
    execEnabled: cloud.mode === 'live',
    logger,
  });
};

export class Application extends EventEmitter<ApplicationEvents> {
  readonly cloud: CloudGateway;
  readonly state: AppState<ZagFlag>;
  readonly geo: GeoFence;
  readonly queue: SessionQueue<SessionRequest>;
  readonly touchDesigner: TouchDesignerClient | null;

  private readonly config: BackendConfig;
  private readonly logger: Logger;

  constructor(config: BackendConfig, logger: Logger = console) {
    super();
    this.config = config;
    this.logger = logger;
    this.cloud = createCloud(config, logger);
    this.state = new AppState<ZagFlag>({
      groupID: config.cloud.groupID,
      programs: config.cloud.programs,
      initial: config.state.initial,
      overrides: config.state.overrides,
      logger,
    }).bind(this.cloud);
    this.geo = new GeoFence(config.geo).bind(this.cloud);
    this.queue = new SessionQueue<SessionRequest>({
      gapMs: config.queue.gapMs,
    });
    const tdUrl = config.touchDesigner.url;
    this.touchDesigner = tdUrl
      ? new TouchDesignerClient({ ...config.touchDesigner, url: tdUrl, logger })
      : null;
    this.wire();
  }

  get publicState(): PublicState {
    const flags = this.state.snapshot;
    return { flags, screen: resolveScreen(flags), synced: this.state.isSynced };
  }

  start(): void {
    this.touchDesigner?.connect();
    this.cloud.on('reconnect', () => {
      this.syncState();
    });
    this.cloud
      .connect()
      .then(() => this.syncState())
      .catch((error: Error) => {
        this.logger.error(`[app] cloud connect failed: ${error.message}`);
      });
  }

  async stop(): Promise<void> {
    this.queue.clear();
    this.touchDesigner?.close();
    this.cloud.close();
  }

  checkLocation(sample: GeoSample): LocationCheck {
    if (!this.state.get('locationRestriction')) {
      return { allowed: true, distanceM: -1, reason: 'disabled' };
    }
    return this.geo.check(sample);
  }

  requestSession(userId: string, request: SessionRequest): SessionTicket {
    if (this.publicState.screen !== 'interactive') {
      throw new AppError('ENOTALLOWED');
    }
    if (!INTERACTIVE_MODES.includes(request.mode)) {
      throw new AppError('EBADMODE');
    }
    if (this.queue.hasUser(userId)) throw new AppError('EQUEUED');
    const durationMs = this.config.queue.sessionMs;
    const task: QueueTask<SessionRequest> = {
      id: randomUUID(),
      userId,
      durationMs,
      payload: { mode: request.mode, params: { ...request.params } },
    };
    const place = this.queue.enqueue(task);
    return { ...place, sessionId: task.id, durationMs };
  }

  cancelSession(userId: string): boolean {
    return this.queue.remove(userId);
  }

  handleTouch(userId: string, event: TouchEvent): boolean {
    const current = this.queue.currentTask;
    if (!current || current.userId !== userId) return false;
    if (!this.touchDesigner) return true;
    return this.touchDesigner.stream({
      type: 'touch:event',
      sessionId: current.id,
      x: event.x,
      y: event.y,
      touch: event.touch,
      swipe: event.swipe,
      direction: event.direction,
    });
  }

  async setFlag(flag: ZagFlag, value: boolean): Promise<void> {
    const projectUID = this.cloud.projectUID;
    if (!projectUID) throw new Error('Cloud is not logged in');
    await this.cloud.execCommand(this.state.reference(projectUID, flag, value));
  }

  private wire(): void {
    const td = this.touchDesigner;

    this.state.on('synced', () => {
      this.emit('state', this.publicState);
    });
    this.state.on('change', () => {
      const state = this.publicState;
      this.emit('state', state);
      if (state.screen !== 'interactive') this.abortSessions();
    });

    this.queue.on('start', (task, endsAt) => {
      td?.command({
        type: 'session:start',
        sessionId: task.id,
        mode: task.payload.mode,
        params: task.payload.params,
        durationMs: task.durationMs,
      });
      this.emit('sessionStart', task.userId, {
        sessionId: task.id,
        mode: task.payload.mode,
        durationMs: task.durationMs,
        endsAt,
      });
    });
    this.queue.on('finish', (task, reason) => {
      td?.command({ type: 'session:end', sessionId: task.id, reason });
      this.emit('sessionEnd', task.userId, reason);
    });
    this.queue.on('update', (waits) => {
      for (const wait of waits) {
        this.emit('queue', wait.task.userId, {
          waitMs: wait.waitMs,
          position: wait.position,
        });
      }
    });
    this.queue.on('drain', () => {
      td?.command({ type: 'drain' });
    });
  }

  private abortSessions(): void {
    const waiting = this.queue.waits().map((wait) => wait.task.userId);
    this.queue.skipCurrent();
    this.queue.clear();
    for (const userId of waiting) this.emit('sessionEnd', userId, 'skipped');
  }

  private syncState(): void {
    this.cloud
      .getPrograms()
      .then((groups) => this.state.sync(groups))
      .catch((error: Error) => {
        this.logger.error(`[app] state sync failed: ${error.message}`);
      });
  }
}
