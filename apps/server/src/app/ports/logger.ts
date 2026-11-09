import type { InjectionToken } from 'tsyringe';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

/**
 * Driven port: structured logging. Console-compatible (`log` / `warn` /
 * `error`) so the modules of docs/backend/reference can take it as a
 * `Pick<Console, ...>`; `child` binds fields such as `{ module }`.
 */
export interface Logger {
  log(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export const LOGGER: InjectionToken<Logger> = Symbol('Logger');
