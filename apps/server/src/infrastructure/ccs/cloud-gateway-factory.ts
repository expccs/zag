import { ZAG_FLAGS } from '@zag/protocol';
import type {
  CloudGateway,
  CloudLogger,
  ProgramGroup,
} from '../../app/ports/cloud-gateway';
import type { StateConfig } from '../config/config';
import { CloudClient } from './cloud-client';
import { FakeCloudClient } from './fake-cloud-client';

export type CloudMode = 'live' | 'dry-run' | 'offline';

export const CLOUD_MODES: readonly CloudMode[] = ['live', 'dry-run', 'offline'];

export interface CloudConfig {
  mode: CloudMode;
  url: string;
  login: string;
  password: string;
}

/** Picks the gateway for `CCS_MODE`: fake for offline, real otherwise. */
export class CloudGatewayFactory {
  static create(
    config: CloudConfig,
    logger: CloudLogger,
    offlineGroups: ProgramGroup[] = [],
  ): CloudGateway {
    if (config.mode === 'offline') {
      return new FakeCloudClient({ logger, groups: offlineGroups });
    }
    const { login, password } = config;
    return new CloudClient({
      credentials: { login, password },
      serverUrl: config.url,
      execEnabled: config.mode === 'live',
      logger,
    });
  }

  /**
   * Offline: the fake CCS owns a state group built from the config so that
   * sync works and the app is "synced" with the offline initial flags.
   */
  static createOfflineGroup(state: StateConfig): ProgramGroup {
    return {
      _id: state.groupID,
      name: 'offline app state',
      projectID: 'offline-project',
      main: false,
      programs: ZAG_FLAGS.map((flag) => ({
        _id: state.programs[flag],
        name: flag,
        type: 'SWITCH',
        state: { value: state.initial[flag] ? 1 : 0 },
      })),
    };
  }
}
