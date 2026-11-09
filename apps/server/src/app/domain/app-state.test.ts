import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ZagFlag } from '@zag/protocol';
import type { ProgramGroup } from '../ports/cloud-gateway';
import { FakeCloudClient } from '../../infrastructure/ccs/fake-cloud-client';
import type { LogFields } from '../ports/logger';
import { StructuredLogger } from '../../infrastructure/logging/structured-logger';
import { ZagAppState } from './app-state';

interface LogRecord extends LogFields {
  level: string;
  message: string;
}

const PROGRAMS: Record<ZagFlag, string> = {
  techPause: 'p1',
  interactive: 'p2',
  locationRestriction: 'p3',
  schedule: 'p4',
};
const SAFE = {
  techPause: true,
  interactive: false,
  locationRestriction: true,
  schedule: false,
};

const program = (_id: string, value: number | null) => ({
  _id,
  name: _id,
  type: 'SWITCH',
  state: value === null ? null : { value },
});

const group = (
  _id: string,
  programs: ProgramGroup['programs'],
): ProgramGroup => ({
  _id,
  name: _id,
  projectID: 'proj',
  main: false,
  programs,
});

const createState = (overrides: Partial<Record<ZagFlag, boolean>> = {}) => {
  const records: LogRecord[] = [];
  const logger = new StructuredLogger({
    write: (line) => records.push(JSON.parse(line) as LogRecord),
  });
  const state = new ZagAppState({
    groupID: 'g',
    programs: PROGRAMS,
    initial: SAFE,
    overrides,
    logger,
  });
  return { state, records };
};

describe('app state', () => {
  it('serves the initial flags until synced', () => {
    const { state } = createState();
    assert.equal(state.isSynced, false);
    assert.deepEqual(state.snapshot, SAFE);
    assert.deepEqual(state.publicState, {
      flags: SAFE,
      screen: 'maintenance',
      synced: false,
    });
  });

  it('ignores a sync without its group and warns', () => {
    const { state, records } = createState();
    state.sync([group('other', [])]);
    assert.equal(state.isSynced, false);
    const warning = records.find(
      (r) => r.message === 'state group not found in CCS',
    );
    assert.ok(warning);
    assert.deepEqual(warning.available, ['other']);
  });

  it('syncs from the CCS group, skipping unknown and stateless programs', () => {
    const { state } = createState({ schedule: false });
    const events: string[] = [];
    state.on('change', (_flags, changed) => events.push(changed.join('+')));
    state.on('synced', () => events.push('synced'));

    state.sync([
      group('other', []),
      group('g', [
        program('p1', 0),
        program('p2', 1),
        program('p3', 1),
        program('p4', 1),
        program('zzz', 1),
        program('button', null),
      ]),
    ]);

    assert.equal(state.isSynced, true);
    assert.deepEqual(state.snapshot, {
      techPause: false,
      interactive: true,
      locationRestriction: true,
      schedule: false, // override wins over CCS value 1
    });
    assert.equal(state.get('schedule'), false);
    assert.deepEqual(events, ['techPause+interactive+schedule', 'synced']);
  });

  it('emits change only when a value really changes', () => {
    const { state } = createState();
    const events: ZagFlag[][] = [];
    state.on('change', (_flags, changed) => events.push(changed));

    const first = state.apply([
      { programID: 'p3', value: 0 },
      { programID: 'p3', value: 0 },
    ]);
    const second = state.apply([{ programID: 'p3', value: 0 }]);
    const unknown = state.apply([{ programID: 'nope', value: 1 }]);

    assert.deepEqual(first, ['locationRestriction']);
    assert.deepEqual(second, []);
    assert.deepEqual(unknown, []);
    assert.deepEqual(events, [['locationRestriction']]);
  });

  it('builds a command reference for writing a flag back to CCS', () => {
    const { state } = createState();
    assert.deepEqual(state.reference('proj', 'techPause', true), {
      projectUID: 'proj',
      groupID: 'g',
      programID: 'p1',
      params: [1],
    });
    assert.deepEqual(state.reference('proj', 'interactive', false).params, [0]);
  });

  it('follows programStateChange events of a bound gateway', async () => {
    const { state } = createState();
    const cloud = new FakeCloudClient({
      logger: new StructuredLogger({ write: () => {} }),
      groups: [group('g', [program('p1', 1), program('p2', 0)])],
    });
    state.bind(cloud);
    await cloud.connect();
    state.sync(await cloud.getPrograms());
    const screens: string[] = [];
    state.on('change', () => screens.push(state.publicState.screen));

    cloud.setProgramState('p1', 0); // techPause off → still disabled
    cloud.setProgramState('p2', 1); // interactive on
    cloud.setProgramState('p4', 1); // schedule on
    cloud.setProgramState('p4', 1); // no change

    assert.deepEqual(screens, ['disabled', 'interactive', 'schedule']);
  });
});

describe('ZagAppState.resolveScreen', () => {
  it('ranks techPause over interactive over schedule', () => {
    const resolve = ZagAppState.resolveScreen;
    const base = { ...SAFE, techPause: false, interactive: true };
    assert.equal(resolve({ ...base, techPause: true }), 'maintenance');
    assert.equal(resolve({ ...base, interactive: false }), 'disabled');
    assert.equal(resolve({ ...base, schedule: true }), 'schedule');
    assert.equal(resolve(base), 'interactive');
    assert.equal(
      resolve({ ...base, techPause: true, schedule: true }),
      'maintenance',
    );
  });
});
