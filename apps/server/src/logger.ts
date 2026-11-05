import { inspect } from 'node:util';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

/**
 * Console-compatible logger (same shape the reference modules expect via
 * `Pick<Console, 'log' | 'warn' | 'error'>`) that writes one JSON object
 * per line so Docker / journald / Loki can index the fields.
 */
export interface Logger {
  log(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  write?: (line: string) => void;
  pretty?: boolean;
  fields?: LogFields;
}

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
};

const formatJson = (
  level: LogLevel,
  message: string,
  fields: LogFields,
): string => {
  const record: LogFields = { level, time: new Date().toISOString(), message };
  for (const key of Object.keys(fields)) {
    record[key] = serializeValue(fields[key]);
  }
  return JSON.stringify(record);
};

const formatPretty = (
  level: LogLevel,
  message: string,
  fields: LogFields,
): string => {
  const time = new Date().toISOString().slice(11, 19);
  const tag = level.toUpperCase().padEnd(5);
  const keys = Object.keys(fields);
  if (keys.length === 0) return `${time} ${tag} ${message}`;
  const details = inspect(fields, { breakLength: Infinity, depth: 4 });
  return `${time} ${tag} ${message} ${details}`;
};

const defaultWrite = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

export const createLogger = (options: LoggerOptions = {}): Logger => {
  const write = options.write ?? defaultWrite;
  const pretty = options.pretty ?? false;
  const format = pretty ? formatPretty : formatJson;
  const bound = options.fields ?? {};

  const emit = (level: LogLevel, message: string, fields?: LogFields) => {
    write(format(level, message, { ...bound, ...fields }));
  };

  return {
    log: (message, fields) => emit('info', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (fields) =>
      createLogger({ write, pretty, fields: { ...bound, ...fields } }),
  };
};
