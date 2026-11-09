import type { CloudGateway } from '../../app/ports/cloud-gateway';
import type {
  FacadeCommand,
  FacadeGateway,
  FacadeTouch,
  SessionStartCommand,
} from '../../app/ports/facade-gateway';
import type { Logger } from '../../app/ports/logger';

export interface ControlsConfig {
  /** `_id` of the «Public app controls» group; null disables the buttons. */
  groupID: string | null;
  programs: {
    /** `WITH_PARAMS` button: one JSON string with the session. */
    sessionStart: string;
    /** Plain `COMMAND` button. */
    sessionEnd: string;
  };
}

/**
 * `FacadeGateway` through CCS (docs/backend/ccs-ids.md): the «Public app
 * controls» buttons of the ZAG project. `session:start` runs the
 * `WITH_PARAMS` button with `params: [JSON]` of `{ mode, params,
 * durationMs }`, `session:end` runs the plain `COMMAND` button; `fade` and
 * `drain` have no button and the touch stream never goes through CCS.
 * Runs fire and forget: a failed `runProgram` is logged, the session goes
 * on (TouchDesigner gets the same commands directly).
 */
export class CloudControls implements FacadeGateway {
  readonly droppedCount = 0;

  private readonly cloud: CloudGateway;
  private readonly config: ControlsConfig;
  private readonly logger: Logger;

  constructor(cloud: CloudGateway, config: ControlsConfig, logger: Logger) {
    this.cloud = cloud;
    this.config = config;
    this.logger = logger;
  }

  get isConnected(): boolean {
    return this.cloud.isConnected;
  }

  connect(): void {
    this.logger.info('ccs controls enabled', { groupID: this.config.groupID });
  }

  command(command: FacadeCommand): void {
    if (command.type === 'session:start') {
      const payload = CloudControls.sessionPayload(command);
      void this.run(this.config.programs.sessionStart, [payload], command);
    } else if (command.type === 'session:end') {
      void this.run(this.config.programs.sessionEnd, undefined, command);
    }
  }

  /** Points never go through CCS; the composite streams to the renderer. */
  stream(_touch: FacadeTouch): boolean {
    return this.config.groupID !== null;
  }

  close(): void {
    this.logger.info('ccs controls closed');
  }

  /** What the `WITH_PARAMS` button receives as `params[0]`. */
  static sessionPayload(command: SessionStartCommand): string {
    const { mode, params, durationMs } = command;
    return JSON.stringify({ mode, params, durationMs });
  }

  private async run(
    programID: string,
    params: (number | string)[] | undefined,
    command: FacadeCommand,
  ): Promise<void> {
    const { groupID } = this.config;
    const { projectUID } = this.cloud;
    if (!groupID) return;
    if (!projectUID) {
      this.logger.warn('ccs control skipped: not logged in', {
        type: command.type,
      });
      return;
    }
    const reference = { projectUID, groupID, programID, params };
    try {
      await this.cloud.execCommand(reference);
      this.logger.info('ccs control', { type: command.type, programID });
    } catch (error) {
      this.logger.error('ccs control failed', {
        type: command.type,
        programID,
        error,
      });
    }
  }
}
