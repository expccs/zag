import { ZAG_FLAGS, type ZagFlag } from '@zag/protocol';
import type { InjectionToken } from 'tsyringe';
import type { SessionConfig } from '../../app/ports/session-config';
import {
  CLOUD_MODES,
  type CloudConfig,
  type CloudMode,
} from '../ccs/cloud-gateway-factory';
import { CCS_DEFAULT_URL } from '../ccs/cloud-client';
import {
  CCS_CONTROL_PROGRAMS,
  CCS_CONTROLS_GROUP_ID,
  CCS_STATE_GROUP_ID,
  CCS_STATE_PROGRAMS,
} from '../ccs/ccs-ids';
import type { ControlButton, ControlsConfig } from '../ccs/cloud-controls';
import type { FacadeConfig } from '../touch-designer/facade-gateway-factory';

export interface StateConfig {
  /** `_id` of the CCS program group holding the app-state switches. */
  groupID: string;
  /** `_id` of the switch program per flag (`ccs-ids.ts`, env overrides). */
  programs: Record<ZagFlag, string>;
  /** Flags served until the first CCS sync. */
  initial: Record<ZagFlag, boolean>;
  /** Forced flags (`STATE_OVERRIDES`), win over CCS. */
  overrides: Partial<Record<ZagFlag, boolean>>;
}

export interface ServerConfig {
  port: number;
  allowedOrigins: string[];
  /** Trust X-Forwarded-For from nginx on the same host. */
  trustProxy: boolean;
  cloud: CloudConfig;
  state: StateConfig;
  /** CCS «Public app controls» buttons (`CCS_CONTROLS_GROUP`, …). */
  controls: ControlsConfig;
  /** Queue timing (`SESSION_MS`, `FADE_MS`, `DISCONNECT_GRACE_MS`). */
  session: SessionConfig;
  /** TouchDesigner (`TD_WS_URL`, `TD_PING_INTERVAL_MS`). */
  facade: FacadeConfig;
}

export const SERVER_CONFIG: InjectionToken<ServerConfig> =
  Symbol('ServerConfig');

const CONTROL_ENV: Record<ControlButton, string> = {
  sessionStart: 'CCS_PROGRAM_SESSION_START',
  sessionEnd: 'CCS_PROGRAM_SESSION_END',
  fade: 'CCS_PROGRAM_FADE',
  idle: 'CCS_PROGRAM_IDLE',
};

const PROGRAM_ENV: Record<ZagFlag, string> = {
  techPause: 'CCS_PROGRAM_TECH_PAUSE',
  interactive: 'CCS_PROGRAM_INTERACTIVE',
  locationRestriction: 'CCS_PROGRAM_LOCATION_RESTRICTION',
  schedule: 'CCS_PROGRAM_SCHEDULE',
};

// Until CCS answers, live/dry-run show "maintenance"; offline is usable.
const SAFE_INITIAL: Record<ZagFlag, boolean> = {
  techPause: true,
  interactive: false,
  locationRestriction: true,
  schedule: false,
};

const OFFLINE_INITIAL: Record<ZagFlag, boolean> = {
  techPause: false,
  interactive: true,
  locationRestriction: false,
  schedule: false,
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

class EnvReader {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv) {
    this.env = env;
  }

  required(key: string): string {
    const value = this.env[key];
    if (!value) throw new ConfigError(`${key} is required`);
    return value;
  }

  string(key: string, fallback: string): string {
    return this.env[key] || fallback;
  }

  number(key: string, fallback: number): number {
    const raw = this.env[key];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new ConfigError(`${key} must be a number`);
    }
    return value;
  }

  list(key: string): string[] {
    const raw = this.env[key];
    if (!raw) return [];
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  boolean(key: string, fallback: boolean): boolean {
    const raw = this.env[key];
    if (raw === undefined || raw === '') return fallback;
    if (raw !== 'true' && raw !== 'false') {
      throw new ConfigError(`${key} must be true|false`);
    }
    return raw === 'true';
  }
}

