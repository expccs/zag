import { EventEmitter } from 'node:events';
import type { PublicState, Screen, ZagFlag } from '@zag/protocol';
import type {
  CloudGateway,
  CloudLogger,
  ProgramGroup,
  ProgramReference,
  ProgramStateChange,
} from '../ports/cloud-gateway';

export type FlagMap<F extends string> = Readonly<Record<F, boolean>>;

export interface AppStateEvents<F extends string> {
  change: [flags: FlagMap<F>, changed: F[]];
  synced: [flags: FlagMap<F>];
}

export interface AppStateOptions<F extends string> {
  groupID: string;
  programs: Record<F, string>;
  initial: Record<F, boolean>;
  overrides?: Partial<Record<F, boolean>>;
  logger: CloudLogger;
}

/** Boolean flags mirrored from the switch programs of one CCS group. */
export class AppState<F extends string> extends EventEmitter<
  AppStateEvents<F>
> {
  readonly groupID: string;

  private synced = false;
  private readonly flags: Record<F, boolean>;
  private readonly programByFlag: Record<F, string>;
  private readonly flagByProgram = new Map<string, F>();
  private readonly overrides: Partial<Record<F, boolean>>;
  private readonly logger: CloudLogger;

  constructor(options: AppStateOptions<F>) {
    super();
    this.groupID = options.groupID;
    this.flags = { ...options.initial };
    this.programByFlag = options.programs;
    this.overrides = options.overrides ?? {};
    this.logger = options.logger;
    const flags = Object.keys(options.programs) as F[];
    for (const flag of flags) {
      this.flagByProgram.set(options.programs[flag], flag);
    }
  }

  get isSynced(): boolean {
    return this.synced;
  }

  get snapshot(): FlagMap<F> {
    return { ...this.flags, ...this.overrides };
  }

  get(flag: F): boolean {
    const override = this.overrides[flag];
    return override === undefined ? this.flags[flag] : override;
  }

  bind(cloud: CloudGateway): this {
    cloud.on('stateChange', (change) => {
      this.apply([change]);
    });
    return this;
  }

  sync(groups: ProgramGroup[]): void {
    const group = groups.find((item) => item._id === this.groupID);
    if (!group) {
      this.logger.warn('state group not found in CCS', {
        groupID: this.groupID,
        available: groups.map((item) => item._id),
      });
      return;
    }
    const changes = group.programs.map((program) => ({
      programID: program._id,
      value: program.state ? program.state.value : 0,
    }));
    this.apply(changes);
    this.synced = true;
    this.emit('synced', this.snapshot);
  }

  apply(changes: ProgramStateChange[]): F[] {
    const changed: F[] = [];
    for (const change of changes) {
      const flag = this.flagByProgram.get(change.programID);
      if (!flag) continue;
      const next = change.value !== 0;
      if (this.flags[flag] === next) continue;
      this.flags[flag] = next;
      changed.push(flag);
    }
    if (changed.length > 0) this.emit('change', this.snapshot, changed);
    return changed;
  }

  reference(projectUID: string, flag: F, value: boolean): ProgramReference {
    return {
      projectUID,
      groupID: this.groupID,
      programID: this.programByFlag[flag],
      params: [value ? 1 : 0],
    };
  }
}

/** ZAG flags plus the screen the client must show for them. */
export class ZagAppState extends AppState<ZagFlag> {
  get publicState(): PublicState {
    const flags = this.snapshot;
    const screen = ZagAppState.resolveScreen(flags);
    return { flags, screen, synced: this.isSynced };
  }

  static resolveScreen(flags: FlagMap<ZagFlag>): Screen {
    if (flags.techPause) return 'maintenance';
    if (!flags.interactive) return 'disabled';
    if (flags.schedule) return 'schedule';
    return 'interactive';
  }
}
