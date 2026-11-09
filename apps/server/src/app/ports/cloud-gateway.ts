import { EventEmitter } from 'node:events';
import type { InjectionToken } from 'tsyringe';
import type { Logger } from './logger';

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

/** Typed emitter base shared by the `CloudGateway` adapters. */
export class CloudEmitter extends EventEmitter<CloudEvents> {}

/**
 * Driven port: the ExpoLight Cloud Control System seen from the app.
 * Implemented by `infrastructure/ccs` (`CloudClient` for live / dry-run,
 * `FakeCloudClient` for offline and tests).
 */
export interface CloudGateway extends EventEmitter<CloudEvents> {
  readonly projectUID: string | null;
  readonly location: GeoCoordinates | null;
  readonly isConnected: boolean;
  connect(): Promise<void>;
  getPrograms(): Promise<ProgramGroup[]>;
  execCommand(reference: ProgramReference): Promise<unknown>;
  close(): void;
}

export const CLOUD_GATEWAY: InjectionToken<CloudGateway> =
  Symbol('CloudGateway');
