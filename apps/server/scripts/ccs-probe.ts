// Lists CCS program groups and programs of the configured project so the
// `_id`s for CCS_STATE_GROUP / CCS_PROGRAM_* can be copied into .env.
// Reads CCS_* from the root .env; always runs in dry-run (never executes).
//   npm run ccs:probe -w @zag/server
import type { ProgramGroup } from '../src/app/ports/cloud-gateway';
import { CloudGatewayFactory } from '../src/infrastructure/ccs/cloud-gateway-factory';
import { ConfigLoader } from '../src/infrastructure/config/config';
import { StructuredLogger } from '../src/infrastructure/logging/structured-logger';

class CcsProbe {
  static async main(): Promise<void> {
    try {
      await CcsProbe.run();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  static async run(): Promise<void> {
    const { cloud: cloudConfig } = ConfigLoader.load();
    if (cloudConfig.mode === 'offline') {
      throw new Error(
        'CCS_MODE=offline: set CCS_MODE=dry-run, CCS_LOGIN and CCS_PASSWORD',
      );
    }
    const logger = new StructuredLogger({ pretty: true });
    const config = { ...cloudConfig, mode: 'dry-run' as const };
    const cloud = CloudGatewayFactory.create(config, logger);
    await cloud.connect();
    const groups = await cloud.getPrograms();
    console.log(`\nproject ${cloud.projectUID}: ${groups.length} groups`);
    for (const group of groups) CcsProbe.printGroup(group);
    cloud.close();
  }

  private static printGroup(group: ProgramGroup): void {
    const main = group.main ? ' (main)' : '';
    console.log(`\n${group._id}  ${group.name}${main}`);
    for (const program of group.programs) {
      const type = program.type.padEnd(11);
      const value = program.state ? `value=${program.state.value}` : 'button ';
      console.log(`  ${program._id}  ${type} ${value}  ${program.name}`);
    }
  }
}

void CcsProbe.main();
