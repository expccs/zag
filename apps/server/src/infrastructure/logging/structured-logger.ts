import { inspect } from 'node:util';
import type { LogFields, LogLevel, Logger } from '../../app/ports/logger';

export type LogWriter = (line: string) => void;

export interface LoggerOptions {
  write?: LogWriter;
  pretty?: boolean;
  fields?: LogFields;
}

/**
 * `Logger` adapter that writes one JSON object per line so Docker /
 * journald / Loki can index the fields; `pretty` is for local `dev`.
 */
export class StructuredLogger implements Logger {
  private readonly write: LogWriter;
  private readonly pretty: boolean;
  private readonly bound: LogFields;

  constructor(options: LoggerOptions = {}) {
    this.write = options.write ?? StructuredLogger.writeStdout;
    this.pretty = options.pretty ?? false;
    this.bound = options.fields ?? {};
  }

  log(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }

  child(fields: LogFields): Logger {
    return new StructuredLogger({
      write: this.write,
      pretty: this.pretty,
      fields: { ...this.bound, ...fields },
    });
  }

  private emit(level: LogLevel, message: string, fields?: LogFields): void {
    const merged = { ...this.bound, ...fields };
    const line = this.pretty
      ? StructuredLogger.formatPretty(level, message, merged)
      : StructuredLogger.formatJson(level, message, merged);
    this.write(line);
  }

  private static writeStdout(line: string): void {
    process.stdout.write(`${line}\n`);
  }

  private static serializeValue(value: unknown): unknown {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  }

  private static formatJson(
    level: LogLevel,
    message: string,
    fields: LogFields,
  ): string {
    const time = new Date().toISOString();
    const record: LogFields = { level, time, message };
    for (const key of Object.keys(fields)) {
      record[key] = StructuredLogger.serializeValue(fields[key]);
    }
    return JSON.stringify(record);
  }

  private static formatPretty(
    level: LogLevel,
    message: string,
    fields: LogFields,
  ): string {
    const time = new Date().toISOString().slice(11, 19);
    const tag = level.toUpperCase().padEnd(5);
    const keys = Object.keys(fields);
    if (keys.length === 0) return `${time} ${tag} ${message}`;
    const details = inspect(fields, { breakLength: Infinity, depth: 4 });
    return `${time} ${tag} ${message} ${details}`;
  }
}
