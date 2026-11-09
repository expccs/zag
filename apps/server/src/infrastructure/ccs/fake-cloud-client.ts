import {
  CloudEmitter,
  type CloudGateway,
  type CloudLogger,
  type GeoCoordinates,
  type ProgramGroup,
  type ProgramReference,
} from '../../app/ports/cloud-gateway';

export interface FakeCloudOptions {
  logger: CloudLogger;
  projectUID?: string;
  location?: GeoCoordinates;
  groups?: ProgramGroup[];
}

/**
 * In-memory `CloudGateway`: `CCS_MODE=offline` and tests. Owns its program
 * groups so `sync` works; `setProgramState` plays a CCS switch flip.
 */
export class FakeCloudClient extends CloudEmitter implements CloudGateway {
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
