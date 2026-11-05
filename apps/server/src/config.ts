export interface ServerConfig {
  port: number;
  allowedOrigins: string[];
  /** Trust X-Forwarded-For from nginx on the same host. */
  trustProxy: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

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

const readList = (env: NodeJS.ProcessEnv, key: string): string[] => {
  const raw = env[key];
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const readBoolean = (
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean,
): boolean => {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') {
    throw new ConfigError(`${key} must be true|false`);
  }
  return raw === 'true';
};

export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig => ({
  port: readNumber(env, 'PORT', 8080),
  allowedOrigins: readList(env, 'ALLOWED_ORIGINS'),
  trustProxy: readBoolean(env, 'TRUST_PROXY', true),
});
