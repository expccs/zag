import type { InjectionToken } from 'tsyringe';

/** Build and run facts the use cases report but do not own. */
export interface AppInfo {
  version: string;
  /** `CCS_MODE` as configured: live / dry-run / offline. */
  ccsMode: string;
}

export const APP_INFO: InjectionToken<AppInfo> = Symbol('AppInfo');
