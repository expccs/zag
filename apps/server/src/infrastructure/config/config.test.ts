import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CCS_STATE_GROUP_ID, CCS_STATE_PROGRAMS } from '../ccs/ccs-ids';
import { ConfigError, ConfigLoader } from './config';

const ONLINE = {
  CCS_MODE: 'dry-run',
  CCS_LOGIN: 'zag',
  CCS_PASSWORD: 'secret',
};

describe('ConfigLoader', () => {
  it('offline needs no CCS values and starts interactive', () => {
    const config = ConfigLoader.load({ CCS_MODE: 'offline' });
    assert.equal(config.port, 8080);
    assert.equal(config.cloud.mode, 'offline');
    assert.equal(config.state.groupID, 'offline:state');
    assert.equal(config.state.programs.techPause, 'offline:techPause');
    assert.equal(config.state.initial.interactive, true);
    assert.deepEqual(config.session, {
      sessionMs: 40_000,
      fadeMs: 5_000,
      disconnectGraceMs: 10_000,
    });
    assert.deepEqual(config.facade, { url: null, pingIntervalMs: 30_000 });
  });

  it('defaults to live and requires the CCS account', () => {
    assert.throws(() => ConfigLoader.load({}), {
      name: 'ConfigError',
      message: 'CCS_LOGIN is required',
    });
    assert.throws(
      () => ConfigLoader.load({ CCS_MODE: 'nope' }),
      (error: unknown) =>
        error instanceof ConfigError && /CCS_MODE must be/.test(error.message),
    );
  });

  it('uses the project constants for the state group online', () => {
    const config = ConfigLoader.load(ONLINE);
    assert.equal(config.state.groupID, CCS_STATE_GROUP_ID);
    assert.deepEqual(config.state.programs, CCS_STATE_PROGRAMS);
    assert.equal(config.state.initial.techPause, true);
    assert.deepEqual(config.state.overrides, {});
  });

  it('lets env override the constants and parses overrides', () => {
    const config = ConfigLoader.load({
      ...ONLINE,
      CCS_STATE_GROUP: 'g2',
      CCS_PROGRAM_SCHEDULE: 'p-sched',
      STATE_OVERRIDES: 'interactive=true, schedule=false',
      ALLOWED_ORIGINS: 'https://a, https://b',
      TRUST_PROXY: 'false',
      PORT: '9000',
      SESSION_MS: '150',
      FADE_MS: '30',
      TD_WS_URL: 'ws://10.0.0.5:85',
      TD_PING_INTERVAL_MS: '5000',
      DISCONNECT_GRACE_MS: '80',
    });
    assert.equal(config.state.groupID, 'g2');
    assert.equal(config.state.programs.schedule, 'p-sched');
    assert.equal(config.state.programs.techPause, CCS_STATE_PROGRAMS.techPause);
    assert.deepEqual(config.state.overrides, {
      interactive: true,
      schedule: false,
    });
    assert.deepEqual(config.allowedOrigins, ['https://a', 'https://b']);
    assert.equal(config.trustProxy, false);
    assert.equal(config.port, 9000);
    assert.deepEqual(config.session, {
      sessionMs: 150,
      fadeMs: 30,
      disconnectGraceMs: 80,
    });
    assert.deepEqual(config.facade, {
      url: 'ws://10.0.0.5:85',
      pingIntervalMs: 5000,
    });
  });

  it('rejects malformed values', () => {
    const bad = (env: Record<string, string>, pattern: RegExp) =>
      assert.throws(
        () => ConfigLoader.load({ ...ONLINE, ...env }),
        (error: unknown) =>
          error instanceof ConfigError && pattern.test(error.message),
      );
    bad({ STATE_OVERRIDES: 'foo=true' }, /unknown flag "foo"/);
    bad({ STATE_OVERRIDES: 'schedule=yes' }, /schedule must be true\|false/);
    bad({ PORT: 'abc' }, /PORT must be a number/);
    bad({ SESSION_MS: 'soon' }, /SESSION_MS must be a number/);
    bad({ TRUST_PROXY: '1' }, /TRUST_PROXY must be true\|false/);
  });
});
