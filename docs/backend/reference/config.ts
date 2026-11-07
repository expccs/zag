import type { GeoCoordinates } from './cloud-client';

export type ZagFlag =
  | 'techPause'
  | 'interactive'
  | 'locationRestriction'
  | 'schedule';

export const ZAG_FLAGS: readonly ZagFlag[] = [
  'techPause',
  'interactive',
  'locationRestriction',
  'schedule',
];

export type CloudMode = 'live' | 'dry-run' | 'offline';

export interface BackendConfig {
  port: number;
  cloud: {
    mode: CloudMode;
    url: string;
    login: string;
    password: string;
    project: string;
    groupID: string;
    programs: Record<ZagFlag, string>;
  };
  state: {
    initial: Record<ZagFlag, boolean>;
    overrides: Partial<Record<ZagFlag, boolean>>;
  };
  geo: {
    radiusM: number;
    accuracyToleranceM: number;
    center: GeoCoordinates | undefined;
  };
  touchDesigner: {
    url: string | null;
    pingIntervalMs: number;
  };
  queue: {
    sessionMs: number;
    gapMs: number;
    disconnectGraceMs: number;
  };
}

const CLOUD_MODES: readonly CloudMode[] = ['live', 'dry-run', 'offline'];

const PROGRAM_ENV: Record<ZagFlag, string> = {
  techPause: 'CCS_PROGRAM_TECH_PAUSE',
  interactive: 'CCS_PROGRAM_INTERACTIVE',
  locationRestriction: 'CCS_PROGRAM_LOCATION_RESTRICTION',
  schedule: 'CCS_PROGRAM_SCHEDULE',
};

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

const readString = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (!value) throw new ConfigError(`${key} is required`);
  return value;
};

const readNumber = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number => {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ConfigError(`${key} must be a number`);
  return value;
};

const readMode = (env: NodeJS.ProcessEnv): CloudMode => {
  const raw = env.CCS_MODE ?? 'live';
  if (!CLOUD_MODES.includes(raw as CloudMode)) {
    throw new ConfigError(`CCS_MODE must be one of ${CLOUD_MODES.join(', ')}`);
  }
  return raw as CloudMode;
};

const readCenter = (env: NodeJS.ProcessEnv): GeoCoordinates | undefined => {
  const raw = env.GEO_CENTER;
  if (!raw) return undefined;
  const parts = raw.split(',').map((part) => Number(part.trim()));
  const latitude = parts[0];
  const longitude = parts[1];
  if (parts.length !== 2 || !isFinite(latitude) || !isFinite(longitude)) {
    throw new ConfigError('GEO_CENTER must be "lat,lng"');
  }
  return { latitude, longitude };
};

const readOverrides = (
  env: NodeJS.ProcessEnv,
): Partial<Record<ZagFlag, boolean>> => {
  const raw = env.STATE_OVERRIDES;
  const overrides: Partial<Record<ZagFlag, boolean>> = {};
  if (!raw) return overrides;
  for (const pair of raw.split(',')) {
    const [name, value] = pair.split('=').map((part) => part.trim());
    if (!ZAG_FLAGS.includes(name as ZagFlag)) {
      throw new ConfigError(`STATE_OVERRIDES: unknown flag "${name}"`);
    }
    if (value !== 'true' && value !== 'false') {
      throw new ConfigError(`STATE_OVERRIDES: ${name} must be true|false`);
    }
    overrides[name as ZagFlag] = value === 'true';
  }
  return overrides;
};

const readPrograms = (
  env: NodeJS.ProcessEnv,
  required: boolean,
): Record<ZagFlag, string> => {
  const programs = {} as Record<ZagFlag, string>;
  for (const flag of ZAG_FLAGS) {
    const key = PROGRAM_ENV[flag];
    const fallback = `offline:${flag}`;
    programs[flag] = required ? readString(env, key) : env[key] || fallback;
  }
  return programs;
};

export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig => {
  const mode = readMode(env);
  const online = mode !== 'offline';
  return {
    port: readNumber(env, 'PORT', 8080),
    cloud: {
      mode,
      url: env.CCS_URL ?? 'https://admin.expolightcontrols.net',
      login: online ? readString(env, 'CCS_LOGIN') : '',
      password: online ? readString(env, 'CCS_PASSWORD') : '',
      project: online ? readString(env, 'CCS_PROJECT') : '',
      groupID: online ? readString(env, 'CCS_STATE_GROUP') : '',
      programs: readPrograms(env, online),
    },
    state: {
      initial: online ? SAFE_INITIAL : OFFLINE_INITIAL,
      overrides: readOverrides(env),
    },
    geo: {
      radiusM: readNumber(env, 'GEO_RADIUS_M', 100),
      accuracyToleranceM: readNumber(env, 'GEO_ACCURACY_TOLERANCE_M', 30),
      center: readCenter(env),
    },
    touchDesigner: {
      url: env.TD_WS_URL || null,
      pingIntervalMs: readNumber(env, 'TD_PING_INTERVAL_MS', 30_000),
    },
    queue: {
      sessionMs: readNumber(env, 'SESSION_MS', 40_000),
      gapMs: readNumber(env, 'SESSION_GAP_MS', 5_000),
      disconnectGraceMs: readNumber(env, 'DISCONNECT_GRACE_MS', 10_000),
    },
  };
};
