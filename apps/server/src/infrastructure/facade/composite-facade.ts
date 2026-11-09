import type {
  FacadeCommand,
  FacadeGateway,
  FacadeTouch,
} from '../../app/ports/facade-gateway';

/**
 * Fans every command out to several `FacadeGateway`s (TouchDesigner and the
 * CCS buttons). The touch stream, connection state and drop counter belong
 * to the first gateway: that is the renderer the points go to.
 */
export class CompositeFacade implements FacadeGateway {
  private readonly primary: FacadeGateway;
  private readonly all: readonly FacadeGateway[];

  constructor(primary: FacadeGateway, ...others: FacadeGateway[]) {
    this.primary = primary;
    this.all = [primary, ...others];
  }

  get isConnected(): boolean {
    return this.primary.isConnected;
  }

  get droppedCount(): number {
    return this.primary.droppedCount;
  }

  connect(): void {
    for (const gateway of this.all) gateway.connect();
  }

  command(command: FacadeCommand): void {
    for (const gateway of this.all) gateway.command(command);
  }

  stream(touch: FacadeTouch): boolean {
    return this.primary.stream(touch);
  }

  close(): void {
    for (const gateway of this.all) gateway.close();
  }
}
