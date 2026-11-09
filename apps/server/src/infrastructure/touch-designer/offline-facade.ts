import type {
  FacadeCommand,
  FacadeGateway,
  FacadeTouch,
} from '../../app/ports/facade-gateway';
import type { Logger } from '../../app/ports/logger';

/**
 * `FacadeGateway` without a renderer (`TD_WS_URL` empty): commands are
 * logged, the touch stream is accepted silently.
 */
export class OfflineFacade implements FacadeGateway {
  readonly isConnected = true;
  readonly droppedCount = 0;

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  connect(): void {
    this.logger.info('facade offline: commands are logged only');
  }

  command(command: FacadeCommand): void {
    this.logger.info('facade command', { ...command });
  }

  stream(_touch: FacadeTouch): boolean {
    return this.isConnected;
  }

  close(): void {
    this.logger.info('facade offline: closed');
  }
}
