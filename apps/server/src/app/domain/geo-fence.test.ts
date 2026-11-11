import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FakeCloudClient } from '../../infrastructure/ccs/fake-cloud-client';
import { CloudEmitter, type CloudGateway } from '../ports/cloud-gateway';
import { GeoFence } from './geo-fence';

// Lviv, ZAG facade neighbourhood; the second point is ~111 m east.
const CENTER = { latitude: 49.8397, longitude: 24.0297 };
const EAST_111M = { latitude: 49.8397, longitude: 24.03124 };
const KYIV = { latitude: 50.4501, longitude: 30.5234 };

describe('GeoFence', () => {
  it('measures the haversine distance', () => {
    const d = GeoFence.haversineDistanceM(CENTER, KYIV);
    // Known great-circle distance Lviv – Kyiv ≈ 468 km.
    assert.ok(d > 466_000 && d < 470_000, `${d}`);
    assert.equal(Math.round(GeoFence.haversineDistanceM(CENTER, CENTER)), 0);
  });

  it('judges a sample by radius and GPS accuracy', () => {
    const fence = new GeoFence({
      radiusM: 100,
      accuracyToleranceM: 30,
      center: CENTER,
    });
    assert.deepEqual(fence.check(CENTER), {
      allowed: true,
      distanceM: 0,
      reason: 'ok',
    });
    const far = fence.check(EAST_111M);
    assert.equal(far.allowed, false);
    assert.equal(far.reason, 'too-far');
    assert.ok(far.distanceM > 105 && far.distanceM < 120, `${far.distanceM}`);
    // A 20 m fix widens the zone to 120 m; a 60 m fix only to 130 m.
    assert.equal(fence.check({ ...EAST_111M, accuracy: 20 }).allowed, true);
    assert.equal(fence.check({ ...KYIV, accuracy: 1_000_000 }).allowed, false);
  });

  it('answers no-center and invalid without a distance', () => {
    const fence = new GeoFence({ radiusM: 100 });
    assert.deepEqual(fence.check(CENTER), {
      allowed: false,
      distanceM: -1,
      reason: 'no-center',
    });
    fence.setCenter(CENTER);
    assert.equal(fence.hasCenter, true);
    assert.deepEqual(fence.check({ latitude: 91, longitude: 0 }), {
      allowed: false,
      distanceM: -1,
      reason: 'invalid',
    });
    assert.deepEqual(fence.check({ latitude: Number.NaN, longitude: 0 }), {
      allowed: false,
      distanceM: -1,
      reason: 'invalid',
    });
  });

  it('takes the centre from a cloud that already logged in', () => {
    const cloud = new FakeCloudClient({
      logger: console,
      location: CENTER,
    });
    const late = new GeoFence({ radiusM: 100 }).bind(cloud);
    assert.equal(late.hasCenter, true);
    const notYet = Object.assign(new CloudEmitter(), { location: null });
    const early = new GeoFence({ radiusM: 100 }).bind(
      notYet as unknown as CloudGateway,
    );
    assert.equal(early.hasCenter, false);
  });

  it('keeps a fixed centre over the CCS login', () => {
    const fence = new GeoFence({ radiusM: 100, center: CENTER });
    fence.setCenter(KYIV);
    assert.equal(fence.check(CENTER).allowed, true);
    const open = new GeoFence({ radiusM: 1 });
    assert.throws(
      () => open.setCenter({ latitude: 95, longitude: 0 }),
      /invalid coordinates/,
    );
  });
});
