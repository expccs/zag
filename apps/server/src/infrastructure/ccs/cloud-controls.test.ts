import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FacadeCommand } from '../../app/ports/facade-gateway';
import { StructuredLogger } from '../logging/structured-logger';
import { CompositeFacade } from '../facade/composite-facade';
import { OfflineFacade } from '../touch-designer/offline-facade';
import { CloudControls, type ControlsConfig } from './cloud-controls';
import { FakeCloudClient } from './fake-cloud-client';

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

const CONFIG: ControlsConfig = {
  groupID: 'g1',
  programs: {
    sessionStart: 'p-start',
    sessionEnd: 'p-end',
    fade: 'p-fade',
    idle: 'p-idle',
  },
};

const SESSION_JSON =
  '{"mode":"comet","params":{"head":"#FF7D65","tail":"#4BABD5"},"durationMs":40000}';

const START: FacadeCommand = {
  type: 'session:start',
  sessionId: 's1',
  mode: 'comet',
  params: { head: '#FF7D65', tail: '#4BABD5' },
  durationMs: 40_000,
};

const createControls = (config = CONFIG) => {
  const lines: string[] = [];
  const logger = new StructuredLogger({ write: (line) => lines.push(line) });
  const cloud = new FakeCloudClient({ logger, projectUID: 'zag' });
  const controls = new CloudControls(cloud, config, logger);
  return { cloud, controls, lines };
};

describe('CloudControls', () => {
  it('runs one button per facade command, JSON for the WITH_PARAMS ones', async () => {
    const { cloud, controls } = createControls();
    await cloud.connect();
    controls.command({ ...START, type: 'fade', durationMs: 5000 });
    controls.command(START);
    controls.command({
      type: 'session:end',
      sessionId: 's1',
      reason: 'completed',
    });
    controls.command({ type: 'drain' });
    await flush();
    const base = { projectUID: 'zag', groupID: 'g1' };
    assert.deepEqual(cloud.commands, [
      {
        ...base,
        programID: 'p-fade',
        params: [SESSION_JSON.replace('40000', '5000')],
      },
      { ...base, programID: 'p-start', params: [SESSION_JSON] },
      { ...base, programID: 'p-end', params: undefined },
      { ...base, programID: 'p-idle', params: undefined },
    ]);
    assert.equal(
      controls.stream({
        type: 'touch:event',
        sessionId: 's1',
        phase: 'begin',
        x: 0,
        y: 0,
        touch: 1,
      }),
      true,
    );
  });

  it('does nothing without a group id and warns when CCS is not logged in', async () => {
    const off = createControls({ ...CONFIG, groupID: null });
    off.controls.command(START);
    await flush();
    assert.equal(off.cloud.commands.length, 0);

    const { cloud, controls, lines } = createControls();
    const noLogin = Object.create(cloud) as FakeCloudClient;
    Object.defineProperty(noLogin, 'projectUID', { value: null });
    new CloudControls(noLogin, CONFIG, controls['logger']).command(START);
    await flush();
    assert.equal(cloud.commands.length, 0);
    assert.ok(lines.some((line) => line.includes('not logged in')));
  });

  it('logs a failed runProgram and carries on', async () => {
    const { cloud, controls, lines } = createControls();
    await cloud.connect();
    cloud.execCommand = async () => {
      throw new Error('boom');
    };
    controls.command(START);
    await flush();
    assert.ok(lines.some((line) => line.includes('ccs control failed')));
  });
});

describe('CompositeFacade', () => {
  it('fans commands out and streams only to the renderer', async () => {
    const quiet = new StructuredLogger({ write: () => {} });
    const renderer = new OfflineFacade(quiet);
    const { cloud, controls } = createControls();
    await cloud.connect();
    const facade = new CompositeFacade(renderer, controls);
    facade.connect();
    facade.command(START);
    facade.command({ type: 'drain' });
    await flush();
    assert.equal(cloud.commands.length, 2);
    assert.equal(
      facade.stream({
        type: 'touch:event',
        sessionId: 's1',
        phase: 'begin',
        x: 0.5,
        y: 0.5,
        touch: 1,
      }),
      true,
    );
    assert.equal(facade.isConnected, true);
    assert.equal(facade.droppedCount, 0);
    facade.close();
  });
});