export class ConfigLoader {
  static load(env: NodeJS.ProcessEnv = process.env): ServerConfig {
    const reader = new EnvReader(env);
    const cloud = ConfigLoader.readCloud(reader);
    return {
      port: reader.number('PORT', 8080),
      allowedOrigins: reader.list('ALLOWED_ORIGINS'),
      trustProxy: reader.boolean('TRUST_PROXY', true),
      cloud,
      state: ConfigLoader.readState(reader, cloud.mode),
      controls: ConfigLoader.readControls(reader, cloud.mode),
      session: ConfigLoader.readSession(reader),
      facade: ConfigLoader.readFacade(reader),
    };
  }

  private static readSession(reader: EnvReader): SessionConfig {
    return {
      sessionMs: reader.number('SESSION_MS', 40_000),
      fadeMs: reader.number('FADE_MS', 5_000),
      disconnectGraceMs: reader.number('DISCONNECT_GRACE_MS', 10_000),
    };
  }

  private static readFacade(reader: EnvReader): FacadeConfig {
    return {
      url: reader.string('TD_WS_URL', '') || null,
      pingIntervalMs: reader.number('TD_PING_INTERVAL_MS', 30_000),
    };
  }

  private static readMode(reader: EnvReader): CloudMode {
    const raw = reader.string('CCS_MODE', 'live');
    if (!CLOUD_MODES.includes(raw as CloudMode)) {
      const modes = CLOUD_MODES.join(', ');
      throw new ConfigError(`CCS_MODE must be one of ${modes}`);
    }
    return raw as CloudMode;
  }

  private static readCloud(reader: EnvReader): CloudConfig {
    const mode = ConfigLoader.readMode(reader);
    const online = mode !== 'offline';
    return {
      mode,
      url: reader.string('CCS_URL', CCS_DEFAULT_URL),
      login: online ? reader.required('CCS_LOGIN') : '',
      password: online ? reader.required('CCS_PASSWORD') : '',
    };
  }

  private static readOverrides(
    reader: EnvReader,
  ): Partial<Record<ZagFlag, boolean>> {
    const overrides: Partial<Record<ZagFlag, boolean>> = {};
    for (const pair of reader.list('STATE_OVERRIDES')) {
      const parts = pair.split('=').map((part) => part.trim());
      const name = parts[0];
      const value = parts[1];
      if (!ZAG_FLAGS.includes(name as ZagFlag)) {
        throw new ConfigError(`STATE_OVERRIDES: unknown flag "${name}"`);
      }
      if (value !== 'true' && value !== 'false') {
        throw new ConfigError(`STATE_OVERRIDES: ${name} must be true|false`);
      }
      overrides[name as ZagFlag] = value === 'true';
    }
    return overrides;
  }

  private static readPrograms(
    reader: EnvReader,
    online: boolean,
  ): Record<ZagFlag, string> {
    const programs = {} as Record<ZagFlag, string>;
    for (const flag of ZAG_FLAGS) {
      const key = PROGRAM_ENV[flag];
      const fallback = online ? CCS_STATE_PROGRAMS[flag] : `offline:${flag}`;
      programs[flag] = reader.string(key, fallback);
    }
    return programs;
  }

  // Same shape as the state group: project constants by default, env
  // overrides; an explicitly empty CCS_CONTROLS_GROUP disables the buttons.
  private static readControls(
    reader: EnvReader,
    mode: CloudMode,
  ): ControlsConfig {
    const online = mode !== 'offline';
    const fallback = online ? CCS_CONTROLS_GROUP_ID : 'offline:controls';
    const programs = {} as Record<ControlButton, string>;
    for (const button of Object.keys(CONTROL_ENV) as ControlButton[]) {
      const key = CONTROL_ENV[button];
      programs[button] = reader.string(key, CCS_CONTROL_PROGRAMS[button]);
    }
    return {
      groupID: reader.string('CCS_CONTROLS_GROUP', fallback) || null,
      programs,
    };
  }

  private static readState(reader: EnvReader, mode: CloudMode): StateConfig {
    const online = mode !== 'offline';
    return {
      groupID: reader.string(
        'CCS_STATE_GROUP',
        online ? CCS_STATE_GROUP_ID : 'offline:state',
      ),
      programs: ConfigLoader.readPrograms(reader, online),
      initial: online ? SAFE_INITIAL : OFFLINE_INITIAL,
      overrides: ConfigLoader.readOverrides(reader),
    };
  }
}
